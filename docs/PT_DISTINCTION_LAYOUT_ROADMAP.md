# Build Roadmap — PT Distinction Layout & IA Parity (revised)

## What changed since the first pass

The first version of this doc treated PT Distinction's per-client tabs as a source of
individual features to cherry-pick, bolted onto our existing design (coach-viewing-a-client
reuses the client's own `DashboardShell`). Clarified goal: **the coach-side information
architecture itself should match PT Distinction's shape** — a dedicated per-client workspace,
not a client-mirrored view with a few extras added. This revision restructures around that.
The underlying schema ideas from the first pass (Notes/Goals/Injuries, the activity feed)
carry over unchanged; what's different is where they live and how much else now needs to
change around them.

## The core structural change

**A coach viewing a client currently lands on that client's own `DashboardShell`** —
Home/Nutrition/Training/Accountability/Progress, the same categories the client sees,
read-mostly (`app/coach/clients/[clientId]/page.tsx` → `DashboardShell` with
`isCoachView={true}`).

**New:** a dedicated coach-only workspace, `CoachClientWorkspace`, replacing that reuse
entirely for the coach's view. Six tabs, matching PT Distinction's: **Activity / Schedule /
Items / Tools / Communications / Info.** The client's own dashboard is completely untouched —
this only changes what the *coach* sees when they click into a client. (Tools is the one
exception that reaches back into client-facing behavior — see below.)

---

## Tab by tab

### Info
Goals / Injuries / Notes, coach-private (client never sees these), plus the existing
`client_profiles` calculation-engine fields (age, weights, measurements) surfaced here instead
of only living under Setup.

**Schema:** one new table —
```sql
create table client_journal_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  kind text not null check (kind in ('note', 'goal', 'injury')),
  body text not null,
  created_at timestamptz default now()
);
```
RLS: `is_coach_of(client_id)` alone, for every operation — the first table in the schema to
use that function standalone rather than composed inside `owns_client()`, so the client can
never read it even directly. (`is_coach_of` already exists in `supabase/schema.sql`.)

**Data layer:** `lib/data/clientJournal.ts` (new) — `getJournalEntries`, `addJournalEntry`,
`deleteJournalEntry`, plain CRUD.

### Schedule
Calendar of this client's upcoming classes and workout program days.

**Schema: none.** `bookings` and `workout_program_days` already carry everything needed —
this is a rendering problem, not a data problem. Cheapest tab to build after Info.

### Items
One consolidated, PT-Distinction-style list of everything assigned to this client — programs,
forms, education courses, habits — instead of scattered across separate categories the way the
client-mirrored view currently shows them.

**Schema: none.** New aggregating query joining `getPrograms`, `getFormTemplates` +
`getClientFormAssignments`, `getCourses` + `getClientCourseAssignments`, `getHabitsWithLogs` —
all already exist. Row shape mirrors PT Distinction's Items list: name, type icon, "Modified
[date]", status, click-through.

### Activity
Chronological cross-event feed scoped to this client (and, unscoped, becomes the coach
dashboard's primary content — see below).

**Schema:** one small additive migration — `food_diary_entries` has no timestamp column today
(confirmed against `supabase/schema.sql`), so per-entry events ("added Dinner") aren't
derivable without one: `alter table food_diary_entries add column created_at timestamptz
default now();`. Every other source table already has a usable timestamp
(`measurement_logs.created_at`, `habit_logs.created_at`, `workout_logs.logged_at`,
`progress_photos.created_at`, `bookings.created_at`).

**New RPC**, `get_recent_client_activity` — a `union all` across those six tables, not
security-definer (mirrors `get_client_last_active` in `0010_client_last_active.sql`, so it
runs under the caller's own RLS and a coach automatically only ever sees their own clients'
rows with no manual filtering).

### Tools — real per-client toggles
Per your call: not a read-only status view, actual enable/disable. This is the one tab that
reaches back into the *client's* own dashboard, not just the coach's workspace, so it's the
riskiest and most invasive tab — sequenced last for that reason.

**Schema:** a sparse opt-out table, not a settings row per client — no row means enabled,
which keeps every existing client backward-compatible with zero migration of existing data:
```sql
create table client_disabled_screens (
  client_id uuid not null references profiles(id) on delete cascade,
  screen text not null,
  primary key (client_id, screen)
);
```

**Client-facing change required:** `screensForCategory(category, isCoachView)` in
`app/dashboard/_components/categories.ts` currently returns a static list per category. It
needs a third argument, `disabledScreens: Set<Screen>`, and filters its static return list
against it. `BOTTOM_TAB_CATEGORIES` rendering in `DashboardShell.tsx` also needs to skip
rendering a whole category if every screen inside it ends up disabled (e.g. Nutrition with
Food Tracking, Meal Planner, and Recipes all off).

**Scope of what's toggleable:** content/tracking screens only — Food Tracking, Meal Planner,
Recipes, Workout, Activity, Weekly Log, Forms, Education, Insights, Overview, Progress &
Photos. Core infrastructure screens (Today, Setup, Account, Credits, Messages) stay always-on
— matches PT Distinction's own Tools tab, which only ever toggles tracking modules, never
account/billing screens.

**UI:** one card per disableable screen with a toggle switch and a short status line pulled
from data that already exists (Food Tracking → last diary entry date, Progress & Photos →
photo count, Education → course completion %, Habits → active habit count) — same visual
shape as PT Distinction's Tools cards.

### Communications
Message history with this client, inline in the workspace instead of only reachable via the
separate `/coach/messages` page.

**Schema: none** for history — `chat_messages` already has everything needed, this is a
rendering change (reuse the existing chat thread component, scoped to one client, inside this
tab). A "Scheduled" sub-view (PT Distinction's other half of this tab) stays a future item —
it depends on `docs/GAP_ROADMAP.md`'s Phase 4 (retention automation) actually existing first;
don't build a fake "Scheduled" list ahead of real scheduling capability.

---

## Also part of "identical layout": dashboard, Messages, Groups

- **Coach dashboard** (`app/coach/page.tsx`): switch to activity-feed-first, matching PT
  Distinction's actual primary content — the new cross-client `get_recent_client_activity` RPC
  (built for the Activity tab above) feeds a feed component above/beside the existing
  `ClientTable`/`ProgramHealth`, which stay as secondary content exactly like PT Distinction's
  own right-rail widgets.
- **Messages**: convert `CoachMessagesButton` from a link to `/coach/messages` into a
  slide-over drawer, matching PT Distinction's overlay-from-anywhere pattern instead of a full
  page navigation.
- **Groups**: a segmentation primitive — `client_groups` + `client_group_members`, coach-owned,
  filterable on `ClientTable.tsx`. Scoped narrower than `GAP_ROADMAP.md`'s existing Phase 6
  (which is about shared-program individualization, a bigger and separate lift this doesn't
  block on).

---

## Sequencing

Ordered so each phase proves the new shell incrementally, saving the one client-facing-
behavior change (Tools) for after the shell itself is stable:

1. **New `CoachClientWorkspace` shell + Info tab.** Establishes the six-tab structure itself
   with the cheapest, lowest-risk content (no schema risk beyond one new coach-private table).
2. **Schedule + Items tabs.** Zero new schema for either — pure aggregation over data that
   already exists, fills out the shell fast.
3. **Activity tab + dashboard activity feed.** Bigger — new RPC, touches more tables, but still
   fully additive (one new timestamp column, nothing removed or changed).
4. **Tools tab with real toggles.** Saved for last because it's the only phase that changes
   client-facing dashboard behavior (`categories.ts`, `DashboardShell.tsx`) rather than only
   adding a new coach-side surface — worth doing once the rest of the workspace is proven out.
5. **Communications tab** (message history inline) — small, can also be pulled earlier if
   wanted since it has no dependencies on the other phases.
6. **Dashboard activity-first redesign, Messages-as-drawer, Groups** — independent of the
   per-client workspace phases above, can be interleaved wherever convenient.

## Status

**Phase 1 — shipped.** `CoachClientWorkspace` (`app/coach/_components/CoachClientWorkspace.tsx`)
replaces `DashboardShell` on `/coach/clients/[clientId]` entirely — a coach viewing a client no
longer sees the client's own dashboard. All six tabs render (`WorkspaceTabBar`); Info has real
content (`InfoTab.tsx` — Notes/Goals/Injuries, backed by `client_journal_entries`, migration
`0027_client_journal.sql`); the other five show a "coming in a future phase" placeholder.
Verified with disposable test accounts: add/delete persists across reload, `CoachBottomTabBar`
now gives mobile nav while viewing a client (previously had none at all), and RLS was checked
directly (not just through the UI) — an unrelated coach gets 0 rows and a blocked insert, and
even the client themself gets 0 rows on their own journal, confirming this is genuinely the
first fully coach-only, client-invisible table in the schema. Deployed to production.

**Known accepted regression:** the per-client mobile Messages shortcut is gone until the
Communications tab (Phase 5) exists — the header Messages icon now links to the global
`/coach/messages` inbox instead of jumping straight into this client's thread.

**Phase 2 — shipped.** Schedule (`ScheduleTab.tsx` — upcoming class bookings + the active
program's current week's training days, via the existing `resolveActiveProgram` check-in
resolver) and Items (`ItemsTab.tsx` — one consolidated, newest-first list across programs,
forms, education, and habits) both wired up, zero new schema. Confirmed mid-plan that Phase 1
left several management screens (`WorkoutTab`, `FormsTab`, `EducationTab`, `CreditsTab`,
`SetupTab`, etc.) unreachable from the coach's per-client view — you chose to proceed with
Phase 2 as scoped rather than fix that now, so both tabs stay read-only/informational this
phase, no click-through management yet. `DashboardShell.tsx` and everything it renders remain
untouched, so the client's own `/dashboard` is unaffected and a full revert stays possible.
Verified with a seeded test account (workout program, class booking, form assignments, an
education course, a habit) and cross-checked every number against the client's own dashboard
(program day count, 50% course completion) — all matched. Deployed to production.

**Phase 3 — shipped.** One new RPC, `get_recent_client_activity` (migration
`0028_activity_feed.sql`, alongside one additive column — `food_diary_entries` had no
timestamp at all before this), unions six source tables into a single feed, running under the
caller's own RLS (mirrors `get_client_last_active`'s shape) so a coach automatically only ever
sees their own clients' rows with zero manual filtering. A new pure `groupActivity` util
(`lib/utils/activityFeed.ts`) collapses raw per-event rows into one PT-Distinction-style
summary per client/type/day ("Logged 3 sets", "Added 2 meals") instead of flooding the feed
with one row per set/entry. Powers both the per-client Activity tab (now the workspace's
default landing tab, matching PT Distinction) and the coach dashboard, where it's now the
first thing shown, above `ProgramHealth`/`ClientTable`. Verified with a seeded account
covering all six event types — correct grouping and wording on both surfaces, and confirmed
directly (not just via the UI) that an unrelated coach gets 0 rows from the RPC whether
targeting the client by ID or querying their own empty roster. Deployed to production.

**Phase 4 — shipped.** Real per-client screen toggles, the riskiest phase in this roadmap
since it's the only one that touches client-facing dashboard behavior. New sparse opt-out
table (`client_disabled_screens`, migration `0029_client_disabled_screens.sql`, RLS mirrors
`workout_programs`' exact split — client reads their own row, only the coach writes). A Plan
sub-agent pass caught a real bug before this was built: `DashboardShell.tsx`'s home-card
shortcuts and the classes check-in flow set the active screen directly, bypassing
`screensForCategory` entirely — so filtering only the sidebar/mobile-strip copy of the screen
list would have left a coach's toggle silently ineffective for anyone using those shortcuts.
Fixed with one `effectiveScreen` derivation used at every render/nav choke point instead of
patching each call site individually. Verified end-to-end: toggling off Food Tracking hides it
from the desktop sidebar and mobile strip, and — the specific case the bug would have missed —
the Home screen's "Today's nutrition" shortcut now correctly falls back to Meal Planner instead
of reaching the disabled screen. Also verified the edge case of disabling every screen in a
whole category (falls back to Today, no crash) and RLS (an unrelated coach's write is blocked,
their read returns zero rows). No per-screen status line this pass (e.g. "last diary entry 2
days ago") — would have required fetching several more data sources into the coach workspace
that nothing else currently needs; just the toggle + screen name. Deployed to production.

**Merged back — the `CoachClientWorkspace` shell is no longer the coach's per-client view.**
After using Phases 1-4 in production, feedback was: lost functionality (no more Setup/Credits/
Workout editing/Forms/Education/Weekly Log/Food Tracking/Progress access from the coach's
client page), clunky navigation, and it didn't feel right overall. `app/coach/clients/[clientId]/page.tsx`
now goes back to the original shape — `loadDashboardBundle` + `DashboardShell` with
`isCoachView={true}`, full read/write access to every screen restored exactly as it was before
Phase 1.

The one thing kept from the new work: **Info** (private Notes/Goals/Injuries) is folded into
the restored `DashboardShell` as a third screen under Account Settings (`['Setup', 'Credits',
'Info']` for the coach; unchanged `['Setup', 'Account']` for the client), reusing
`InfoTab.tsx` directly rather than duplicating it. `DashboardShell.tsx` gained a
`journalEntries` prop (defaults to `[]`, so the client's own `/dashboard` needs no change) and
its existing `disabledScreens` prop also got a `[]` default — the coach's page now deliberately
does **not** pass real disabled-screens data, so a coach always sees every screen regardless of
what's hidden from that client's own dashboard. Verified this split directly: a client with a
leftover disabled-screen row from earlier Phase 4 testing still had that screen hidden on their
own `/dashboard`, while the coach viewing the same client saw it fine.

Nothing was deleted — `CoachClientWorkspace.tsx` and every `workspace/*.tsx` component
(Schedule/Items/Activity/Tools tabs), plus all the Phase 1-4 schema
(`client_journal_entries`, `client_disabled_screens`, `food_diary_entries.created_at`,
`get_recent_client_activity`), stay in the codebase/database, just unreferenced from any page.
`app/coach/page.tsx`'s dashboard `ActivityFeed` (added in Phase 3) was left as-is — it only
added content above the existing widgets, didn't remove anything, and wasn't named as part of
what wasn't working.

Phase 5 (Communications tab) stays **on hold** — it was scoped as a tab inside
`CoachClientWorkspace`, which is no longer the active coach view, so it needs rethinking
before continuing rather than picking back up where the sequencing left off. The restored
`DashboardShell` already has a full "Messages" screen with the client's chat history, which
covers the core thing Phase 5 was chasing anyway.

**Phase 6 — shipped** (the two pieces independent of `CoachClientWorkspace`; the dashboard-
activity-first part already landed in Phase 3):

- **Messages as a drawer.** `CoachMessagesButton` now opens a right-side slide-over
  (`MessagesDrawer.tsx`) instead of navigating to `/coach/messages`, reachable from every
  coach page via a new `app/coach/layout.tsx` mounting `MessagesDrawerProvider` once (mirrors
  the existing `ToastProvider`/`ConfirmProvider` pattern) so no page threads a `currentUserId`
  prop through individually. The selected-thread/realtime logic was extracted out of
  `MessagesHubShell.tsx` into a shared `useCoachMessages` hook so both the drawer and the full
  `/coach/messages` page (kept, still directly reachable) run the exact same tested logic.
  Caught two real bugs during verification, both fixed before shipping: (1) an infinite render
  loop — `MessagesDrawer` was passing `overview ?? []`, a new array literal every render, into
  a hook effect keyed on that reference, fixed with a module-level stable empty-array constant;
  (2) opening the drawer while already on the full `/coach/messages` page double-mounted a
  second `ChatTab` for the same client, throwing on a duplicate realtime channel subscription —
  fixed by dropping the now-redundant `CoachMessagesButton` from that page's header, since
  being on it already is the messages experience. Verified end-to-end: list, thread view, back
  navigation, and a real send confirmed persisted via a direct DB check, not just the UI.
- **Groups.** New coach-only tables (`client_groups`, `client_group_members`, migration
  `0030_client_groups.sql`), RLS mirrors `client_journal_entries`' fully-coach-only shape (no
  client access at all, unlike `program_templates`' pattern which also lets clients read) —
  matches the roadmap's own framing that PT Distinction's groups are a coach-side organizing
  tool clients never see. A new `GroupsManager.tsx` modal (mirrors the existing
  `BrowseExercisesModal.tsx` dialog pattern) lets a coach create groups and toggle client
  membership; `ClientTable.tsx` gained a group filter dropdown next to the existing search box.
  Verified: creating a group and adding a client correctly narrows the filtered table, and RLS
  directly confirmed on all three operations (read, insert-as-another-coach, add-member-as-
  another-coach all correctly blocked for an unrelated coach).

Deployed to production.

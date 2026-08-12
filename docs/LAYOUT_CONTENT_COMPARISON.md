# Layout & Content Comparison vs. PT Distinction

Based on 11 real screenshots of your own PT Distinction account ("Ballistic Performance"),
compared screen-for-screen against our actual current code (not a feature checklist — see
`docs/COMPETITIVE_GAP_ANALYSIS.md` for that; this is specifically about how screens are
*organized and laid out*, coach-side). PT Distinction is a mature, VC-funded product with
years of iteration — this isn't "we're behind," it's "here's exactly where and why," so you
can pick what's actually worth closing.

---

## The one big structural difference everything else follows from

**PT Distinction gives the coach a dedicated per-client workspace**, separate from what the
client sees: click into a client and you land on a persistent 6-tab surface — Activity,
Schedule, Items, Tools, Communications, Info — that exists only for the coach, full of
coach-only content (notes, goals, injury flags, scheduled comms).

**Our app mirrors the client's own view.** Click into a client
([app/coach/clients/[clientId]/page.tsx](app/coach/clients/[clientId]/page.tsx)) and the coach
lands on the exact same `DashboardShell` the client uses — Home / Nutrition / Training /
Accountability / Progress — just with write access to some things. There's no separate
coach-only workspace layered on top.

Neither approach is wrong. PT Distinction's suits a coach managing generic "items" across a
large roster; ours suits staying byte-for-byte in sync with what the client actually sees, at
the cost of the coach having nowhere to jot a private note or flag an injury without it living
in client-facing data. Everything below is a consequence of this one choice.

---

## Screen by screen

### 1. Coach dashboard
**PT Distinction:** the primary content is a **live cross-client activity feed** — a
chronological list of what every client just did ("Lénaïc added Dinner", "Becca recorded
InBody result"), each with a module icon, avatar, and timestamp. The traffic-light "Program
Health" widget (Running okay / Keep watch / Action Required) and a completion-% donut sit in a
secondary right rail.

**Ours** ([app/coach/page.tsx](app/coach/page.tsx)): the primary content is the sortable
**client roster table** ([ClientTable.tsx](app/coach/_components/ClientTable.tsx)) — name,
status, last-active, credits. We already have an equivalent traffic-light widget
([ProgramHealth.tsx](app/coach/_components/ProgramHealth.tsx), inline-expanding rather than a
"see all" link-out) sitting *above* the table, so that part is genuinely close to parity
already.

**Real gap:** no activity feed. PT Distinction's dashboard answers "what happened since I last
looked"; ours only answers "who needs attention" via the status buckets. Nothing in our schema
currently aggregates recent client events into one chronological cross-client list — this
would be a new query joining recent rows across `daily_logs`/`food_diary_entries`/
`measurement_logs`/`workout_logs`/etc. by `updated_at`, roughly the same shape as
`getClientHealthStatuses` but event-level instead of status-level. This is the single highest-
impact layout/content change if you want the dashboard to feel "alive" the way PT
Distinction's does.

### 2. Per-client page structure
**PT Distinction:** Activity / Schedule / Items / Tools / Communications / Info tabs, plus a
persistent "+Add" button and an icon toolbar (settings, chat, groups, overflow).

**Ours:** the client's own category tabs (Home / Nutrition / Training / Accountability /
Progress), a Messages icon, a health-status badge. No universal "+Add", no per-client calendar
of scheduled touchpoints, no per-client tool-enable panel.

**Real gap, three specific things a coach can do in PT Distinction with nowhere to do them in
ours:**
- **Client Notes** — a running freeform log of coach observations, timestamped, entirely
  separate from anything client-facing (PT Distinction's "Note 1: One thing I'd need to
  improve too..."). We have nothing like this — the closest thing in our schema is
  client-facing chat messages, which isn't the same as a private coach note.
  Cheapest gap to close: a `client_notes(coach_id, client_id, body, created_at)` table plus a
  small list+add UI, no client-facing exposure at all.
- **Goals** and **Injuries & Limitations** as their own structured, listed items — distinct
  from the calculation-engine profile fields. Same shape as Client Notes above; could
  plausibly be the same underlying table with a `kind` column (`note`/`goal`/`injury`) rather
  than three separate tables.
- **Per-client Schedule** — a calendar view of upcoming scheduled touchpoints for that one
  client (PT Distinction shows "Email 7:00pm", "IM 9:00am" on specific days). We have nothing
  that schedules arbitrary future touchpoints per client today; this overlaps with
  `docs/GAP_ROADMAP.md`'s Phase 4 (retention automation) and Phase 5 (video call scheduling) —
  if either of those get built, a per-client schedule view naturally falls out of the same
  data.

### 3. Messaging
**PT Distinction:** a slide-over drawer reachable from any screen, with All / Unread /
Flagged / Clients / Groups tabs, search, and a pinned AI Assistant thread ("Powered by
OpenAI") above the real client threads.

**Ours** ([CoachMessagesButton.tsx](app/coach/_components/CoachMessagesButton.tsx) →
`/coach/messages`): a dedicated full page, single inbox list, no Flagged/Groups filtering, no
AI assistant.

Moderate gap. The full-page-vs-drawer difference is mostly a friction cost (navigating away
vs. an overlay you can dismiss) rather than a capability gap. Flagged-message filtering and an
AI-assistant thread are real content gaps but are their own separate features, not a quick
layout tweak — worth scoping separately if wanted, not folding into a "make messages a drawer"
task.

### 4. Groups / cohorts
**PT Distinction:** a first-class "Groups" concept — auto-maintained system groups (All
Clients / All Active / All Inactive, with live counts) plus coach-created custom groups (e.g.
"Brad 6 Week Challenge Group") used as a segmentation/bulk-action primitive.

**Ours:** nothing. `docs/GAP_ROADMAP.md`'s Phase 6 ("Group coaching content model") already
flags a groups gap, but that phase is scoped around *shared programs with per-member
individualization* — a fairly large lift. Worth noting PT Distinction's Groups are actually
more foundational than that: they're primarily a **segmentation and bulk-messaging** primitive
that's useful on its own, well before any "shared program" logic exists. A basic
`client_groups(coach_id, name)` + `client_group_members` join, surfaced just as a filter on the
existing `ClientTable` and a bulk-message target, would be a meaningfully smaller and earlier
win than full Phase 6.

### 5. Tools (per-client feature toggles)
**PT Distinction:** a Tools tab per client with individual on/off switches — Food Diary,
Progress Photos, Calorie Counter, Adherence, Integrations — so a coach can turn tracking
modules on only for the clients who need them.

**Ours:** every module is simply always present for every client — Nutrition/Training/
Accountability/Progress are static tabs, not conditionally enabled.

This is a deliberate simplicity trade-off in our current design, not an oversight — worth
naming explicitly since it's a real behavioral difference a coach used to PT Distinction might
expect. Only worth building if per-client customization (e.g. hiding Progress Photos for a
client who doesn't want to take them) turns out to matter in practice.

### 6. Program Templates library
**PT Distinction:** All / PTD Programs (platform-provided library) / My Programs / Community —
a marketplace/community layer on top of the coach's own templates.

**Ours** ([ProgramTemplateManager.tsx](app/coach/library/_components/ProgramTemplateManager.tsx)):
coach's own library only, no shared/community layer.

Low priority — this is a platform-scale network effect that doesn't make sense to chase for a
single-coach product.

### 7. Account Settings / branding
**PT Distinction:** business logo upload, business display name (with a documented workaround
for solo operators — "if using a business name enter it as the first name"), an
Imperial/Metric measurement-units toggle, plus team/integration settings (Team Leader, Google
Sheets, SMS, Printout Banner) that are mostly payment/multi-coach-tier features irrelevant to
`CLAUDE.md`'s single-coach, no-payment-processor scope.

**Ours** ([CoachSettingsShell.tsx](app/coach/settings/_components/CoachSettingsShell.tsx)):
signed-in-as email, change password, change email, theme toggle. No business branding, no
measurement-units preference — confirmed there's no `imperial`/metric field anywhere in the
schema or data layer today, so the app is implicitly metric-only throughout (matches
`CLAUDE.md`'s UK/real-spreadsheet framing, so likely fine as-is, but flagging since PT
Distinction treats it as a real per-coach setting).

A coach logo + display name on the login/dashboard chrome would be the cheapest, highest-
visible-polish item in this whole list if you want the app to feel more "branded" rather than
generically named "Ballistic Performance" everywhere.

---

## Where we already match or exceed (confirmed against these screenshots, not just claimed)

- **Program Health traffic-light widget** — we already have this
  ([ProgramHealth.tsx](app/coach/_components/ProgramHealth.tsx)), inline-expanding rather than
  a separate "see all" page, functionally equivalent.
- **Nutrition depth** — PT Distinction's own Tools tab shows Food Diary as a simple photo/text
  log with a separate opt-in "Calorie Counter"; ours has a single always-on real macro-tracking
  system with barcode scanning built in, already covered in `COMPETITIVE_GAP_ANALYSIS.md`.
- **Workout builder** — PT Distinction's screenshots show flat program-list rows only (no
  drag-and-drop/day-focus view visible in what was captured); our recently-shipped
  `FocusOverlay` click-into-day flow is a more modern interaction pattern than what's visible
  here.

---

## Suggested priority if you want to close these

Roughly cheapest-and-most-visible first, independent of `GAP_ROADMAP.md`'s existing phase
order (these are additive to it, not a replacement):

1. **Client Notes / Goals / Injuries** on the per-client page — one small table, no client-
   facing exposure, closes the biggest "coach has nowhere private to write things down" gap.
2. **Coach dashboard activity feed** — highest visual impact, makes the dashboard feel current
   the way PT Distinction's does.
3. **Coach branding** (logo + display name) in Account Settings — cheap, cosmetic, high
   visibility.
4. **Groups as a segmentation primitive** (not full Phase 6) — smaller slice of the existing
   roadmap phase, useful standalone.
5. Everything else here (Tools toggles, Communications scheduling, Program Templates
   marketplace) either overlaps with already-scoped `GAP_ROADMAP.md` phases or is genuinely
   low-priority platform-scale surface area not worth chasing at single-coach scale.

Not building anything from this yet — this is the assessment only, per how the last few
research passes this session were handled.

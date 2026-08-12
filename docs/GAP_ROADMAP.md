# Gap Roadmap — Closing the PT Distinction / TeamUp / MyFitnessPal Gaps

## Context

`docs/COMPETITIVE_GAP_ANALYSIS.md` identified ~15 feature gaps against three competitor
products. That document answers "what's missing"; this one answers "in what order do we
build it, and roughly how." Mirroring the existing `docs/MIGRATION_ROADMAP.md` pattern — a
sequencing document, not a fully-specified implementation for every phase. Each phase gets
detailed design (its own migration file, exact schema, exact UI) as its own pass when we
actually start it, the same way Meal Sections / Account Settings / Classes Check-in just
went through their own dedicated plan.

No code changes happen from this document alone — it's the deliverable itself, per your
explicit choice this pass ("write the roadmap doc only, no building yet").

Phases are ordered by impact-for-effort, confirmed against the actual codebase (not just
guessed): every Phase 1-4 item was checked against real schema/data-layer files during
research, so the "why this order" reasoning below is grounded, not aspirational.

---

## Phase 1 — Nutrition logging speed (Quick Add, Favorites/Recently Logged, Copy Day)

**Why first:** cheapest per-feature, highest daily-adherence impact (MyFitnessPal reviews
consistently cite logging friction, not database size, as the #1 driver of whether people
keep a food diary at all), and fully additive to the meal-sections work just shipped — no
conflicts with anything in flight.

- **Quick Add** (log calories/macros with no food-database item): `food_diary_entries.food_id`
  is already nullable, but every consumer (`getFoodDiaryEntries`'s join, `entryMacros`,
  `FoodTrackingTab`'s row rendering, `syncFoodDiaryToLog`) currently assumes a resolved
  `food` is present. Needs new inline columns (`quick_add_name`, `quick_add_calories`,
  `quick_add_protein/carbs/fat`) on `food_diary_entries`, plus updating every one of those
  consumers to fall back to the inline fields when `food_id` is null.
- **Recently Logged / Favorites**: `foods` is a single shared global table with no per-client
  usage tracking today (confirmed — no `last_used_at`/count column, `lib/data/foods.ts` has
  only `searchFoods`/`getFoodByBarcode`/`upsertFoodFromBarcode`). Needs a new per-client
  `food_favorites(client_id, food_id)` table (explicit favoriting) and either a derived query
  over `food_diary_entries` joined through `daily_logs.client_id` for "recently logged"
  (simplest, no new table) or a maintained `food_usage_stats` table if frequency-ranking
  turns out to matter more than pure recency. Start with the derived-query version — cheaper,
  and provably sufficient until proven otherwise.
- **Copy Meal / Copy Day**: no such function exists anywhere in `lib/data/foodDiary.ts` or
  elsewhere (confirmed). New `copyDiaryEntries(fromDailyLogId, toDailyLogId, mealSectionId?)`
  in `lib/data/foodDiary.ts` — reads a source day's entries (optionally scoped to one
  section) and bulk-inserts copies (including quick-add columns once they exist) against the
  target day. UI: a "Copy from yesterday" action on `FoodTrackingTab.tsx`, and a per-section
  "copy this meal" affordance once Quick Add's schema exists (do Quick Add first so this can
  copy those rows too, not just food-linked ones).

**Rough scope:** one migration, `lib/data/foodDiary.ts` + `lib/data/foods.ts` extensions,
`FoodTrackingTab.tsx` + `FoodSearchPicker.tsx` UI additions. Comparable in size to the Meal
Sections work just shipped.

---

## Phase 2 — Habit tracking module + roster-wide adherence view

**Why second:** PT Distinction's most-cited coaching-workflow gap for us, and the schema
groundwork already half-exists (unlike most other gaps here, which start from zero).

- **Current state** (confirmed): `habits`/`habit_logs` already exist (migration `0006`),
  coach-created, client-completed, RLS-correct. But `getHabitsWithLogs(clientId)` in
  `lib/data/habits.ts` is hard-scoped to one client — there is no roster-level query, and the
  UI (`WeeklyLogTab.tsx`'s `HabitManager`) only ever renders one client's habits at a time.
- **What's actually missing** is narrower than "build habit tracking" — it's specifically the
  **roster-wide adherence view**: a new coach-facing query (likely in `lib/data/coach.ts`,
  alongside the existing `getClientHealthStatuses` pattern) that joins habits/habit_logs
  across every client a coach owns, computing a simple "X/Y habits done today" or "N-day
  streak" per client, surfaced as a new widget on the coach's client-list page (`app/coach/
  page.tsx` / `ClientTable.tsx`) — reusing the exact roster-aggregation pattern
  `getClientHealthStatuses` already establishes for inactivity buckets.
- Secondary, smaller ask: consider letting a habit be assigned to multiple clients at once
  from a single "create habit" action (PT Distinction's "assign once to many" pattern) —
  worth scoping separately since it changes `createHabit`'s signature; not required for the
  roster-view win alone.

**Rough scope:** no new tables for the core adherence-view win — just a new roster query +
a new coach-dashboard widget. The "assign to many" extension would need a small join-table
change if pursued.

---

## Phase 3 — Classes ops: single-occurrence cancellation + deeper attendance reporting

**Why third:** real, currently-clunky gap (a coach literally cannot cancel one date of a
recurring class without editing/deleting the whole series today) with zero payment
involvement, unlike most of TeamUp's other advantages.

- **Confirmed:** `getScheduleOccurrences` (`lib/data/classes.ts`) generates occurrences purely
  virtually (looping `day_of_week` + `weeksAhead`, no per-occurrence DB row exists anywhere
  across all 24 migrations). "Cancel this occurrence" therefore needs a new
  `class_exceptions(class_id, date, cancelled_at)` table that `getScheduleOccurrences` filters
  against (skip generating an occurrence whose `class_id`+`date` has an exception row).
- **Bulk refund/notify RPC**: reuse `cancel_booking`'s (migration `0015`) exact refund math —
  `credit_cost` refunded via a `credits_ledger` insert with `reason = 'refund:' || booking_id`
  — but as a bulk operation over every `booked`/`waitlist` row matching `class_id`+`date`,
  skipping the existing single-cancel's waitlist-promotion step entirely (there's no seat
  to promote into once the whole occurrence is gone) and inserting one `notifications` row
  per affected client ("Class cancelled: {name} on {date}").
- **UI**: `AttendanceScheduler.tsx` already has the exact "pick a date, see that class's
  roster" flow via `ClassCalendar` + `getRoster(classId, date)` — the natural place for a
  "Cancel this occurrence" button per row, reusing `getRoster`'s existing booked-client
  lookup rather than a new query.
- **Deeper attendance/no-show reporting**: additive to the existing `getClientHealthStatuses`-
  style reports already in `ReportsPane.tsx` — add a "who's missing" trend view and CSV
  export on top of the current attendance-rate/no-show-list/class-popularity numbers, no
  schema change needed, purely a reporting-query + UI addition.

**Rough scope:** one migration (`class_exceptions` table + a `cancel_class_occurrence` RPC),
`lib/data/classes.ts` additions, `AttendanceScheduler.tsx` UI, `ReportsPane.tsx` extensions.

---

## Phase 4 — Lightweight retention automation (inactivity nudges → building block for more)

**Why fourth, and scoped narrowly:** PT Distinction's "automations" and TeamUp's "retention
marketing" are both large, open-ended asks. Scoping this phase to just the cheapest real
slice — not the full drip-campaign/Zapier vision — keeps it buildable without turning into
its own multi-week project.

- **Confirmed:** every `notifications` insert today is inside a `security definer` RPC
  (`send_checkin_reminders`, `cancel_booking`'s waitlist promotion, `assign_form`,
  `assign_education_content`) — there is deliberately no client/coach-authenticated insert
  path (schema.sql's own comment: "only security-definer RPCs write these"). A genuinely new
  automations system needs either a new RPC per trigger type (matching the existing pattern)
  or, if we want coach-authored custom messages (not just system-generated ones), a new
  `scheduled_messages(coach_id, client_id, send_at, message)` table + a cron route (mirroring
  `app/api/cron/checkin-reminders/route.ts`'s existing daily-trigger pattern) that inserts
  into `notifications` when `send_at` has passed.
- **v1 scope**: a coach-facing "send a one-off scheduled message to a client" (simplest
  possible slice — no drip sequences, no purchase triggers yet), reusing the existing cron
  infrastructure and `notifications` table exactly as-is.
- **Explicitly deferred within this phase**: automated onboarding sequences, milestone/
  purchase-triggered messages, and any Zapier-style external integration — these are real
  PT Distinction advantages but are each their own significant scope; revisit only once v1's
  simple scheduled-message mechanic is proven useful.

**Rough scope:** one migration (`scheduled_messages` table), one new cron route (copy the
existing `checkin-reminders` route's shape), a small coach-facing scheduling UI.

---

## Phase 5 — In-app video call scheduling

**Why fifth:** a real, cleanly-scoped gap (a scheduled item with a Zoom link, opened from the
client's view) that doesn't require the heavier "general flexible scheduling engine" PT
Distinction has — start with just video calls, not a generic arbitrary-item scheduler.

- New `video_calls(coach_id, client_id, scheduled_at, zoom_url, notes)` table, RLS matching
  the existing `owns_client` pattern used throughout. Surfaced on the client's Home screen
  (`TodayTab.tsx`, alongside the existing "Next class" card) and a new coach-facing scheduling
  form. No Zoom API integration needed for v1 — the coach pastes their own meeting link,
  exactly like `workout_exercises.video_url` already works for exercise demo links.

**Rough scope:** one small migration, one new coach-facing form, one new client-facing card.

---

## Phase 6 — Group coaching content model

**Why sixth, and why later:** genuinely useful (assign one program to a group with per-member
individualization, PT Distinction-style) but architecturally the biggest lift of the
"still not payment-gated" items — it touches the workout-program assignment model that
Classes Check-in just finished building on top of, so it should land after that work has
had time to prove out in production, not immediately after.

- Needs a new `client_groups(coach_id, name)` + `client_group_members(group_id, client_id)`
  join, and a decision on what "individualization" means concretely for our program model
  (e.g. instantiate one program template per group member via the existing
  `instantiate_program_template` RPC, then let per-member edits diverge from there — this
  reuses existing machinery rather than inventing a new "shared program" concept, but needs
  its own dedicated plan when we get here).

**Rough scope:** deliberately not fully specified yet — this is the one phase that genuinely
needs its own exploration pass when we start it, given how much it touches the existing
program/template system.

---

## Phase 7 — Lower priority / lowest ROI right now

Not sequenced yet — revisit only if an earlier phase surfaces a concrete need:
- Branded native mobile app / white-labeling (high cost, and our web app is already faster/
  more modern than PT Distinction's reviewed mobile app — this is currently a strength, not
  a gap to close).
- Built-in marketing website builder, structured fitness-assessment library.
- Multi-location/room support (only matters past one coach/location).
- Manual waitlist "reserved acceptance window" tier (our simpler always-auto-promote model
  may suit our scale better as-is).
- URL-based recipe import, restaurant-menu-specific food database depth (inherent to our
  curated + Open Food Facts tradeoff, not an oversight).

## Explicitly out of scope until the payment-processor decision changes

Per `CLAUDE.md`, unchanged by any of the above:
- TeamUp-style recurring billing, self-serve signup + payment, invoicing.
- PT Distinction's purchase-triggered automation sequences and Zapier-to-Stripe bridges.
- Wearable/Apple Health/Google Fit sync (real gap, but unrelated to payments — genuinely just
  not scoped yet; could move into a future phase on its own merits if wanted).

---

## How to use this document

Each phase becomes its own `EnterPlanMode` pass when we're ready to build it — same workflow
as Meal Sections/Account Settings/Classes Check-in: explore the specific files named above,
confirm schema decisions with you where flagged, write the migration + code, verify with
disposable test accounts, deploy. This document's job is just to make sure we're building
things in the right order, not to lock in every implementation detail today.

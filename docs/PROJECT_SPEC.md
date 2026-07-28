# Project Spec — Feature Detail

Ported from a working Claude.ai artifact prototype. Every formula here has already been
validated — implement as specified rather than reinventing.

## 1. Auth & Roles

Two roles: `coach` and `client`. One coach account manages many client accounts.
- Coach: full dashboard, sees all clients, can create/remove clients, sets each client's
  initial credentials.
- Client: sees only their own data across every module below. Enforce via Supabase RLS
  policies keyed on `auth.uid()`, not just app-level route guards.

## 2. Client Profile (Setup)

Fields: name, gender, goal description (free text, e.g. "Fat loss"), experience level,
age, body fat %, **start weight (kg)**, **goal weight (kg) — required**, activity level
(numeric multiplier, default 1.5), diet approach (`High Carb Low Fat` | `Higher Fat`),
tier (1/2/3), calorie cycling (`Yes`/`No`).

Also: measurements (arm/chest/waist/hips/quad, start + goal) and strength lifts
(DB Press/Squats/Pull Ups/Romanian Deadlift/Hip Thrust, start + goal).

**Validation rule carried over from a real bug fix:** Goal Weight must be a required,
clearly-labelled numeric field, separate from the free-text goal description. In the
original spreadsheet this was ambiguous (both just called "Goal") and a blank Goal Weight
silently broke the protein calculation by defaulting to the largest weight-loss-gap tier.
Don't reintroduce that ambiguity.

## 3. Calculation Engine

See `lib/calculations.ts` for exact implementation. Summary:

- **BMR**: Katch-McArdle formula using lean mass and fat mass derived from body fat %,
  with a +198 offset for male gender, adjusted by age.
- **TDEE**: BMR × activity level multiplier.
- **Protein target**: g/kg of start weight, tiered by (start weight − goal weight) gap:
  ≤5kg → 2.2 g/kg, ≤8kg → 2.0, ≤12kg → 1.8, >12kg → 1.6.
- **Fat target**: g/kg of start weight — 0.8 g/kg if diet approach is "High Carb Low Fat",
  else 1.2 g/kg.
- **Carbs**: fill whatever calories remain after protein and fat are accounted for.
- **Phase-based calorie deficits**: the 12-week program splits into 3 phases (weeks 1-4,
  5-8, 9-12), each with progressively larger deficits per tier — see the
  `PHASE_DEFICITS` table in `lib/calculations.ts` for exact numbers. Fat and protein
  targets stay constant across phases; only the calorie deficit (and therefore carbs)
  changes.
- **Calorie cycling**: when enabled, weekly target splits into 5 "low" days and 2 "high"
  days that average out to the same weekly deficit as the flat (non-cycling) approach.

**Known design tension to flag to the coach, not silently fix:** because only carbs taper
across phases while fat/protein stay flat, carbs can crash close to zero by phase 3 at
higher tiers. This was true of the original spreadsheet design too — don't quietly change
the underlying logic, but the UI should surface a warning if a computed daily target drops
below ~1,200 kcal (a general floor, not medical advice) or if computed carbs drop below
~50g, suggesting a coach review rather than blocking the number outright.

## 4. Weekly Log (daily check-ins)

Per day: protein, carbs, fat, fibre, water, bodyweight, steps, sleep, gym session
(boolean), notes, plus qualitative signals — hunger/energy/motivation/stress on a 1-5
scale — and for female clients, a "period started" boolean.

**Calories are always derived, never entered directly**: `protein×4 + carbs×4 + fat×9`.

Weekly Totals/Averages roll up the 7 days in the current week. Cycle day is computed by
finding the most recent prior "period started" day and counting forward.

## 5. Food Tracking (the real diary)

Distinct from Meal Planner (below) — this is what was *actually* eaten, logged against a
specific day. Search the food database (seeded from `data/foods.json`, extendable via
barcode lookup in Phase 6), add entries with a quantity multiplier, running totals
calculate live. A "sync" action writes the totals into that day's Weekly Log
protein/carbs/fat fields so downstream Totals/Averages/floor-checks stay accurate.

## 6. Meal Planner (forward planning, not a diary)

Six sections: Breakfast, Mid-Morning Snack, Lunch, Afternoon Snack, Dinner, Evening Snack.
Same food-search pattern as Food Tracking, but this is a planning tool for a *typical* day,
not tied to a specific date, and doesn't write back into the Weekly Log.

## 7. Activity Alternatives

MET-based exercise substitution. Client enters "minutes to walk 1000 steps" (measured
themselves) and a step target; the app computes equivalent-effort minutes for ~44 other
activities (running variants, swimming strokes, rowing, cycling, stairs, etc. — see
`data/activities.json`) using `calories/min = 0.0175 × MET × bodyweight(kg)`.

Step target schedule by week: weeks 1-2 → 10,000; weeks 2-6 → 12,000; weeks 7-12 → 13,000.

## 8. Progress Photos

Date-tagged uploads. In the prototype these were client-side resized before storage; in
the real app, upload to Supabase Storage (a `progress-photos` bucket, RLS-scoped per
client) and store just the file path + date + client ID in the `progress_photos` table.

## 9. Insights

- **Adaptive maintenance check**: compares the formula-based TDEE against a real-world
  estimate derived from actual logged calories vs. actual weight change over the same
  window (`avgLoggedCalories - (weightChangeKg × 7700 / daysSpan)`). Flags a >150 kcal
  divergence as worth a coach review rather than trusting the formula blindly.
- **Plateau check**: flags when bodyweight has moved <0.3kg over the last ~4 weeks of
  logged entries.
- **Cycle-aware note**: for female clients, flags when the latest entry falls on cycle
  day 18-28 (likely water retention, not fat gain) rather than letting a scale bump be
  misread.

## 10. Overview

Simple weekly trend lines (not banded/smoothed) for average bodyweight, average calories,
average steps — one data point per week that has any logged days.

## 11. Classes + Credits (build after Phase 1-3, see roadmap)

Classes have name/day/time/capacity. Bookings deduct one credit; cancelling before some
cutoff (coach-configurable, default suggestion: 12 hours) refunds it. Credits are an
append-only ledger (`credits_ledger`: client, delta, reason, timestamp) — the current
balance is a computed sum, never a mutable column, so history and disputes are always
auditable.

**No payment processor for now.** Credits are granted manually by the coach — a simple
"add credits" action in the coach view writes a positive-delta row with reason `manual
grant`. Real money is handled outside the app (cash, bank transfer, existing GoTeamUp
subscription, whatever). Keeping the ledger structure now means adding real in-app
purchasing later is just a new way of writing to the same table, not a data model change.

## 12. Chat

Simple per-client thread, coach and client both post into it. Use Supabase Realtime so
messages appear live rather than requiring a refresh.

## 13. Workout Program Builder

Coach builds a program: exercises with sets/reps/load/RPE, organized by week and day.
Client logs actual performance per session (weight/reps/RPE per set). Should read/write
against the same strength fields (DB Press, Squats, Pull Ups, RDL, Hip Thrust) defined in
`client_profiles` so Start → Goal progress is visible in one place, not siloed.

## 14. Barcode Scanning

Camera-based barcode capture (react-zxing or equivalent) feeding into the free Open Food
Facts API (`https://world.openfoodfacts.org/api/v0/product/{barcode}.json`) for product
lookup. Fall back gracefully to manual search against the existing food database when a
barcode isn't found — Open Food Facts coverage is good but not universal, especially for
UK/NZ-specific or homemade items.

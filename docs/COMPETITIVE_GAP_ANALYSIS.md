# Competitive Gap Analysis: PT Distinction, TeamUp, MyFitnessPal

Full-app comparison (not just the workout builder — see `docs/WORKOUT_BUILDER_RESEARCH.md` for
that). PT Distinction is the closest all-in-one competitor; TeamUp is the class/scheduling/
membership platform (relevant since `CLAUDE.md` already notes "an existing GoTeamUp
subscription" as one way real money flows outside the app today); MyFitnessPal is the
consumer nutrition-tracking benchmark, most relevant to Food Tracking/Recipes/Meal Planner.

Each gap is tagged **[payments]** if closing it requires the payment processor CLAUDE.md
currently defers, or **[ops]** if it's addable without touching payments.

---

## vs. PT Distinction (all-in-one coaching platform)

**Where we already match or exceed:**
- Nutrition: PT Distinction has no native barcode scanner or food database — it syncs to
  MyFitnessPal or relies on a client-submitted "photo food diary." Our real Open Food Facts
  scanning, validated BMR/TDEE/macro engine, weekly log, and dedicated meal planner are all
  native. Reviews call PT Distinction's nutrition side "a little lacking."
- Class/credit mechanics: our append-only ledger, waitlist, cutoff-based refunds, and
  attendance/no-show reporting are more structured than PT Distinction's generic scheduler.
- App speed/modernness: reviews describe PT Distinction's mobile app as slow, prone to
  freezing (including losing workout progress), and visually dated — a real edge for us as
  long as we stay fast, not something to close.

**Real gaps, ranked by likely impact:**
1. **Automations** [ops] — pre-scheduled email/SMS/in-app messages, automated onboarding
   sequences triggered on purchase/signup, Zapier bridge to other tools. We have nothing here.
   Biggest lever for retention with near-zero added coach time per client.
2. **Dedicated habit-tracking module** [ops] — assign a habit once to many clients, client
   ticks it off daily, coach scans all-clients adherence in one view. Our Weekly Log captures
   habit-adjacent signals (sleep, mood, gym session) but there's no discrete assignable
   tick-box habit system or roster-wide adherence view.
3. **In-app video call scheduling** [ops] — a scheduled item that opens a Zoom link inside the
   client's view, for 1:1 or group sessions. We have none.
4. **General flexible scheduling engine** [ops] — PT Distinction can place any arbitrary item
   (not just workouts/classes) on a specific day or repeating pattern, with client-side
   rescheduling and missed-item alerts. Ours is workout/class-only.
5. **Group coaching content model** [ops] — one program/content set assigned to a group with
   per-member individualization, plus a group forum/messenger. Our Classes are booking/credit
   based, not a shared-program-with-individualization pattern.
6. **Branded native mobile app / white-labeling** [payments-adjacent, high cost] — PT
   Distinction's Pro tier includes a custom-branded iOS/Android app + Apple Watch companion.
   High perceived value, high cost — lowest priority given our web app is already faster and
   more modern than the reviewed alternative.
7. Lower priority: a built-in marketing website builder, a structured fitness-assessment
   library (movement screens, strength/endurance tests) beyond our current photos/measurements.

---

## vs. TeamUp (class scheduling + membership platform)

**Where we already match or exceed:**
- Waitlist promotion, credit-ledger accounting, and no-show/attendance reporting are
  comparable in rigor to TeamUp's, at a fraction of the surface area.

**Real gaps, ranked by likely impact:**
1. **Single-occurrence class cancellation** [ops] — TeamUp can cancel one specific date of a
   recurring class (with attendee notification + optional credit/money refund) without
   touching the whole series. We can only delete/edit the whole recurring class row.
2. **Deeper attendance/no-show reporting** [ops] — TeamUp has a dedicated "who's missing"
   trend view with filters/export. We have the raw numbers (attendance rate, no-show list,
   class popularity) but less depth/export.
3. **Native member mobile app / polished PWA** [ops] — TeamUp's member app handles booking,
   waitlist push notifications, and (now) self-check-in. Our new classes-linked check-in
   feature covers the functional core of this already; a polished installable PWA would close
   most of the remaining gap without building a native app.
4. **Lightweight retention automation** [ops] — inactivity nudges, birthday notes. Pure ops,
   cheap, and we have nothing today (distinct from PT Distinction's heavier automation ask).
5. Lower priority: multi-location/room support (only matters past one coach/location), a
   manual "reserved acceptance window" waitlist tier (our simpler always-auto model may
   actually suit our scale better).
6. **Recurring billing / self-serve signup + payment** [payments] — the single biggest overall
   capability gap vs. TeamUp, but explicitly gated behind the payment-processor decision
   CLAUDE.md defers. Not actionable now; revisit only if/when that decision changes.

---

## vs. MyFitnessPal (nutrition tracking)

**Where we already match or exceed:**
- Barcode scanning core mechanic (scan → lookup → fallback to search) is comparable, and ours
  is free/included where MyFitnessPal recently paywalled scanning behind Premium — a real
  complaint driver in their reviews.
- Recipe-building from our own food DB with per-ingredient portions/servings is comparable to
  or better than MyFitnessPal's "saved meals" model.
- Our new customizable-per-client meal sections (any names/count/order) slightly exceed
  MyFitnessPal's model (up to 6 slots, renameable, but structure is global not per-day).
- We already track fibre, water, steps, sleep, mood signals, and period tracking — none of
  which MyFitnessPal does natively. (Deliberately not chasing their micronutrient depth either
  — reviews call MFP's own micronutrient tracking shallow even on Premium.)

**Real gaps, ranked by impact on daily logging adherence (their #1 driver, ahead of
database size/accuracy per reviews):**
1. **No "recently logged" / "favorites" quick-access on food search** [ops] — the single
   biggest friction point for repeat foods; most people eat a rotating set of the same items.
2. **No Quick Add (calories/macros-only, no food item required)** [ops] — blocks fast logging
   of estimated or restaurant meals with no matching database entry.
3. **No copy-meal / copy-entire-day** [ops] — repetitive diets currently require re-entering
   the same foods daily; MyFitnessPal supports copying a single meal or a whole day forward.
4. Lower priority: no restaurant-menu-specific database (inherent to our curated + Open Food
   Facts model, an intentional size/quality tradeoff, not an oversight), no wearable/Apple
   Health/Google Fit sync (real but explicitly out of scope), no URL-based recipe import.

---

## Overall Top 5 (across all three, ranked by impact-for-effort)

1. **Quick Add + recently-logged/favorites in Food Tracking** [ops] — cheapest, highest daily-
   adherence impact; both are pure UI/data additions on tables we already have.
2. **Copy-meal / copy-day in Food Tracking** [ops] — same rationale, similarly cheap.
3. **Habit-tracking module with roster-wide adherence view** [ops] — closes our single biggest
   PT Distinction gap; distinct from and complementary to the existing Weekly Log.
4. **Single-occurrence class cancellation** [ops] — closes a real, currently-clunky editing
   gap in Classes with no payments involved.
5. **Lightweight automations** (inactivity nudges at minimum, building toward drip
   content/onboarding sequences) [ops] — highest strategic value long-term, but the largest
   build; worth scoping as its own future project rather than bolting on piecemeal.

None of the top 5 require the payment processor CLAUDE.md currently defers. The two genuinely
large capability gaps that **do** require payments — TeamUp-style recurring billing/self-serve
signup, and PT Distinction's Zapier-driven purchase automations — are correctly out of scope
for now and should only be revisited if/when that product decision changes.

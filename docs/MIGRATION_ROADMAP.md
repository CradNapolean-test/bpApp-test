# Ballistic Performance — Migration Roadmap (Prototype → Real Hosted App)

## Recommended stack

| Piece | Choice | Why |
|---|---|---|
| Frontend + backend | **Next.js** | One codebase for UI and API routes; the React logic from the prototype ports over largely as-is |
| Database + Auth | **Supabase** | Postgres + built-in Auth (real login, not a PIN) + Row Level Security (each client's data genuinely isolated, not just hidden by the UI) + Realtime (proper live chat) + file Storage (progress photos) |
| Barcode scanning | **A camera-decoding library (e.g. react-zxing) + Open Food Facts API** | Real camera access works properly in a real deployed HTTPS site (unlike the sandboxed artifact iframe). Open Food Facts has a free, open barcode-lookup API — no paid nutrition API needed |
| Hosting | **Vercel** | Pairs natively with Next.js, trivial deploy pipeline |

**No payment processor at this stage.** Credits are granted manually by the coach — the
ledger structure still tracks every movement properly, it's just not wired to a checkout
flow. This can be added later without a data model change if in-app purchasing becomes
wanted; it just isn't part of this build.

## Database schema (rough shape)

- `users` — handled by Supabase Auth directly; add a `role` column (`coach` / `client`)
- `client_profiles` — everything currently in the Setup tab (age, weights, body fat %, tier, cycling, measurements, lifts)
- `daily_logs` — one row per client per day (protein/carbs/fat/fibre/water/bodyweight/steps/sleep/gym session/hunger/energy/motivation/stress/period-started)
- `food_diary_entries` — food tracking rows, foreign-keyed to a daily log
- `progress_photos` — Supabase Storage handles the actual files; this table just holds metadata (client, date, file path)
- `classes` — name, day/time, capacity
- `bookings` — client, class, date, status (booked/waitlist/cancelled)
- `credits_ledger` — every credit movement (manual grant, booking deduction, cancellation refund), never just a single mutable balance — this matters for disputes ("why do I have 3 credits, I thought I had 10") and for correctness under concurrent bookings
- `chat_messages` — client, sender, text, timestamp
- `workout_programs` / `workout_logs` — planned sets/reps/load per week/day, and actual logged performance

## Migration sequence, and why this order

**Phase 1 — Foundation (do this first, everything else depends on it)**
Set up Next.js + Supabase, design the schema above, replace the PIN gate with real Supabase Auth. This is the one phase that can't be skipped or reordered.

**Phase 2 — Port what already works**
Setup, Weekly Log, Food Tracking, Meal Planner, Activity Alternatives, Insights, Overview. This is mostly swapping `window.storage` calls for real database queries — the calculation logic (BMR/TDEE/macros, MET conversions, adaptive TDEE, plateau detection) doesn't need to change at all.

**Phase 3 — Chat**
Straightforward once real-time infrastructure exists — Supabase Realtime gives you actual live updates instead of the polling I flagged as a limitation before.

**Phase 4 — Classes + Credits (ledger, manual top-ups)**
Build and test the booking logic — especially the double-booking race condition (two clients booking the last spot at the same moment). Credits are added by the coach directly (a simple "add credits" action); no payment processor involved.

**Phase 5 — Barcode scanning**
The most independent piece — doesn't depend on anything else, could realistically be pulled earlier if you want a quick, satisfying win once real hosting exists and camera access is confirmed working.

**Phase 6 — Workout program builder**
Straightforward CRUD once the database foundation exists; ties into the Strength Start/Goal fields already designed in Setup.

## Honest scope check

This is a genuinely multi-week project for a solo build, even with AI assistance — not a weekend rebuild. The phase that carries the most weight is Phase 1 (getting Auth/RLS right so client data is *actually* private, not just hidden by the UI). Without payments in scope, the remaining phases are comparatively contained — mostly CRUD and integration work rather than compliance-sensitive territory.

## Where to actually build this

This kind of project — real backend, real database, real deploys — is exactly what **Claude Code** is built for, as opposed to the artifact sandbox we've been using. It can create a real project structure, install real packages, run a real dev server, and push to a real repo/hosting pipeline. Worth starting that as its own project once you're ready to move off the prototype stage.

## If payments get added later

Since credits are already ledger-shaped (not a mutable balance), adding a payment processor later is additive: a checkout flow writes a new row to `credits_ledger` with `reason = 'purchase'` and a processor's payment ID, instead of a coach manually granting the row. Nothing about the booking/cancellation logic needs to change.

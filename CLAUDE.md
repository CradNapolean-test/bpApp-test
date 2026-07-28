# Central Hub — Coaching Platform

Real hosted rebuild of a fat-loss/coaching prototype (validated in a Claude.ai artifact). The
calculation logic below is already correct and tested against a real spreadsheet — port it,
don't redesign it. See `docs/PROJECT_SPEC.md` for full feature detail per module and
`docs/MIGRATION_ROADMAP.md` for phase sequencing.

## Stack (locked in — don't substitute without discussion)

- **Next.js** — frontend + API routes, one codebase
- **Supabase** — Postgres + Auth (real login, replacing a PIN-gate prototype) + Row Level
  Security + Realtime (chat) + Storage (progress photos)
- **react-zxing** (or similar) + **Open Food Facts API** — barcode scanning + free food lookup
- **Vercel** — hosting

No payment processor for now. Credits are granted manually by the coach (e.g. after cash,
bank transfer, or an existing GoTeamUp subscription handles the actual money) — the ledger
tracks balance and history, it just isn't wired to a checkout flow. Revisit if/when real
in-app purchasing is wanted.

## Build order (see docs/MIGRATION_ROADMAP.md for the full reasoning)

1. Foundation: Next.js + Supabase setup, schema (`supabase/schema.sql`), real Auth replacing
   the PIN gate. Get Row Level Security right here — client data must be private at the
   database level, not just hidden by the UI.
2. Port existing working features (Setup, Weekly Log, Food Tracking, Meal Planner, Activity
   Alternatives, Insights, Overview) — logic in `lib/calculations.ts` is already correct,
   just wire it to real DB queries instead of the old `window.storage` calls.
3. Chat — use Supabase Realtime, not polling.
4. Classes + Credits — ledger-based (`credits_ledger` table, never a single mutable balance).
   Coach manually grants/adjusts credits (a simple "add credits" action in the coach view);
   booking a class deducts, cancelling before the cutoff refunds. No payment processor.
5. Barcode scanning — independent of everything else, can be pulled earlier if useful.
6. Workout program builder — CRUD once the DB exists; should read/write against the
   `client_profiles` strength fields (DB Press, Squats, Pull Ups, RDL, Hip Thrust) already
   defined in the schema.

## Non-negotiables

- Row Level Security on every client-data table — a client must never be able to query
  another client's rows even if they tamper with a request.
- Credits are an append-only ledger, not a mutable integer column, even though top-ups are
  manual for now — keeping it a ledger means adding real payment processing later doesn't
  require a data model change, just a new way of writing to the same table.
- The macro/calorie calculation engine (`lib/calculations.ts`) has already been validated
  against a real spreadsheet used with real clients — treat it as source of truth, don't
  re-derive the formulas from first principles.

## Data seeds

`data/foods.json` (484 items) and `data/activities.json` (44 MET-rated activities) are real
data pulled from the original spreadsheet — use these to seed the `foods` and `activities`
tables rather than sourcing placeholder data.

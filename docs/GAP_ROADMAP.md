# Gap Roadmap — Closing the PT Distinction / TeamUp / MyFitnessPal Gaps

## Context

`docs/COMPETITIVE_GAP_ANALYSIS.md` identified ~15 feature gaps against three competitor
products. That document answers "what's missing"; this one answers "in what order do we
build it, and roughly how."

Rewritten 2026-08-16 to reflect reality: the original Phases 1-4 and 6 have all since
shipped, Phase 5 (video calls) was cut as never-needed, and Phase 7's "lower priority" list
turned out to be partially shipped too (multi-location, and half of branding/white-label) —
this doc had drifted well out of date from the actual codebase.

---

## Shipped

- **Nutrition logging speed** — Quick Add (`food_diary_entries.quick_add_*` columns),
  Favorites (`food_favorites` table, `lib/data/foods.ts`).
- **Habit roster-wide adherence view** — `getRosterHabitAdherence` (`lib/data/coach.ts`),
  `HabitAdherence.tsx`.
- **Class single-occurrence cancellation** — `class_exceptions` table, `cancelClassOccurrence`
  RPC (migration `0051`).
- **Retention automation, v1** — one-off scheduled coach messages via
  `scheduled_communications` + the `send-communications` cron route. (The bigger vision —
  drip sequences, purchase-triggered messages — was deliberately deferred within this phase;
  see "Deeper automations" below, now promoted back to active backlog.)
- **Group coaching content model** — `client_groups` / `client_group_members`,
  `GroupsManager.tsx`.
- **Multi-location support** — the `gyms` system (migrations `0052`-`0056`): a coach can
  belong to multiple gyms, each with its own roster/classes/shared library. Was Phase 7's
  "only matters past one coach/location" item; built anyway as part of the multi-coach work.
- **White-labeling, partial** — coach logo upload/branding (`0047_coach_branding.sql`,
  `CoachBrandingContext.tsx`) is live. A full branded native mobile app is not, and isn't
  planned (see below).

---

## Active backlog

### Web Push notifications

Real push (banner shows even with the app closed), not just the in-app notification list.
The iOS "must be added to home screen" caveat is accepted as fine given clients are expected
to install it that way regardless.

**Shipped (2026-08-16):**
- `push_subscriptions(client_id, endpoint, p256dh, auth)` table, RLS scoped to `is_self`
  (a subscription is a browser/device artifact — a coach's session can't meaningfully manage
  it on a client's behalf, unlike `owns_client`-style organizational data).
- VAPID keypair generated, `lib/push.ts` (`sendPushToClient`, same graceful-degradation
  contract as email/AI photo estimation — unset keys means skip, not throw).
- `public/sw.js` service worker + `public/manifest.json` (linked via `app/layout.tsx`
  metadata), `/api/push/send` as an authenticated HTTP entry point for future/manual triggers.
- Permission-request toggle in the client Account tab (`AccountTab.tsx`) — reflects actual
  browser subscription state, not a DB flag; snaps back off if permission is denied.
- **One trigger wired**: check-in reminders. `send_checkin_reminders` (migration `0060`) now
  returns the client_ids it notified instead of just a count, so the cron route can call
  `sendPushToClient` per client directly — no pg_net/DB-trigger needed, since this cron is
  already TypeScript calling the RPC, matching 0039's established "outbound HTTP happens in
  TS, not plpgsql" precedent (this project has no pg_net set up, and Vercel's Hobby-plan
  once-daily cron limit would make a generic "sweep unpushed notifications" trigger too
  laggy for anything that isn't already inherently daily).

**Still open:**
- Generalizing to every other notification-triggering RPC (booking cancellation, class
  cancellation, form/education assignment, etc.) — each currently only writes the in-app
  `notifications` row. The natural next step per client is adding a `sendPushToClient` call
  at the same TypeScript call site that invokes the RPC (mirrors how `composeCommunication`
  calls `sendBroadcastEmail` right after its own insert) — not a big architectural change,
  just touching each site once it's prioritized.
- iOS add-to-home-screen onboarding nudge (a banner guiding iOS Safari users to install).
- Real on-device delivery hasn't been confirmed by an actual phone yet — build/lint/tests all
  pass and the local send path exercises correctly, but only a real subscribe-and-receive
  test on a real device closes the loop.

### Deeper automations

Explicitly deferred inside the original retention-automation phase, now confirmed as worth
pursuing rather than left dormant: automated onboarding sequences, milestone/purchase-
triggered messages. No Zapier-style external integration scoped yet. Needs its own design
pass when picked up — the existing `scheduled_communications` table + cron pattern is the
likely foundation, extended with trigger conditions beyond "coach picked a send time."

### General flexible scheduling engine

From `COMPETITIVE_GAP_ANALYSIS.md`: placing arbitrary items (not just workouts/classes) on a
calendar, with client-side rescheduling and missed-item alerts. Real gap, but broad and
never fully scoped — needs its own exploration pass before it's buildable.

---

## Deliberately not planned

- **Branded native mobile app** (iOS/Android App Store presence) — high cost, and the web
  app is already faster/more modern than PT Distinction's reviewed mobile app. Logo/branding
  customization (above) covers the in-app white-labeling half already.
- **In-app video call scheduling** — cut; will never be needed.
- Built-in marketing website builder, structured fitness-assessment library.
- Manual waitlist "reserved acceptance window" tier (the simpler always-auto-promote model
  suits current scale).
- URL-based recipe import, restaurant-menu-specific food database depth (inherent to the
  curated + Open Food Facts tradeoff, not an oversight).

## Explicitly out of scope until the payment-processor decision changes

Per `CLAUDE.md`, unchanged by any of the above:
- TeamUp-style recurring billing, self-serve signup + payment, invoicing.
- PT Distinction's purchase-triggered automation sequences and Zapier-to-Stripe bridges.
- Wearable/Apple Health/Google Fit sync (real gap, but unrelated to payments — genuinely just
  not scoped yet; could move into a future phase on its own merits if wanted).

---

## How to use this document

Each active-backlog item becomes its own `EnterPlanMode` pass when picked up — explore the
specific files, confirm schema decisions, write the migration + code, verify with disposable
test accounts, deploy. This document's job is to track what's actually still open, not to
lock in every implementation detail today.

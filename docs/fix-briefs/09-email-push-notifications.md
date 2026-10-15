# Brief 09: Email, push and notifications (app code)

**Goal:** a message that is reported as sent really was sent (or is reported as failed), coaches hear about member messages, push failures are visible, and the daily jobs report that they ran.

**Migration number reserved:** `0139` (email result columns on broadcasts, a `job_runs` table).
**Start after** brief 04 (it shows the results you return in `BroadcastsPane.tsx`). Brief 07 owns the structure of `lib/data/chat.ts`; you add one call there.
**Read for evidence:** `docs/COACH_OWNER_AUDIT.md` (CM1, CM6), `docs/AUDIT_ROUND_2.md` (R2, R39, R40, R41, R42, R45, R46), `docs/PRE_TESTING_CHECKLIST.md` (section 1: email, push, jobs).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never send real email or push, never write to the live database, never run seed scripts.** `.env.local` points at the live project and holds real API keys. Test with mocked clients (`vi.mock('resend')`, a fake `web-push`) and unit tests. Do not print or log keys or addresses.
3. Never edit an existing migration; new file `0139_*.sql` only, idempotent; functions `security definer` with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (ownership in `00-README.md`): `lib/email.ts`, `lib/push.ts`, `lib/data/communications.ts`, the bodies of `app/api/cron/*` (brief 10 changes only the secret check at the top of each cron route). No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file.

## What the live checks showed (so you do not re-derive it)

- Production has `RESEND_API_KEY` but **no `RESEND_FROM_EMAIL`**, so `lib/email.ts:14` falls back to Resend's sandbox sender (`onboarding@resend.dev`), which only delivers to the Resend account owner. Every broadcast or birthday email to members is rejected, and today the coach is told it went. (The owner sets the variable and verifies a domain: brief 12.) Password-reset emails use Supabase's own mailer and work.
- The Resend key in the project can only send (it cannot list domains).
- Two members have web-push subscriptions (both Apple). The VAPID keys match and are accepted. `VAPID_SUBJECT` is unset in Vercel so the sender identifies itself as a personal Gmail address.
- The daily jobs ran on 15 Oct (replenish, reminders). The reminder job also ran for 219 seeded test accounts.

## CM1 (+ R2). Broadcast email reliability and compliance (Medium)

- **Marked sent when it failed.** `composeCommunication` (`lib/data/communications.ts:58`) and the cron (`app/api/cron/send-communications/route.ts:65`) stamp `email_sent_at` whenever a key is configured, even when `sendPersonalisedEmails` sent 0 (`lib/email.ts:50-66` swallows each batch error and returns `{ sent, skipped }` only).
- **Change:**
  1. `sendPersonalisedEmails` and `sendBroadcastEmail` return `{ sent, failed, skipped, reason? }`, counting per batch; log failures to Sentry (counts and the provider error message only, **no addresses**).
  2. Stamp `email_sent_at` only when `sent > 0`; store `email_sent_count`, `email_failed_count`, `email_error` (migration `0139`); a broadcast with failures stays visible as "N sent, M failed" and can be retried by the cron (cap the attempts).
  3. **Sender check:** in production, when `RESEND_FROM_EMAIL` is unset, treat email as **not configured** (`skipped: true, reason: 'sender-not-configured'`) instead of sending from the sandbox address and failing; return that to the caller so the coach screen says "Email is not set up for this gym yet" (brief 04 shows the result).
  4. Apply the same honesty to `lib/data/coachEmail.ts` (it already reports failure; reuse the shared sender check).
- **Unsubscribe and opt-out (compliance, not legal advice):** add a `List-Unsubscribe` header (and one-click `List-Unsubscribe-Post`) plus a footer link to `/unsubscribe?t=<signed token>`; the token is an HMAC of the member id with a server secret (`UNSUBSCRIBE_SECRET`, new env var: list it in `## Status`); the route sets that member's email-notifications flag off without a login. **Brief 10 owns `lib/supabase/middleware.ts`: ask the owner to let `/unsubscribe` through the login redirect** (list it in `## Status`; do not edit the file). Set `replyTo` to the sending coach's address.
- **Long messages:** `chat_messages.text` is limited to 4,000 characters (`0108`) but a broadcast is not length-checked, so a 5,000-character message fails the whole call with a database error: validate in `composeCommunication` with a clear message (and the UI counter in brief 04).
- **Scheduled time (DECISION D11):** scheduled and repeating broadcasts only go out when the daily cron runs (05:00 UTC; on Vercel's Hobby plan a job can start any time in the hour after its time). Default: **keep one daily run**, and export the constant `COMMUNICATIONS_RUN_HOUR_UTC` and a helper `nextRunLabel()` that brief 04's screen uses to say "goes out at the next daily run (about 6 am UK time)". If the owner upgrades Vercel, the route is already idempotent: only the schedule in `vercel.json` (brief 10's file) changes.

## R40. Coaches are never notified of a member's message (Medium, DECISION D19)

- **Where:** `lib/data/chat.ts:13` (`pushMemberIfFromCoach`) only notifies when the **coach** writes. A member's message creates no push and no email for the coach; coaches only see the badge when they open the app (Brad shows 64 unread).
- **Change:**
  1. `sendPushToCoach(coachId, payload)` in `lib/push.ts` (the `push_subscriptions` table is keyed by `client_id references profiles(id)` and its policy is `is_self`, so a coach's own profile id works).
  2. A coach **notification opt-in** on the coach Settings page (a `PushPrompt` for coaches; the member one is `app/dashboard/_components/PushPrompt.tsx`; add a coach version under `app/coach/settings/_components/` and mount it in `CoachSettingsShell.tsx` as a new row; brief 05/08 do not edit that file for this).
  3. Call it from `chat.ts` after a member's message is stored (one added call; brief 07 owns the rest of the file). Payload: "New message from {first name}" with **no message text** (previews on a lock screen are a privacy risk), `url` = the conversation, and a `tag` per member so the service worker replaces repeats (`public/sw.js` is brief 10's: ask it to honour `tag`; list in `## Status`).
  4. **Quiet hours (D19 default):** no push between 21:00 and 07:00 gym time; the in-app badge still counts. Collapse bursts: at most one push per member per 5 minutes.
  5. Optionally also email the coach once email works (flag, default off).
- **Acceptance:** unit tests for the quiet-hours rule and the collapse rule with a fake clock.

## R41. Push failures are invisible and slow down sending (Medium)

- **Where:** `lib/push.ts` counts `failed` but every caller throws it away (`.catch(() => {})` in `lib/data/bigDog.ts:65`, `nutritionFeedback.ts:47`, `app/api/cron/birthdays/route.ts:49`, `checkin-reminders/route.ts:28`); only 404 and 410 are acted on. `lib/data/chat.ts:89` **awaits** the push to every device before `sendMessage` returns.
- **Change:** `sendPushToClient` returns `{ sent, failed, skipped, reasons }`; report failures (status codes and counts, no endpoints) to Sentry; callers log the result; in `chat.ts` run the push **after** the response with Next's `after()` so a slow push service cannot slow the coach's send (one-line change there).

## R42. The push sender identifies itself with a personal Gmail address (Low)

- `lib/push.ts:11`: `VAPID_SUBJECT` falls back to `mailto:basfitnz@gmail.com`. Remove the personal default: read `VAPID_SUBJECT` or `SUPPORT_EMAIL`; if neither is set, skip push with a clear Sentry warning at startup. (The owner sets it in Vercel: brief 12.)

## CM6 (birthdays) + job health

- **`app/api/cron/birthdays/route.ts`** loads every `client_profiles` row with a date of birth in one query; the 1,000-row cap means members past row 1,000 never get a birthday message. Page through with `.range()`; compute "today" per member timezone; keep `birthday_emails_sent` as the once-a-year guard; skip members who turned off notifications.
- **`job_runs` (migration `0139`):** a table `job_runs(job text, ran_at timestamptz, ok boolean, detail text)` written by a shared `recordJobRun(job, ok, detail)` helper called at the end of each cron route (all seven; you own the bodies). It makes "did the job run today" answerable from the database (the audit had to infer it from side effects). Keep the last 60 days.
- **Reminders for test accounts:** nothing to code; the 219 seeded accounts are removed by the owner (brief 12). Make the reminder job skip members with `email like '%@example.com'` **only in non-production** if you want a guard, not in production.

## R39 (DECISION D10). Unused phone-push groundwork

- `push_devices` and `register_push_device` (migration `0113`) are for a phone app that is not part of this project; nothing reads them. Do not build Expo sending. Add a comment at the top of `lib/push.ts` saying so. If the owner decides to remove them (D10), that is a one-line `drop` migration for them later.

## Class cancellations reach members only in the app (Medium, from CM3)

- `cancel_class_occurrence` writes only an in-app notification; for the most time-critical message a gym sends there is no push. In `cancelClassOccurrence` (`lib/data/classes.ts:319`; other briefs edit other functions in that file, keep your change inside this one), read the affected `booked` and `waitlist` client ids **before** calling the RPC, then after it succeeds send each a push ("Strength & Conditioning on Friday 6 pm is cancelled; your credit was refunded"). Do not change the SQL function (briefs 02 and 03 edit it).

## Definition of done

- Unit tests (mocked): sender-not-configured, per-batch failure counting, stamp-only-on-success, unsubscribe token sign and verify, quiet hours, collapse, birthdays paging.
- `## Status` lists the new env vars (`UNSUBSCRIBE_SECRET`, `SUPPORT_EMAIL`), the routes and files the owner or brief 10 must allow or change (`/unsubscribe` in the middleware, `tag` in `sw.js`), and the retry behaviour.

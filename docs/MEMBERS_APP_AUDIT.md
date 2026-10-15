# Members app audit

Date: 2026-10-14 · Scope: the member-facing app (`/dashboard` and everything it depends on) · Code state: working tree on `master` at the time of the audit (uncommitted changes included).

Nothing in the codebase was changed by this audit. Every item below is a finding with a proposed fix, ready to be turned into work.

The coach and owner sides are covered separately in [COACH_OWNER_AUDIT.md](COACH_OWNER_AUDIT.md), and the second, deeper pass (every screen, a live test, the live setup) is in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md). This report covers the member app, plus the shared database policies members can reach (H1 and H2 live in the database and affect coaches too).

## How this was done

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `vitest run` | 20 files, 187 tests, all pass |
| `eslint app lib` | 0 errors, 3 warnings (`VoiceRecorder.tsx:35,72` unused expressions; `CoachMemberOverview.tsx:116` unused `programs`) |
| `npm audit --omit=dev` | 5 advisories: 1 critical (`next`), 4 high. See finding H4 |
| RLS review | Replayed `schema.sql` + all 128 migrations in order to get the *effective* policy set per table (script kept in the session scratchpad), then read every policy and the helper functions they rely on |
| Code read | Auth, API routes, middleware, service worker, dashboard bundle, the data layer for chat / classes / workouts / food / photos / profile / onboarding / push / account deletion, and the main member screens |
| Live check | Ran the dev server and the in-app browser logged in as the test member (Linda Williams). Read-only: measured payload, checked logged-out redirects, ran an accessibility scan. No data was changed |

**Round 2 (see [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md)):** every member screen was then read line by line, the live Supabase and Vercel setup was checked read-only (row limit, auth settings, buckets, environment variable names, headers, what a logged-out caller and a member can read), and the member app was tested in a browser against the live database. That round **did change test-member data** (Linda Williams' 15 Oct log); the "No data was changed" statement above applies to this first pass only.

**Still not covered, so treat as unknown:** any other app that shares the database (migrations 0108 to 0114 contain groundwork for a phone app; you have confirmed this project is the web app only), real iPhone / Safari testing, screen-reader testing, production load.

## Summary

| ID | Severity | Finding |
|---|---|---|
| H1 | High | Any logged-in member can edit or delete the shared exercise library (all gyms) |
| H2 | High | A member can book classes without paying credits, and mark their own attendance, by writing to `bookings` directly |
| H3 | High | Privacy Policy and Terms are placeholder pages, and logged-out visitors cannot even open them |
| H4 | High | `next@16.3.1` is in the range of a critical advisory; four other high advisories |
| H5 | High | Chat (and bookings, workout logs) load unbounded; past ~1,000 rows the newest are silently dropped |
| M1 | Medium | Dashboard sends ~300 KB of data per load, 63% of it the exercise library; blank first paint |
| M2 | Medium | Deleting the last food entry leaves a "0 kcal, logged" day that skews averages and streaks |
| M3 | Medium | Push subscriptions survive sign-out and can be shared between members on one browser |
| M4 | Medium | Voice notes: wrong MIME type on iPhone, no length cap, expiring links |
| M5 | Medium | Chat has no catch-up after the live connection drops; a sent message only appears via that connection |
| M6 | Medium | `/auth/confirm`: open redirect, one-time token burned by link scanners, silent failure |
| M7 | Medium | Public `/api/join`: no rate limit, email never verified, account enumeration |
| M8 | Medium | New members of any age 10+ see a calorie-deficit target before a coach reviews it |
| M9 | Medium | Timezone defaults in the database (`Pacific/Auckland`) disagree with the app (`Europe/London`) |
| M10 | Medium | Members can write coach-owned plan and review fields; a stale Setup form can overwrite coach changes |
| M11 | Medium | No security headers (CSP, framing, referrer) |
| M12 | Medium | Cached barcode foods can be poisoned and can never be corrected in-app |
| M13 | Medium | Secret checks fail open if an env var is unset; AI photo route has no limit |
| L1–L14 | Low | See the Low section |

---

## High

### H1. Anyone logged in can rewrite the shared exercise library

- **Where:** `supabase/migrations/0013_exercise_library_and_program_templates.sql:24-28`. No later migration changes it.
- **What:** the policy is named "authenticated coaches manage exercise_library" but is `FOR ALL TO authenticated USING (true) WITH CHECK (created_by = auth.uid())`. It never checks the role, so members are included. `USING (true)` means any row can be updated or deleted.
- **Impact:** a member using their normal login token against the REST API can rename any exercise, change its `video_url` or `notes`, insert unlimited rows, or delete unused ones. The library is one global catalog shared by **every gym**, so this crosses tenants. `video_url` is shown to all members on the workout screen (`WorkoutTab.tsx:1200`, `VideoDemo.tsx`), so it is also a phishing vector. Edge case: a member who creates a library row (`created_by` has no `ON DELETE` action) later cannot delete their own account.
- **Evidence:** read from the migrations and the replayed policy set. Not exploited against the live database.
- **Fix (new migration):**
  ```sql
  drop policy "authenticated coaches manage exercise_library" on public.exercise_library;
  create policy "coaches manage exercise_library" on public.exercise_library
    for all to authenticated
    using (public.my_gym_id() is not null)                      -- my_gym_id() is only non-null for role = 'coach'
    with check (created_by = auth.uid() and public.my_gym_id() is not null);
  ```
  Decide separately whether owners need write access (`my_gym_id()` is coach-only).

### H2. Members can skip credits and fake attendance by writing to `bookings`

- **Where:** `supabase/schema.sql:393` ("client books for self", `INSERT … WITH CHECK is_self(client_id)`) and `:397` ("client cancels own booking", `UPDATE … USING is_self(client_id)`). No trigger enforces credits; the only triggers on the table are `0064` (advance-booking window, insert only) and `0077` (attendance → gym session).
- **What:** the `book_class` function (0107) does the credit check, capacity, past-date and gym checks, but it is not the only way in. The table policies let a member insert any row with `status = 'booked'`, and update any column of their own bookings, including `status`, `attended`, `attended_at`, `no_show`.
- **Impact (credits are the revenue mechanism):**
  1. Book any class for free, over capacity, on a past date, or for another gym's class (foreign keys ignore RLS).
  2. Book, cancel via the RPC (refund), then set `status` back to `booked`: a free session.
  3. Set `attended = true`: inflates "sessions done", the 100/250/500 club progress, and rewards (`member_reward_progress`); the `0077` trigger also ticks `gym_session` on their daily log. Clear `no_show` to avoid penalties.
- **Fix:** every write in the web app goes through RPCs (`lib/data/classes.ts` only reads the table), so the policies can simply go:
  ```sql
  drop policy "client books for self" on public.bookings;
  drop policy "client cancels own booking" on public.bookings;
  ```
  Before applying, check that nothing else (a script or any other app) writes to `bookings` directly. Optionally add a self-check-in time window to `check_in_booking` (finding L6).

### H3. Privacy Policy and Terms are placeholders, and logged-out people cannot open them

- **Where:** `app/legal/_components/LegalPageShell.tsx` (page text is "Your coach hasn't published a … yet"); `lib/supabase/middleware.ts:52-59` (the login-redirect exemption list has no `/legal`); links from `LegalFooterLinks` (login, join), `JoinForm.tsx:62` ("By continuing you agree to our terms and privacy policy") and `AccountTab.tsx:215-216` ("How we use your data").
- **Verified live:** with cookies omitted, `/legal/terms` and `/legal/privacy` return a redirect to login; `/login` and `/join/abc` return 200.
- **Impact:** the app collects health notes, body-composition scans, weight, progress photos, voice notes and emergency contacts. New members are told they agree to documents that do not exist and that they cannot read before signing up. This is a launch/compliance gap (UK GDPR if members are in the UK, which the code assumes: London timezone, stones and pounds; the NZ Privacy Act 2020 if they are in NZ). This is not legal advice. There is a delete-my-account flow but no way to export a member's own data.
- **Fix:** write and publish the real documents; add `/legal` to the exemption list in `updateSession`; decide on a data-export (access request) path.

### H4. Dependencies: `next@16.3.1` and four others

- **Where:** `package.json` (`next` 16.3.1 installed).
- **What:** `npm audit` flags `next` as critical for 16.0.0–16.3.7 (RCE advisories fixed in 16.3.3 and 16.3.6, plus SSRF, cache-poisoning and info-disclosure fixed in 16.3.8). Also high: `sharp`, `fast-uri`, `source-map-js`, `brace-expansion` (all transitive).
- **Exposure:** several advisories concern self-hosted servers (Windows hosts, image optimizer, `next/og`). The app uses `next/image` in two places (`Logo.tsx`, `CoachBrand.tsx`), does not use `next/og`, and is hosted on Vercel, which reduces but does not remove exposure.
- **Fix:** upgrade `next` to the latest 16.x patch (at least 16.3.8; `npm audit` suggests 16.4.0) and run `npm audit fix` for the transitive ones; rebuild and run the tests.

### H5. Unbounded queries: newest data is dropped after ~1,000 rows

- **Where:** `lib/data/chat.ts:47` (`getMessages`: ascending, no limit); `lib/data/classes.ts:78` (`getUpcomingBookings`: despite the name it returns *every* non-cancelled booking ever, ascending); `lib/data/workouts.ts:197` (`getWorkoutLogs`: one row per set, descending, no limit).
- **What:** Supabase/PostgREST returns at most "Max Rows" per request, **1,000 by default**. For ascending queries the cut-off removes the *newest* rows.
- **Impact:** a coach–member thread that passes ~1,000 messages stops showing new messages after a reload (live ones still appear until the page is refreshed). A member past ~1,000 non-cancelled bookings loses their upcoming bookings and their session count caps (the club tiers go to 500 and beyond, so this is expected to happen to the best members). Workout logs at ~20 sets per session hit 1,000 in under a year; older sets are dropped, which silently changes "last time", personal bests and the Strength tab.
- **Also:** `getMessages` creates one signed-URL request per photo or voice note on every dashboard load.
- **Fix:** paginate chat (load the latest 50, fetch older on scroll, order descending then reverse); give `getUpcomingBookings` a real date filter plus a separate count query for sessions attended; bound workout history by date or per-exercise. Confirm the project's Max Rows setting.

---

## Medium

### M1. Dashboard payload and first paint

- **Measured (dev server, test member with little data):** the `/dashboard` document is 347 KB, of which the serialised page data is 300 KB. By prop: `exerciseLibrary` 190 KB (474 exercises, 63%), `occurrences` 32 KB, `programs` 15 KB, `educationAssignments` 11 KB, `educationCourses` 8 KB. Production is minified and compressed, but the data volume is real and grows with the library and with every member's history.
- **Causes** (`lib/data/dashboardBundle.ts:57-137`, `DashboardShell.tsx`):
  - The full exercise library is sent to every member, who only needs the videos for exercises in their own programme plus names for the "record a tested max" list. Slimming rows to `id, name, video_url` is 72 KB; limiting to the member's exercises is a few KB.
  - Props fetched but never used on the member path: `creditsLedger` (unbounded), `habits`, `packages`, `creditPacks`; `programTemplates` is coach-only since 0125.
  - About 40 queries run on every page load, then three more sequential ones.
  - `DashboardShell.tsx:619` wraps everything in `ClientOnly`, so the server sends an empty `div` and nothing paints until the JS has loaded and run (seen in the browser: blank dark screen first).
  - Three `auth.getUser()` network calls per navigation (middleware, root layout, page) plus two profile reads. `getClaims()` or a cached helper would remove most of that.
- **Fix:** fetch the library lazily (or only referenced rows); delete the unused fetches; move low-value sections (education, events, rewards) to on-demand loads; render a skeleton server-side instead of `ClientOnly`.

### M2. An emptied food diary counts as a logged day

- **Where:** `lib/data/foodDiary.ts:147` and `lib/data/manualMacros.ts:99` write `0 / 0 / 0` into `daily_logs` when the last entry is removed. `hasLoggedData` (`lib/utils/dailyLog.ts`) treats `0` as logged because it tests `!= null`.
- **Impact:** add a food by mistake then delete it, and that day becomes a "logged, 0 kcal" day: it drags weekly calorie averages down (`weeklyAverages.ts`, `WeeklyLogTab.tsx:183`), extends the streak, and counts as activity for the coach's health indicators (`coachDashboard.ts`).
- **Fix:** write `null` when there are no entries.

### M3. Web push survives sign-out and can reach the wrong person

- **Where:** `supabase/migrations/0060_push_subscriptions.sql:22-30` (unique on `(client_id, endpoint)`, not on `endpoint`); `SignOutButton.tsx` (clears the offline snapshot but does not unsubscribe).
- **Impact:** on a shared phone or tablet, after member A signs out and member B enables push, the same browser endpoint belongs to both. Coach messages for A (with up to 120 characters of preview, `lib/data/chat.ts:12-25`) are delivered to whoever holds the device. The newer `push_devices` table (0113) already solves this for phones by moving a token to one member only.
- **Fix:** unsubscribe and delete the row on sign-out; register web subscriptions through a function that removes the endpoint from any other member, like `register_push_device`.
- **Related:** the server never sends to the phone-app tokens (`lib/push.ts` only reads `push_subscriptions`), so phone-app push is not wired on the server side yet.

### M4. Voice notes

- `VoiceRecorder.tsx:53` labels every recording `audio/webm`. Safari/iPhone records MP4/AAC, so the bytes and the label disagree; older iOS cannot play WebM sent from a desktop Chrome coach.
- No recording length limit. The note is sent through a Server Action capped at 4 MB (`next.config.ts`), so roughly 3–4 minutes fails and the recording is lost. The storage bucket allows 20 MB.
- Signed links last 10 minutes (`chat.ts:7`, `ChatTab.tsx:16`); playback after that fails, and `ChatTab.tsx:67-77` shows the pause icon even when `play()` was rejected.
- **Fix:** pick a supported MIME type with `MediaRecorder.isTypeSupported`, send the real type, cap recording at about 2 minutes, upload straight from the browser like chat photos, refresh signed URLs on play.

### M5. Chat reliability

- `ChatTab.tsx:229-241`: after `sendMessage` the text box is cleared but the message is only added when the realtime event arrives. If the subscription is not live (backgrounded phone, dropped socket, `ChatTab.tsx:163-214` has no status handling), the sender sees nothing happen and may resend.
- A coach reply that arrives while the app is backgrounded is never fetched; the unread badge in `DashboardShell.tsx:235-260` has the same blind spot.
- **Fix:** add the sent message locally (or refetch) on success; on `visibilitychange` and on reconnect, refetch messages since the last one.

### M6. `/auth/confirm`

- **Open redirect:** `app/auth/confirm/route.ts:34` redirects to any `next` value. A link built with the attacker's own valid token and `next=https://evil.example` logs the victim into the attacker's account and then sends them off-site. Fix: accept only same-origin relative paths.
- **Token burned by scanners:** the route verifies the one-time token on a GET. Email security scanners that open links in advance use up the token, and the user then lands on `/login` with no explanation (line 38). Fix: show a "Continue" button page that POSTs, and show a message on failure.

### M7. Public sign-up endpoint

- **Where:** `app/api/join/route.ts` (account creation at lines 34-45).
- **What:** anyone with a coach's (reusable, by design) link can create unlimited accounts: no rate limit or CAPTCHA, `email_confirm: true` marks any address verified without proof of ownership, and the 409 response ("already an account with that email") reveals which emails are registered. Raw Auth error text is returned for other failures. Each account is attached to the coach and gym, so spam signups appear in the coach's client list.
- **Fix:** rate limit by IP and token; send a confirmation email instead of `email_confirm: true`; return one generic message; optionally add token expiry or a usage cap.

### M8. Calorie targets for flagged new members (safeguarding)

- **Where:** `lib/onboarding.ts:95-103`, `lib/data/onboarding.ts` (accepts ages 10–100), `lib/calculations.ts:173` (`CALORIE_FLOOR` is advisory only).
- **What:** every new member gets a fat-loss target immediately. Under-18s, goal weight not below start weight, a target under 1,200 kcal and "health notes added" only add a *reason on the coach's review list*; the member sees the number straight away (Coach tab, Setup). There is no underweight (BMI) check, and `activityLevel` is not validated against the allowed options.
- **Fix (needs your decision):** hold the target back (or show a neutral "your coach is setting this up") for flagged members until the coach confirms; add a BMI floor flag; block or route under-16s differently; validate `activityLevel`.

### M9. Timezone defaults disagree

- `client_profiles.timezone` defaults to `Pacific/Auckland` (`0044:9`) and `gyms.timezone` defaults to `Pacific/Auckland` (`0064:14`), but `DEFAULT_TIMEZONE` in the app is `Europe/London` (`lib/utils/dates.ts:20`) and the Setup code says the gym is UK-only. The `0064` comment says the live gym row must be updated by hand.
- **Why it matters:** the server rules (book not in the past, check in only "today", cancel cut-off and refund) use the **gym's** timezone, while the member screens use the **member profile's**. If the gym row is still on Auckland, UK evening sessions cannot be checked in to, and refund cut-offs shown to the member disagree with what the server does by about 11–12 hours.
- **Check now:** `select name, timezone from gyms;` and `select timezone, count(*) from client_profiles group by 1;` (the seeded test member Linda is on Auckland, which is why the app showed her "Thu 15 Oct" on the 14th). Then change both column defaults.

### M10. Coach-owned fields are member-writable; whole-form saves

- `0110` blocks members from only four columns (reminder days, join date, referral source, admin notes). A member can still set `needs_coach_review`, `review_reasons`, `nutrition_goal`, `nutrition_setting`, `diet_approach`, `deletion_requested_at` and `onboarding_completed_at` through the API. The UI hides these, so this is an integrity gap (a member can clear the safety-review flag in M8), not a way into anyone else's data.
- `SetupTab.tsx:176` / `clientProfile.ts:20`: the member saves the **whole** profile form. If the coach changes goal, setting or weights while the member has the screen open (it is a PWA and stays open), the member's next save silently puts the old values back.
- **Fix:** extend the `0110` trigger to the plan and review columns; save only changed fields.

### M11. No security headers

- `next.config.ts` and `vercel.json` set none. Missing: Content-Security-Policy, `frame-ancestors` / `X-Frame-Options` (the app can be framed for clickjacking), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera, microphone, geolocation). The app handles health data and photos, so a baseline should be added.

### M12. Barcode cache poisoning

- `lib/data/foods.ts:53` + `0106`: the first member to scan a barcode writes the shared `foods` row, and later writes are silently ignored (unique barcode). A member can also insert any barcode with arbitrary plausible macros directly through the API. There is no `UPDATE` or `DELETE` policy on `foods`, so a wrong entry (for example fat entered as 0 for a product Open Food Facts lacked) stays wrong for all members and can only be fixed in SQL.
- Open Food Facts is called on the legacy `api/v0` endpoint (`lib/openFoodFacts.ts`).
- **Fix:** a coach/owner correction path (or a `hidden` toggle in the UI); store member-entered values per member until verified.

### M13. Secrets that fail open; unprotected AI route

- All seven cron routes and `/api/push/send` compare `Authorization` with `` `Bearer ${process.env.CRON_SECRET}` `` (for example `app/api/cron/expire-credits/route.ts:9`). If the variable is unset the expected string is `"Bearer undefined"`, which any caller can send. Middleware exempts `/api/cron/*` from login, so these are reachable by anyone. Fix: refuse when the variable is missing; use a constant-time comparison.
- `/api/push/send` can never be reached by an outside caller (verified: middleware redirects it), so the `.env.local.example` note that a Postgres trigger calls it is wrong; the route only works for a logged-in session.
- `/api/estimate-food-photo` lets any logged-in member trigger paid Anthropic calls repeatedly. It is currently unused by the UI (photo diary is visual only). It also has an unchecked `request.json()`, interpolates the member's description into the prompt, rewrites the day's macros via `syncFoodPhotosToLog`, and uses model id `claude-sonnet-5` (`lib/ai/estimateFoodPhoto.ts:8`), which I could not verify is a valid ID. Remove the route or add auth-level limits.

---

## Low

- **L1. `programWeek` is wrong after 12 weeks.** `dashboardBundle.ts:143-146` takes the first log inside an 84-day window, so it reads "week 13" forever. It only changes the phase label and step target (`weeklyTarget` uses the same calories every week), so the calorie engine is unaffected.
- **L2. Streak card.** `TodayTab.tsx:30-39` starts counting from today, so it reads 0 each morning until something is logged, and it can never exceed 85 days (history window).
- **L3. Account toggles do not roll back.** `AccountTab.tsx:94-98` and `:113-117` flip the switch optimistically; on failure the switch stays flipped.
- **L4. Workout logging.** After deleting a middle set, `nextSetNumber = logs.length + 1` reuses a number; an all-empty set can be logged; local block choices (`localChoices`) are never reconciled with server data; "Finish workout" is only a toast.
- **L5. Booking sheet duplicates server logic.** `ClassesArea.tsx:94-96` takes blackout hours and cut-off from `occurrences[0]`, which is empty when no sessions are scheduled, and recomputes refund eligibility in the browser.
- **L6. Check-in has no time window.** `0071` only requires today's date, so a member can check in at 00:01 or after class.
- **L7. Accessibility.** No `<main>` landmark; the chat photo is a clickable `<img>` with no keyboard access and the viewer has no focus trap; RPE and mood buttons rely on colour and position; some targets are under 32 px (Dismiss on the event banner is 28 px). The automated scan found no unnamed buttons, links, images or inputs on Home and Coach.
- **L8. Housekeeping.** `docs/SECURITY_DEFINER_AUDIT.md` is cited by migrations `0105` and `0110` but does not exist in the repo; `AccountTab` declares `deletionRequestedAt` but never uses it; the coach-only header branch in `DashboardShell.tsx:524-544` contains member-only dead code; `getUpcomingBookings` is misnamed.
- **L9. Orphans and ordering.** `deletePhoto` / `deleteFoodPhoto` remove the file before the row, so a failed row delete leaves a broken photo; `sendVoiceNote` and chat photo upload leave the file behind if the message insert fails.
- **L10. Member bundle carries coach code.** `WorkoutTab.tsx` imports the whole programme-editing action set for members.
- **L11. Uploads trust the filename.** `uploadProgressPhoto` / `uploadFoodPhoto` build the storage path from `file.name`'s extension and a caller-supplied date. The database trigger pins the first path segment to the owner and the buckets enforce size and MIME limits, so impact is low.
- **L12. Gym tablet / offline.** Logging a set while offline fails with a toast and nothing is queued; the offline page only shows a cached plan.
- **L13. Rate limits.** Beyond Supabase Auth's own limits there is no app-level throttling on login, reset or chat sends.
- **L14. Gym-visible tenant info.** Any member can read all gyms' names and settings (`gyms` select policy is `using (true)`).

---

## Checked and sound

- **RLS is on for all 79 tables.** The two with no policies (`birthday_emails_sent`, `coach_email_log`) are deny-all and only used through the service-role client.
- **Member isolation holds in the effective policies.** Own-row access uses `is_self` / `owns_client`; gym-wide policies use `my_gym_id()`, which only returns a value for the `coach` role, so none of the "gym coaches manage …" policies apply to members. `credits_ledger` is insert-only for coaches and select-only for members, so the ledger cannot be edited from a member login.
- **Booking RPCs are solid.** `book_class` validates gym, date, weekday, cancellations, balance and capacity under an advisory lock; `cancel_booking` refunds by cut-off; function execute grants were tightened in `0105`.
- **Account deletion cascades.** Every foreign key from member-owned rows hangs off `profiles` with `ON DELETE CASCADE`; the 24 that do not are all coach-side columns. Storage files are removed first.
- **Admin (service-role) client use is narrow and gated** in the places I read (`deleteAccount`, `nutritionFeedback`, `bigDog`, `onboarding`, `push`, `/api/join`): coach-only actions fail at the RLS insert before they reach it, and account deletion checks the caller's role. `coachEmail.ts` and the coach create-client / import routes were not reviewed.
- **Storage buckets** have size and MIME limits (`0108`, `0109`, `0114`).
- **No `dangerouslySetInnerHTML` except a static theme script;** video links are host-checked; broadcast email HTML is escaped; React 19 blocks `javascript:` hrefs.
- **Service worker** caches only hashed static files and icons and never pages or API data; sign-out clears the offline snapshot.
- **Auth pages** handle the PKCE and hash-fragment recovery flows, show neutral wording on password reset, and the middleware correctly carries refreshed session cookies across redirects.
- **Tests and types:** 187 passing tests cover the calculation engine, streaks, clubs, check-in metrics, workout sections and more; types compile clean.

---

## Please verify (cannot be seen from the code)

1. In the live database: `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where tablename in ('exercise_library','bookings');` to confirm H1 and H2 are real there too.
2. Supabase → Settings → API → **Max Rows** (H5).
3. `select name, timezone from gyms;` and `select timezone, count(*) from client_profiles group by 1;` (M9).
4. Vercel environment: `CRON_SECRET`, `PUSH_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `VAPID_*` are set in production (M13).
5. Whether anything other than this web app (a script, or any other app) writes to `bookings`, `exercise_library` or `client_profiles` directly before dropping or tightening policies.
6. Supabase Auth settings: leaked-password protection, minimum password length, and "secure password change" (the in-app change-password form asks for no current password).

## Suggested order

1. **This week, database only (one migration):** H1 and H2 policy fixes, the `0110` trigger extension (M10), `push_subscriptions` endpoint handling (M3), timezone defaults (M9). Low risk, high value.
2. **Before more members join:** H3 (legal pages and route exemption), H4 (upgrade `next` and run `npm audit fix`), M13 (fail-closed secrets), M6 and M7 (auth hardening), M8 (decision on new-member targets).
3. **Before the data grows:** H5 (pagination and date bounds), M1 (payload and first paint), M2 (zero-day fix).
4. **Then:** M4, M5, M11, M12 and the Low list.

## Appendix: numbers

- Effective policy replay: 79 tables, 0 without RLS, 2 deny-all.
- `/dashboard` payload on the test member: document 347 KB; page data 300 KB; `exerciseLibrary` 190 KB; 474 library rows; trimmed to `id,name,video_url` it is 72 KB.
- Foreign keys to `profiles` / `auth.users`: 71; 24 without `ON DELETE` (all coach-side).
- Logged-out redirect check (cookies omitted): `/legal/*`, `/dashboard`, `/api/push/send`, `/auth/confirm` redirect; `/login`, `/join/*` return 200; `/api/cron/*` returns 401.

# Brief 07: Member app: speed, reliability and everyday UX (app code)

**Goal:** the member app loads fast on a gym's weak mobile signal, never silently drops data past 1,000 rows, recovers from a dropped connection, and behaves correctly on a phone (back gesture, shared devices, app updates).

**Migration numbers reserved:** `0137` (a strength personal-bests function), `0138` (a `gyms.referral_url` column).
**Start after** briefs 04 (shares `ChatTab.tsx`), 06 (shares food screens) and 09 (adds a coach-notification call in `chat.ts`) are merged.
**Read for evidence:** `docs/MEMBERS_APP_AUDIT.md` (H5, M1, M3, M4, M5, L5, L12), `docs/AUDIT_ROUND_2.md` (R8, R13, R16, R17, R18, R20, R21, R22, R23, R43, "Smaller items: member screens", LT5, LT6, LT7).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project. In a browser do **not** log, send or save against live data. Verify with unit tests (`vitest` only; extract pure logic into helpers; a component-test library needs the owner's approval) or on a sandbox. Read-only measuring of page weight and queries on the dev server is fine.
3. Never edit an existing migration; new files `0137_*`, `0138_*` only, idempotent; functions `security definer` with `set search_path = public`, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (ownership in `00-README.md`). No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file.

## Speed and size

### R13 + M1. Every save re-renders the whole dashboard; the page ships 300 KB of data (Medium, measured)
- **Measured live (dev):** each Server Action pays 60 to 390 ms in the sign-in check (`proxy.ts`); adding one food is two requests (about 0.9 s and 0.26 s); every check-in or diary save is followed by a full `GET /dashboard` of 3.0 to 3.4 s that reloads the 40-query bundle. The `/dashboard` document is 347 KB, of which 300 KB is page data: `exerciseLibrary` 190 KB (474 rows, 63%), `occurrences` 32 KB, `programs` 15 KB, `educationAssignments` 11 KB.
- **Change (`lib/data/dashboardBundle.ts:57-137`, `DashboardShell.tsx`):**
  1. **Stop sending the whole exercise library.** Send only the rows referenced by the member's programmes, with `id, name, video_url, image_url`; load the rest on demand for the "record a tested max" list.
  2. **Delete fetches the member path never uses:** `creditsLedger` (unbounded), `habits`, `packages`, `creditPacks`. (Brief 06 adds its own small credit-history fetch.)
  3. Move low-value sections (education courses and assignments, events, rewards) to on-demand loads when that tab opens.
  4. Replace the three `auth.getUser()` network calls per navigation (middleware, root layout, page) with one cached helper (`getClaims()` or a per-request memo) and drop the duplicate profile reads.
  5. Replace `ClientOnly` (`DashboardShell.tsx:619`) with a server-rendered skeleton so the page paints before the JavaScript runs; the sign-in page and every coach hub use `ClientOnly` too, so make the same change where it is cheap.
  6. **Reduce `router.refresh()`:** make `useAction` accept `{ refresh: false }` and update local state from the action's returned row for the common saves. (Food and check-in screens are brief 06's; you change the shared hook and the other screens.)
- **Acceptance:** report before and after: `/dashboard` document size (target under 120 KB), number of queries (target under 15), and that a check-in save does not call `GET /dashboard`.

### H5. Unbounded queries drop the newest data after about 1,000 rows (High)
- **`lib/data/chat.ts:47` (`getMessages`):** ascending, no limit; also one signed-URL request per attachment on every load. **Change:** load the latest 50 (`order created_at desc`, then reverse), "Load earlier" fetches the previous 50; sign attachment URLs lazily when a message scrolls into view.
- **`lib/data/classes.ts:78` (`getUpcomingBookings`):** despite its name it returns every non-cancelled booking ever. **Change:** a date filter (`booking_date >= today - 1 day`) and a separate `count` query for sessions attended; rename the function.
- **`lib/data/workouts.ts:197` (`getWorkoutLogs`):** one row per set, newest first, no limit; about 20 sets a session reaches 1,000 in under a year, silently changing "last time" and personal bests (ST1: the Strength tab computes PBs from the capped list). **Change:** bound the history by date for the day view, and add `member_strength_bests(p_client uuid)` (migration `0137`, caller is that member or their coach) that returns each exercise's best set; use it for PBs.
- **Confirm the project's Max Rows setting** (live check on 14 Oct: 1,000) and keep every query below it.
- **Acceptance:** tests with 1,500 rows prove the newest are returned and older ones page in.

### R43. The sign-in page loads 1.15 MB of JavaScript and CSS (Low)
- Production: 10 files, the biggest four 441, 242, 152 and 110 KB (uncompressed), for a two-box screen. Lazy-load Sentry, the confirm and toast providers and the splash; check with a bundle analyzer (`npx next experimental-analyze` or similar) and report the before and after. (Caching headers are brief 10.)

## Reliability

### M5. Chat after a dropped connection (Medium)
- **`ChatTab.tsx:229-241`:** after `sendMessage` the box clears but the message only appears when the realtime event arrives; if the socket is down the sender sees nothing and resends. **`ChatTab.tsx:163-214`** has no subscription-status handling; **`DashboardShell.tsx:235-260`** unread badge has the same blind spot.
- **Change:** add the sent message to local state immediately (with a pending marker) and reconcile with the server row; on `visibilitychange` and on realtime reconnect, refetch messages after the last known one; surface "Reconnecting" when the channel is not subscribed.

### M4. Voice notes (Medium)
- **`VoiceRecorder.tsx:53`** labels every recording `audio/webm`; Safari/iPhone records MP4/AAC, so the bytes and label disagree and older iOS cannot play WebM. **Change:** choose a supported type with `MediaRecorder.isTypeSupported` (prefer `audio/mp4`, fall back to `audio/webm;codecs=opus`) and send the real type; cap recording at 2 minutes with a visible timer; the action is capped at 4 MB, so upload from the browser straight to storage like chat photos; signed links last 10 minutes: refresh on play, and fix `ChatTab.tsx:67-77` showing "pause" when `play()` was rejected.

### R8 + LT6. App updates and version skew (Medium)
- Every commit to `master` deploys. A member who left the app open runs old JavaScript; their next action can fail with "Failed to find Server Action". The service worker only updates when `sw.js` itself changes, `ServiceWorkerRegister` can **reload the page automatically** (it did mid-typing during the live test), and there is no "new version" notice.
- **Change:** expose the build id (`/api/version` or a header), compare on `visibilitychange`, and show a banner "A new version is ready. Update" that the member taps; never auto-reload while a form or sheet is open. Skew protection itself is a Vercel setting (brief 12).

### R18 + M3. Push on a shared browser (Medium)
- **`PushPrompt.tsx`** stops when the browser already has a subscription (`if (existing) return`), so a second member on the same device never gets their own row while the first member's pushes (with message previews) keep arriving. **Change:** on sign-in and in the prompt call brief 01's `register_web_push(endpoint, p256dh, auth)` (it moves the endpoint to the signed-in member); on sign-out unsubscribe and delete the row (`SignOutButton.tsx`, one small edit; brief 11 does not touch it).

### R20. Looking at something marks it reviewed (Medium)
- `PhotoDiaryTab.tsx` calls `markReviewed('diary_day')` as soon as a coach opens a day with photos (also while paging through days); a coach expanding a completed form marks it reviewed too (FM3). **Change:** mark reviewed only on an explicit "Mark reviewed" action or when the coach saves feedback for that day.

## Phone behaviour

### R21. Back gesture closes the screen instead of the sheet (Medium)
- These overlays do not register with `useBackHandler`: `AddFoodSheet`, `FoodTrackingTab`'s `EditEntrySheet`, `BarcodeScanner` and the shared `ConfirmDialog`; `BottomSheet`, `FocusOverlay` and the photo viewers do. With one open, Android back or the iOS swipe runs the dashboard's popstate handler and leaves the screen, losing what was typed or scanned. **Change:** register all four (the first three are food files from brief 06: keep the edit to the hook call; `ConfirmDialog`'s dialog semantics belong to brief 11, you add only the back handler).

### R22. Onboarding (Medium)
- **State is only in React:** a refresh, phone eviction or call mid-way loses five steps of answers. **Change:** save each step as it completes (a `saveOnboardingStep` action writing to `client_profiles`, or a draft in storage keyed by user id and cleared on finish and on sign-out).
- **No consent or privacy step** although it collects health notes and an emergency contact; add one linking to the real policy (content comes from the owner, D13) with an "I agree" box recorded with a timestamp (migration `0138` also adds `client_profiles.consented_at timestamptz null`; it is member-writable, so list it for brief 01's trigger in your `## Status`).
- **No way out:** add a sign-out link. **OB3:** the short flow (chosen whenever a profile row exists with onboarding null) never asks height, weight or plan, so a member can finish with no targets: ask for what is missing.
- Brief 08 (CH3) stops "Ask all my clients to confirm details" from replacing the whole app; make the onboarding flow accept a "confirm details" mode (a dismissible prompt, not a lock) if brief 08 asks for it.

### R17 (UI half). The class check-in button disagrees with the server (Medium, DECISION D5)
- **`CheckInButton.tsx:21-22`** allows 2 minutes before to 15 minutes after the start. Brief 03 makes the server allow **30 minutes before to 60 minutes after** (default D5). Import the same two numbers from one shared constant (`lib/checkinWindow.ts`), show "Check-in opens at 5:45 pm" when closed, and unit-test the window.

## Content and data shown to members

### R16 (DECISION D7). Referral link and FAQ (Medium)
- **`CommunityTabs.tsx`:** `REFER_URL` is hard-coded to the Salford Quays site for every member (so Worsley members share the wrong gym, and no referral can be credited), and the copy says "your discount is already applied". The FAQ hard-codes rules that are wrong or configurable: clubs "100, 200, 300" (real: `CLUB_MILESTONES` in `lib/clubs.ts` = 100, 250, 500, then every 500), "progress is on Home under My progress" (that tab was removed in the latest commit), plan names and session counts that do not match the live plans, and the cancellation rule written as fixed text although the gym setting (`cutoff_hours`, blackout) is configurable.
- **Change:** migration `0138` adds `gyms.referral_url text null`; the referral card reads the member's gym and is **hidden** when it is null (a settings field for admins is added by brief 08); build the FAQ answers from data where it exists (club tiers from `CLUB_MILESTONES`, plan names and credits from the member's plan, cancellation text from the gym's settings, as `ClassesArea` already does) and keep the rest in one `faqContent.ts` file for the owner to edit, with a visible TODO list of statements the owner must confirm. The file's own comment says the answers are drafts for review.

### Smaller items
- **ED1:** locked lessons (`unlock_at` in the future) still ship their title, text and link; filter them in the query for members. YouTube embeds should use `youtube-nocookie.com`. **ED link safety:** render a lesson link only when it is `https://`.
- **R23 (app half):** `ExerciseEditor.tsx` (`MemberExerciseRow`) loads the library entry's `image_url` as an `<img>` from any host on every member's workout screen. Only render hosts in an allow-list (your own storage plus a small configurable list), with `referrerPolicy="no-referrer"`; otherwise show a placeholder. Brief 01 adds the database `https` check.
- **UI2:** `useInstall` misses iPadOS 13+ (it reports a Macintosh user agent); detect with `navigator.maxTouchPoints > 1` so gym tablets see install help.
- **SH6:** the splash holds a full-screen overlay for 1.8 s on every cold start; hide it as soon as the app is ready (minimum 400 ms).
- **EV1:** `EventBanner.tsx` formats dates for New Zealand (`en-NZ`); use `en-GB` like the rest.
- **BD1:** the gender field is binary and labelled "Gender" though it is used as sex in the calorie formula: relabel "Sex (used for calorie calculations)" and say why.
- **CT3:** the feedback form should say the member's name goes with it.
- **L12:** logging a set offline fails with a toast and nothing is queued: at least keep the typed sets and retry when back online (note if you skip).

## Definition of done

- Report with before and after numbers for payload, query count and refresh calls; tests for the paging, the check-in window, the allow-list and the version-compare helper.
- `## Status` lists skipped items with reasons and anything the owner must do (set `gyms.referral_url`, supply FAQ and policy text).

## Status

Branch `fix/07-member-platform` (cut from `fix/06-member-data`, so it contains briefs 01 to 06 as well), 16 commits plus this status commit. It was pushed once to the remote **as a branch only** (`origin/fix/07-member-platform`) on the owner's request; it was **not merged to `master` and nothing was deployed**. Two migrations: `0137_member_strength_bests.sql` and `0138_referral_url_and_consent.sql`.

**Not tried against a real database or in a browser as a signed-in member.** There is no sandbox, and a member's own page writes today's blank rows when it loads, so it was not opened against live data. What did run: `npx tsc --noEmit` (clean), `npx eslint app lib` (0 errors; the one old warning in `CoachMemberOverview.tsx`), `npx vitest run` (704 pass, run in a clean copy of the committed tip so the owner's uncommitted edits could not hide a problem), `npx next build`, and a production server to measure the sign-in page (below).

**Deploy order matters.** Apply `0136` and `0137` before deploying this code (it calls `member_strength_bests`; the Strength tab shows no earlier bests without it) and `0138` before the owner sets a referral link. The earlier briefs' orders still apply (see their Status sections and brief 12): `0143` goes last, after the deploy. The consent save and the push registration fall back to the old behaviour if `0138` / `0128` are not applied yet.

### Before and after

| Measure | Before | After |
|---|---|---|
| Sign-in page, scripts and styles in its HTML (production build, uncompressed) | 10 files, 1,149 KB (332 KB gzipped) | 10 files, 693 KB (201 KB gzipped) |
| Sign-in checks per page view | 3 (middleware, layout, page), each a network call | 1 network call (layout and page share it); the middleware checks the token locally |
| Set logged on the workout screen | one set save, then a full dashboard reload | one set save; the screen updates itself |
| Check-in save | no reload per save (brief 06) | unchanged |
| `/dashboard` document size | 347 KB (measured by the brief) | **not measured** (needs a member session). By what was removed it should be roughly 100 to 130 KB: the 190 KB library is now only the entries the member's programmes use, the 32 KB timetable and 11 KB of course assignments are fetched on open, and the credit history, habits, plans, credit packs, form and programme templates and course list are gone from a member's page. **The brief's target is under 120 KB; this is an estimate, not a result.** |
| Data calls a member's page makes (counted from the code, not measured) | 47 | 39 |

**The "under 15 queries" target was not met.** Getting there means every tab loading its own data, which is a rewrite of the page's structure; I did the heavy and unused parts and stopped.

### Findings

| ID | Result | Commit | Notes |
|---|---|---|---|
| R13 + M1 (1) library | done | `53cbc18` | A member's page carries only the library entries their programmes use (`lib/programLibrary.ts`); the coach's view of a member still carries the whole library. "Record a tested max" reads its exercise list when the form opens (`getExerciseOptions`). |
| R13 + M1 (2) unused fetches | done | `53cbc18` | Removed the credit history (nothing showed it) and habits from both pages, and plans, credit packs, form and programme templates from a member's page (coach-only). |
| R13 + M1 (3) on demand | partly | `53cbc18` | Timetable (Book screen and FAQ), Education courses and assignments, tested-max list and the Strength tab's earlier bests are read when their screen opens (`useOnDemand`) and again after a save. **Not moved:** events and rewards (Home uses them), recipes, photos, scans, measurements, notifications and the rest of the tabs. |
| R13 + M1 (4) sign-in checks | done | `43cba91` | `lib/supabase/currentUser.ts` (`getCurrentUser`, `getMyProfileRow`, shared by the layout, the member page and the root page). The middleware uses `getClaims()`; see Things to know. **The coach pages still call `getUser()` themselves**, so they make 2 network checks, not 1 (one line each; they are brief 05's files). |
| R13 + M1 (5) `ClientOnly` | partly | `43cba91` | Every `ClientOnly` shell now shows a server-rendered skeleton instead of a blank div. `ClientOnly` itself stays: the screens format dates and greetings in the viewer's locale and would mismatch on the server. |
| R13 + M1 (6) reloads | partly | `c8f5d65` | The workout screen no longer reloads the dashboard per set (and shows one exercise's sets in the order they were done; they ran backwards). The page is refreshed once when a workout is finished or the screen is left. Other saves (notifications, Big Dog, photos) still reload; they are infrequent. |
| H5 | done | `5f46c01`, `61c99f8`, `7bc9fdd` | Chat opens on the latest 50 messages with "Load earlier" (tested with 1,500). Bookings: the last 90 days plus everything ahead, renamed `getRecentAndUpcomingBookings`; the lifetime "sessions done" on Home comes from the rewards function. Sets: the last 90 days; `member_strength_bests` (0137) gives the all-time bests. **Differs from the brief:** it said bookings from yesterday on, but the check-in weeks show attended sessions from up to 84 days back. |
| R43 | partly | `eb45406` | Sentry loads when the browser is idle and the Supabase client is fetched in the background on the sign-in page. **Not done:** lazy-loading the toast and confirm providers and the splash (small, and used on every page). The remaining 693 KB is mostly the framework. |
| M5 | done | `5f46c01` | A sent message shows at once (Sending / Not sent with Try again), the thread and the header badge are fetched again when the live connection returns or the app is shown again, and a "Reconnecting" notice shows. |
| M4 | done | `5f46c01` | MP4 where the browser can record it, the real type goes with the file, 2 minute cap with a visible timer, direct upload to storage, links made again before they run out, and a refused `play()` no longer shows a pause button. |
| R8 + LT6 | done | `ee02778` | `/api/version` and an "A new version is ready. Update" banner; the service worker no longer reloads the page by itself. Skew protection is still a Vercel setting (brief 12). |
| R18 + M3 | done | `3837386` | Registers through `register_web_push`, re-registers an existing subscription (at most every 12 hours per person) and removes the subscription on sign-out. |
| R20 | done | `0b99146` | "Mark day as reviewed" and "Mark reviewed" buttons; leaving feedback counts. Looking no longer marks anything. |
| R21 | done | `73dcdcc` | The four overlays register with the back handler (hook calls only in the food files). |
| R22, OB3 | done | `fc0026e` | Draft saved on the phone as answers change (cleared on finishing and on sign-out), a "Your privacy" step with a recorded "I agree", a sign-out line on every screen, and the body questions for an existing member with no height or weight (only the missing figures are filled in, flagged for the coach). **Not done:** the "confirm details" mode brief 08 may ask for (not asked yet). |
| R17 (UI) | done | `01b3af4` | `lib/checkinWindow.ts`: 30 minutes before to 60 after, tested; the closed message says when it opens. |
| R16 (D7) | done | `5e2b493` | Referral link per gym (`gyms.referral_url`), screen and Home tile hidden without one; FAQ built from the club list, the member's plan, the gym's cancellation rule and the check-in window; the rest in `lib/faqContent.ts` with a to-do list. |
| ED1 / ED link | done | `53cbc18`, `991496a` | Lessons that have not unlocked reach a member without their text or link (the title and date stay, for the lock row); links are clickable only when https; YouTube plays from `youtube-nocookie.com`. |
| R23 (app) | done | `991496a` | Library pictures load only from the gym's storage and `NEXT_PUBLIC_IMAGE_HOSTS`, with no referrer. |
| UI2, SH6, EV1, BD1, CT3 | done | `991496a`, `b1c1e9f`, `fc0026e` | iPad detection; splash hides once ready (400 ms minimum); event and kg formatting in en-GB; "Sex (used for calorie calculations)" on onboarding and Setup; the feedback form says the name is sent. |
| L12 | skipped | n/a | Logging a set offline still fails with a toast. What was typed stays in the form so it can be sent again; a real queue needs a design for repeated sends (one set saved twice). |

### What the owner must do

1. **Before deploying:** set `NEXT_PUBLIC_IMAGE_HOSTS` in Vercel to the sites your exercise pictures come from, otherwise those pictures show the muscle-group icon. Find them with:
   ```sql
   select substring(image_url from '^https://([^/]+)') as host, count(*) from public.exercise_library
   where image_url is not null group by 1 order by 2 desc;
   ```
   Pictures stored in your own Supabase storage need nothing.
2. **Referral link:** after `0138`, set each gym's link, or the Refer a friend screen stays hidden:
   `update public.gyms set referral_url = 'https://...' where id = '<gym id>';` (a settings field for admins is brief 08's).
3. **Supply wording:** the FAQ answers and the to-do list at the top of `lib/faqContent.ts`; the privacy summary in `lib/consentText.ts`; the policy and terms pages the consent step links to (`/legal/privacy`, `/legal/terms` are still placeholders).
4. **Try on a sandbox copy of the app:** send a chat message with the connection off and on; load earlier messages; record a voice note on an iPhone and an Android phone; log, correct and delete a set (the chips should stay in order and nothing reloads); open Book, Education and the Strength tab (each should load its own data and update after a save); scan through onboarding on a phone and reload half way (answers come back); sign in as a second member on a phone the first used (their pushes should move); leave the app open across a deployment (the banner should appear); press the back gesture with the Add food sheet, the scanner and a confirm question open.

### For brief 01's trigger

`client_profiles.consented_at` (0138) is written by the member's own onboarding save, so it is member-writable. It should be allowed to be set and re-stamped but never cleared, like `onboarding_completed_at`.

### Things to know

- **The middleware now checks the sign-in token itself (`getClaims`) instead of asking Supabase on every request and every Server Action.** The difference: a session ended elsewhere (signed out on another device, or a disabled account) keeps passing that routing gate until its token expires, up to an hour. Pages and actions that need to know exactly who is asking still call `getUser()`, and the database applies its own rules from the same token. If you would rather have the old strictness back, it is one line in `lib/supabase/middleware.ts`.
- **Sentry is loaded after the page is idle**, so an error thrown in the first moments is not reported.
- **Three small pieces of timing/ordering changed on purpose:** the Book, Education and FAQ screens show "Loading…" for a moment the first time they open; a workout's sets show in the order they were done; the Strength tab shows no personal-best flags until the earlier bests have loaded.
- **Brief 09** adds its coach-notification call to `lib/data/chat.ts` (`sendMessage` and `notifyVoiceSent`/`notifyPhotoSent`); keep the voice-note one, which replaces the old `sendVoiceNote`.
- **Brief 10:** when it adds a content security policy, `frame-src` must allow `https://www.youtube-nocookie.com` and `https://player.vimeo.com`, `img-src` must allow the image hosts, and `/api/version` must stay reachable without a login.
- **Mistake caught and repaired:** commit `61c99f8` committed `BpHome.tsx` with some lines in the wrong place (staging by hunk while the owner's uncommitted edits shifted the line numbers). `7bc9fdd` repairs it; the tip is correct, and the clean-copy checks above were run on the tip. The later commits build the shared files from the committed version instead of staging hunks.
- **The owner's uncommitted edits** in `BpHome.tsx`, `EventBanner.tsx`, `TodayTab.tsx` and the `scripts/seed-*.ts` files are not in any commit.
- **Files outside the usual list I had to touch:** `lib/data/{classes,education,exerciseLibrary,workouts,gym,pushSubscriptions,onboarding}.ts`, `app/dashboard/{page,_components/DashboardShell}.tsx`, `app/coach/clients/[clientId]/page.tsx` (props removed), `app/layout.tsx`, `app/page.tsx`, `lib/supabase/middleware.ts`, `instrumentation-client.ts`, the nine `ClientOnly` shells (a one-line fallback each), `ConfirmDialog.tsx`, `SetupTab.tsx`, and `TodayTab.tsx` / `BpHome.tsx` (three props).

### Hand-offs

- **Brief 08:** the admin settings field for `gyms.referral_url`; the "confirm details" mode for onboarding if you want it.
- **Brief 09:** see above (`chat.ts`).
- **Brief 10:** the content security policy notes above; the coach pages' second `getUser()`.
- **Brief 11:** the update banner, the skeleton and the Load earlier button need the accessibility pass; the consent checkbox uses the themed checkbox.

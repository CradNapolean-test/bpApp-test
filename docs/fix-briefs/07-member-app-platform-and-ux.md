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

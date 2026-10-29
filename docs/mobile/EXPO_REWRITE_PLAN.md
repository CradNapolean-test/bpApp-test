# Expo Rewrite: Architecture Plan (Step 2)

The remaining work (parity gaps, backend, devices and Xcode, legal, store review) is in `docs/EXPO_REWRITE_ROADMAP.md`.

Status: APPROVED. Slice 0 done (monorepo, shared package, Expo app with login, security audit and fix). Slice 1 first pass done: the real Today screen (greeting + credits, next session with check-in, nutrition ring vs target, daily check-in saved to the database, today's workout, streak, pending forms). Verified in the browser build against the sandbox with a realistic 12-week member. Still open for slice 1: password reset via deep link and the in-app onboarding flow (new members are told to finish onboarding on the web for now). NOT yet verified on a physical phone (LAN and tunnel both failed on the user's network).
Slice 2 first pass done: the Food tab for members on full tracking. Date navigation, diary by meal section, ranked food search, favourites and recently logged, quantity presets, Quick Add, edit and remove entries, copy from the day before, barcode scan (camera on a device, manual number entry as a fallback) with the same Open Food Facts flow as the web, and diary totals synced into the daily log. Still open for slice 2: food photos with the AI estimate (needs an Edge Function holding the Anthropic key, which means a new cloud resource, so it needs approval), manual macro entry mode, editing meal sections, recipes and the meal planner. Members on photo-diary or manual mode are told those modes open on the web for now. Camera scanning is untested on a real device (the browser has none).
Slice 3 first pass done: the Classes tab and a Credits screen. Day-strip timetable (morning / afternoon), spots left from the whole-gym count, book, waitlist (no charge) and cancel with confirmation sheets showing cost, credits left and the cancel-by time (including the overnight blackout rule), My bookings with late-cancel warnings and check-in for today, credits and bonus balances, plan details and a paginated credit history. The credit rules stay in the database (book_class, cancel_booking); the app only calls them. Migration 0107 (book_class validation) is applied in the sandbox; booking-rules-check.cjs proves it (13 checks, 0 failures). Still open for slice 3: live updates of spots left (Realtime), and booking classes for another day beyond the booking window is hidden by design. Verified in the browser build only.
Slice 4 first pass done: the Workouts tab and an open-workout screen. Programme overview (current week, week pills, day cards with phase and highlights, today flagged), and the day screen with prescription pills (sets, reps, load, RPE, rest, percent-of-1RM resolved against the member's recorded max), last-week's sets for each exercise, log / edit / delete a set with a new-best flag, rest timer, supersets and circuits, Strong / Conditioning slot picker with the block halves, demo-video links, session rating and notes, and recording a new max. The rules (Epley estimate, last session, prior best, progress, block layout) live in `@ballistic/shared` with tests; the app only renders them. Still open for slice 4: offline set logging (queue, slice 8), an embedded demo-video player (links open the video externally), and an RPC to replace the chunked logged-exercise lookup on the overview if programmes get very large. Verified in the browser build only, including a temporary rich test day (since removed).
Slice 5 first pass done: the Chat tab. The member's conversation with their coach: the latest 30 messages with earlier ones loaded as you scroll up, day headings, local times, text, photos (camera or library, shrunk to 1600 px JPEG, tap for full screen) and voice notes (record, waveform bubble with play and pause). Sends are optimistic with a Not sent / Retry / Delete state. New messages arrive live over Realtime through one connection for the whole app, with an unread badge on the Chat tab, and count as read while the chat is open. Photos and voice notes are signed only when a bubble needs one and are never saved to the device cache. It uses the same tables, buckets and Row Level Security as the web chat, so the coach's web inbox needed no change. Migration 0108 (text length, file size and file type limits) is applied in the sandbox; `chat-storage-check.cjs` proves isolation and the limits (53 checks, 0 failures). Still open for slice 5: push notifications for new coach messages and an offline queue that survives restarts (both slice 8; today the app only updates live while it is open), and cross-platform voice notes: the web recorder saves WebM, which Android plays but iOS may not (untested; the fix is to make the web recorder prefer AAC/MP4, which the Chromium used for testing supports). Verified in the browser build only. Recording used a synthetic microphone (the test browser has none) and photo picking used a scripted file, so the camera, the microphone and photo-library permission prompts and the on-screen keyboard behaviour on iOS and Android are untested on a device.
Slice 6 first pass done: Progress & results, one screen with three segments, opened from a card on Today and a row on Account (a seventh tab would not fit a 375 px bar). Photos: a two-column grid that loads only the tiles on screen, add a photo (camera or library, shrunk to 1600 px JPEG, same bucket and file names as the web), full-screen view, delete with confirmation, and a before/after comparison with either side chosen. Measurements: Start / Last / Now for arm, chest, waist, hips and quad with the web's change-since-first and change-since-last wording, and logging new ones (the first measurement of a body part becomes its Start figure, as on the web). Body scans: a trend chart (weight, muscle, body fat), the latest figures with the change since the last scan, a history list, add a scan (optionally with a photo of the printout) and delete one, with the web's validation ranges; the newest scan's measured body fat replaces an estimated one on the profile and flags the coach, exactly as the web does. All of the rules live in `@ballistic/shared` with tests. Migration 0109 (value ranges, scan-note length, file size and type limits) is applied in the sandbox; `progress-isolation-check.cjs` proves isolation and the limits (75 checks, 0 failures). Left out on purpose: habits (the web loads them but has no member screen, and members cannot create them, so it would be new product), the Overview weight-trend charts (slice 7) and PDF printouts (needs another package; existing PDFs open as links). Photos load whole-file thumbnails (no resized versions), so a large photo history costs data on mobile networks; a resized copy stored at upload time is the fix if that matters. Verified in the browser build only: photo and printout picking used a scripted file, so the camera and photo-library permission prompts and on-screen keyboard behaviour on iOS and Android are untested on a device.
Slice 7 is large (about twenty more web screens), so it is done in passes. Pass 7a done: Account, Notifications, Overview and per-member screen access. Screen access: the coach's "turn this screen off" setting and the screens each membership tier includes now hide the matching tab, Today card or Progress segment (the rule moved into `@ballistic/shared`, the web imports it from there). This was a gap in slices 2-6: until now every member saw every screen. Overview: weekly bodyweight, calorie and step trends and the goal-progress card, as the first Progress segment, built from the daily logs Today already fetched. Notifications: the list, marked seen in one update when opened, clear one or all, and a bell with an unread dot on Today. Account: profile header with plan, change password, change email, check-in reminder and email switches, Light / Dark / System theme (applied at once, kept on the phone and saved to the profile, dark by default), request or cancel account deletion, Progress / Notifications / Credits / Chat links and sign out. Migration 0110 (members cannot write the four coach-owned profile fields) is applied in the sandbox; `account-isolation-check.cjs` proves it (39 checks, 0 failures, and the coach's own reminder and admin-details routes still work). Left out of 7a on purpose: a push switch (slice 8), Terms and Privacy links (need a published web address), emailing the coach when deletion is requested (the web does it best-effort with an email key; the coach's web already shows the in-app flag, which the web calls the source of truth), and the success path of "change email" is untested because it sends a real confirmation email. Still open for slice 7: pass 7b (Forms, Weekly Log, personal details and targets, onboarding) and 7c (Education, Recipes, Meal Planner, Activity, Community, Big Dog). Account deletion is a request to the coach, not an instant delete; Apple requires deletion to be startable in the app, so confirm this meets their rule before store submission (slice 9). Verified in the browser build only.
Scope: a new Expo member app on the existing Supabase backend. The coach/owner Next.js app stays as is for now.

## Measured results (realistic member, this PC, sandbox database in eu-west-1, 2026-10-12)

| | Old web dashboard (Next.js production build) | New Today screen (Expo web production export) |
|---|---|---|
| Data requests for the first screen | 38 queries + 3 dependent, all server-side before anything shows | 11 small requests, started in parallel from the browser |
| Time until all data is back | server response median ~890 ms (770-1,500) | 386 ms after navigation start |
| Largest contentful paint | ~1.2 s | ~264 ms cold, ~240 ms with saved cache |
| Page payload | 473 KB HTML (data embedded) + the app JS | 415 KB gzipped JS once, then ~tens of KB of JSON |
| Reopen with saved data | full reload cost every time | 0 requests while the cache is fresh |

Slice 4 screens, same method (production export, cold query cache, 3 runs each; no old-web baseline was measured for these two, so there is no comparison column):

| Screen | Data requests | Time until all data is back | Largest contentful paint |
|---|---|---|---|
| Workouts overview | 8 | 414-590 ms | 88-140 ms |
| Workout day (Upper A, 5 exercises, last week's sets) | 8 | 280-308 ms | 344-380 ms |
| Chat (50 messages, newest 30 loaded; direct load) | 5 | messages back ~385 ms after navigation, everything 504-689 ms | not measured (see below) |

Slice 6 screens (same method, 3 runs each for Photos; Measurements and Body scans timed from the tap, with 3 test photos and 4 test scans in place):

| Screen | Data requests | Time until it is back |
|---|---|---|
| Progress > Photos (3 photos) | 4 for the screen (profile, photo list, 3 signed links) plus 3 image fetches, and the 2 unread-badge requests every screen shares | list 281-366 ms, images 714-796 ms after navigation |
| Progress > Measurements | 1 | 102 ms after the tap |
| Progress > Body scans (4 scans, 1 printout) | 3 | 448 ms after the tap, thumbnail included |

Slice 7a screens (3 cold runs each, direct load, so each includes the 6 requests the app shell shares):

| Screen | Data requests | Time until it is back |
|---|---|---|
| Today (re-measured) | 15 (the 11 from slice 1, plus the chat badge, the screen settings and the notification dot) | 598-955 ms |
| Notifications | 8-9 (the list itself is 1; the 9th run also had the mark-seen update) | 372-455 ms; the list at about 310 ms |
| Account | 8, nothing extra: it reuses the profile, credits, screen settings and the two badge counts | 402-489 ms |
| Progress > Overview | 8 (the 84 days of logs are the only addition; they start after the profile returns, because the Overview needs its goal weights) | daily logs back 392-582 ms, goal card and three charts drawn |

Today is slower than the slice 1 figure (386 ms) with 4 more requests in the same chain; this connection was also slower and noisier on the day (the same screens measured earlier in the day came back faster), so the two are not a clean comparison. Re-measure on a real phone. LCP is not reported for 7a, for the same hidden-pane reason as Chat. Opened from Today (the normal route) Overview and Account cost no extra requests, because their data is already cached.

Navigation pass (the Home / Book / Coach / Profile frame; one cold run in the browser build at phone width, cache cleared, Home loaded directly and then each tab opened in turn, so each row is only what that tab adds):

| Screen | Data requests | Note |
|---|---|---|
| Home | 15 | the 11 from slice 1, the two chat-badge counts, the notification dot, and one new count of attended sessions (head-only, no rows) for "Sessions done" |
| Coach tab | +1 | only the screen settings; the profile, today's log, workout, chat badge and credits are already cached from Home |
| Book tab | +5 | timetable, gym, bookings, exceptions, booking counts (credits and profile cached) |
| Profile tab | +0 | everything is cached |
| Back to Home | +0 | |

The header and tab bar read the same cached chat and notification counts on every screen. The check "on every app start" now happens once (the app layout asks for it); an earlier build re-asked on every screen that mounted a header, which added three requests to each first visit. Timings are not reported for this pass: the browser pane was hidden for most runs, which stalls painting.

Slice 7c screens (one cold run in the browser build at phone width, Home loaded with a cleared cache and then each screen opened in turn; the member has a full history):

| Screen | Data requests | Note |
|---|---|---|
| Home | 18 | the 17 from 7b plus the reward list (for the club bar's next-reward label) |
| Events | 3 | the events, the headcounts (a database function) and the member's sign-ups |
| Rewards | +2 | grants and progress (a database function); the reward list is cached from Home |
| Resources | 2 | assignments with their sections and lessons, and the member's completions |
| A course | +0 | |
| Recipes | 1 | recipes with ingredients and each ingredient's food |
| Meal planner | +1 | the planned entries (recipes and diary sections are cached) |
| Activity | 1 | the activity list (about 44 rows), kept for a day |
| Big Dog | 1 | the member's scores |

Slice 7b screens (one cold run in the browser build at phone width, cache cleared, Home loaded and then each screen opened in turn, so each row is only what that screen adds; the test member has no forms and a full 12-week history):

| Screen | Data requests | Note |
|---|---|---|
| Home | 17 | the 15 from the navigation pass, plus the screen settings (Home now hides the forms banner and check-in card when the coach switched them off; the Coach tab used to be the first to ask for them) and the onboarding check (a one-column read of the member's own profile, asked once at each app start) |
| Coach tab | +0 | everything is cached from Home |
| Daily check-in (this week) | 3 | the week's 7 days, the attended sessions in that week, and the dates a period started (female members only) |
| Daily check-in, another week | +2 | that week's days and attended sessions |
| Forms | 1 | assignments with their questions and answers in one request |
| Filling in a form | +0 | |
| Personal details | +0 | the profile is cached |

Each change on the check-in is one small upsert of only the field changed, shown at once and rolled back on failure; typed boxes save a moment after the member stops typing, when they leave the box, and when they leave the screen (checked: a figure typed and then "Back" within 150 ms was stored).

The first version of Progress waited for the profile (it holds the timezone) before asking for the photo list, which does not need it; the list now starts together with the profile and only the buttons that save something wait. That moved the list from 311-490 ms to 281-366 ms and the images from 766-988 ms to 714-796 ms. LCP is not reported for slice 6, for the same hidden-pane reason as Chat.

Chat was first measured at 5 requests in a 3-step chain (profile, then messages, then unread count), everything back in 1,060-1,527 ms and the messages at 750-1,120 ms. The messages only need the user's id, which the session already holds, so they now start at once; that is the change behind the numbers above. LCP for Chat is not reported: the browser pane was hidden while measuring, which delays painting and made the paint timings meaningless (the first element painted at 148 ms in the one run that produced a valid entry). Re-measure on a real phone.

Caveats: one PC, warm browser JS cache in both cases, a short physical distance to the database, no network throttling. Phones on mobile networks will be slower for both; the relative gap comes from far fewer round trips and per-screen loading, which should hold. Re-measure on a real phone before relying on the absolute numbers.

## 1. Repo layout

```
/ (monorepo, npm workspaces)
├─ apps/
│  ├─ mobile/        Expo (Expo Router, TypeScript), the new member app
│  └─ web/           current Next.js app, moved here unchanged (coach/owner/legacy member)
├─ packages/
│  ├─ shared/        calculations.ts, types.ts, pure utils (dates, cancelDeadline, checkin,
│  │                 currentProgram, foodTotals, habitStats, bigDog, workoutSections, onboarding)
│  └─ api/           NEW: supabase-js query/RPC functions that take a client as a parameter
├─ supabase/         schema.sql, migrations, new edge functions (unchanged otherwise)
└─ docs/
```

- DEVIATION, as built: `apps/mobile` is NOT an npm workspace. Expo SDK 57 pins React 19.2.3 while the web app is on 19.2.4 (kept current because it runs server-side React); one shared install made npm split the Expo packages across node_modules and the Expo CLI could not resolve `expo-router`. So mobile has its own install and lockfile, links `@ballistic/shared` with `file:../../packages/shared`, and `apps/mobile/metro.config.js` watches that folder. Root workspaces are `apps/web` and `packages/*`.
- Session storage: native uses Expo's `expo-sqlite` localStorage shim (per the SDK 57 docs); the web build uses the browser's localStorage (`authStorage.web.ts`), because expo-sqlite's web path needs a wasm setup. Unencrypted on-device session storage is a hardening item for the security review.
- `lib/calculations.ts` and `lib/data/types.ts` move into `packages/shared` with their code unchanged (only `@/lib/...` imports became relative paths in types.ts and the utils); `web` imports them through one-line re-export stubs at the old paths. Their tests moved with them.
- `packages/api` is new code: each `'use server'` function in `lib/data` is re-implemented against a passed-in client. The originals stay in `apps/web` until the web is migrated.
- Moving the web into `apps/web` is a one-commit `git mv`. Vercel's root-directory setting follows it.

## 2. How the app talks to Supabase

| Concern | Approach |
|---|---|
| Member reads/writes | Direct `supabase-js` from the phone under RLS, plus the existing RPCs (`book_class`, `cancel_booking`, `check_in_booking`, `start_membership`, ...). Only the anon key ships in the app. |
| Auth | `supabase-js` with a secure-storage session adapter. Password reset / email confirm return via deep links (PKCE flow, not cookies). |
| Privileged work | Supabase Edge Functions (no keys in the app): Expo push sending, food-photo AI estimate (Anthropic key), email via Resend, `create-client`, `join`, delete-my-account (Apple requirement). |
| Crons | `pg_cron` calling existing RPCs (`replenish_due_memberships`, `expire_bonus_credits`, `apply_due_programme_rollouts`, `generate_all_red_flag_weeks`, ...). Email/push passes call Edge Functions. Removes the GitHub-hourly workaround. |
| Credits | Unchanged: `credits_ledger` stays append-only. The app never writes to it directly, only through RPCs. |
| Schema changes | Additive migrations only (e.g. a device-token table for Expo push). No existing migration is edited. |

Prerequisite security audit: all 122 `SECURITY DEFINER` functions bypass RLS. Each needs a correct `auth.uid()`/role check and a pinned `search_path`. A phone calling RPCs directly makes this the highest-risk item; write a test that calls every function as a member who should not be allowed.

## 3. Avoiding the dashboard-bundle problem

Replace `loadDashboardBundle` (38 queries) with one hook per screen and React Query, with the cache persisted on-device (instant open from cache, refresh in background).

| Screen | First-paint queries | Notes |
|---|---|---|
| App start | profile, unread count, disabledScreens | 3 cheap queries; the rest load per screen |
| Today | today's log, food diary entries, week logs | week logs only, not 84 days of history |
| Food | diary, sections, manual macros, photos | food search via `search_foods` RPC |
| Classes | schedule occurrences, my bookings, balance | ledger loads when opened, 50 rows per page |
| Workouts | active program only | logs by program week, library fetched lazily |
| Chat | latest 30 messages | cursor pagination upward, Realtime for new ones |
| Progress | measurements, thumbnails | full photos on tap; 84-day history only here |
| Everything else | on open only | forms, education, recipes, rewards, events |

If measurement shows round trips still hurt, add a single `get_member_home()` RPC for the Today payload, after measuring, not before. Realtime events invalidate cache entries instead of refetching everything.

Targets (to verify in the pilot): Today interactive < 1 s warm and < 2 s cold on a mid-range phone, at most 4 requests before first paint.

## 4. Vertical slices

| # | Slice | Contents |
|---|---|---|
| 0 | Foundation | Monorepo, shared package, tests moved, sandbox Supabase, auth, navigation shell, theme, Sentry |
| 1 | Login -> Today | Login, reset, onboarding flow, Today tab, daily targets |
| 2 | Food diary | Search, add/edit entries, barcode scan, food photos + AI estimate, meal planner |
| 3 | Classes, booking, credits | Schedule, book/cancel, ledger, memberships, credit packs |
| 4 | Workouts | Program view, set logging, maxes, block choices, feedback |
| 5 | Chat | Realtime, photos, voice notes, unread counts |
| 6 | Progress | Photos, measurements, body scans, habits |
| 7 | The rest | Weekly log, setup, insights, overview, recipes, activity, forms, education, community/rewards/events, Big Dog, notifications, account |
| 8 | Native hardening | Push, deep links, offline queue, performance pass |
| 9 | Release | EAS, TestFlight/internal testing, store submission |

**Navigation pass (done, between 7a and 7b).** After 7a the member app was built as six text tabs, which looked and behaved very differently from the finished web app. The frame now matches the web: four tabs along the bottom (Home / Book / Coach / Profile, the same Lucide icons, uppercase labels, a pill behind the lit icon, a red dot on Coach when the coach has written) and one header (logo and name on Home, the screen title with a back arrow elsewhere, a Messages button with the unread count, a Notifications bell with a dot, and a Profile shortcut on Home). The icons are the web's own Lucide vector data, generated by `apps/mobile/scripts/generate-icons.cjs` into `iconData.ts`, so no icon package was added. Screens opened from a tab keep that tab lit (Food, Workouts, a workout day, Chat, Progress and the daily check-in belong to Coach; Notifications to Home; Credits to whichever of Book or Profile opened it) and the back arrow goes back to where the member came from. Home now follows the web Home: greeting and credits chip, next session with check-in, My bookings / My coaching tiles, streak and "check-in today X of 3", the forms banner, and "Your progress" (sessions attended, months a member, the 100-session club bar; the maths is in `packages/shared/src/utils/home.ts`, with tests). The new Coach tab follows the web Coach hub: your coach and a Message button, Nutrition (today's rings and "Log food diary"), Training (today's workout and the programme), the daily check-in tiles with their green / amber / red lights and "Log today", and Progress & results. Blocks whose screen the coach (or the membership tier) switched off are left out. Not in this pass: the "Explore" tiles on Home (Resources, Events, Rewards, Refer a friend, Feedback, FAQ), the next-reward label on the club bar, and the "Learn & forms" block of the Coach hub. They arrive with the screens they open (7b and 7c). Colours, spacing and type are still the plain first version; a visual polish pass waits for the owner's mockups. Verified only in the browser build; not yet seen on a phone.

**Slice 7b (done; migration 0111 applied and verified in the sandbox on 2026-10-12: its suite passes 55/55 with `--expect-0111` and the seven earlier suites still pass).** Forms, the daily check-in, Personal details and onboarding.
- *Forms.* A "Forms" row on the Coach tab (with the pending count) and the Home banner open a list: "To fill out" cards and
  "Completed" forms that expand to show the answers. Filling one in is a card per question (short and long text, number,
  single and multi choice), a progress bar, required questions checked before it sends, and a draft kept on the phone (wiped on
  sign-out). It submits through `submit_form_response`.
- *Daily check-in* (the web's Weekly Log; replaces the quick box from the navigation pass). Week picker (back to any past
  week, not past this one), a seven-day strip with traffic-light dots, then per day: sleep / steps / water cards (the three
  bands, status, + / - buttons, typed value, litres or millilitres; the web's slider is left out because it needs another
  package), the day's food totals from the diary, bodyweight, hunger / energy / motivation / stress, a gym-session toggle that
  is on automatically on a day with an attended booking, "period started" with the cycle day for female members, and notes.
  Photo-diary and type-your-totals members see the matching variants. Every change is one upsert of only that field.
  The maths (nudging, typed values, week averages, limits) is in `packages/shared/src/utils/weeklyLog.ts`, with tests.
- *Personal details* (Profile > Personal details). Name, gender, phone, date of birth (three boxes, no date-picker package),
  address, emergency contact, goal, experience and start / goal weight. Only those columns are written, so a figure the coach
  changed since the screen opened is never overwritten (the web saves its whole form). Gender is read leniently ('female' and
  'F' count as Female), because the seeded test member and imported rows are not always capitalised.
- *Onboarding.* A member with no profile (or one the coach asked to confirm) sees the questions instead of the tabs: welcome,
  about you, your goal, your body (height in cm or ft/in, weights in kg or st/lb), food tracking, and the starting plan from
  `buildOnboardingPlan`; the short version for existing members skips body and plan and fills in what is already known.
  Nothing is written before the last step. The profile row is written under the member's own sign-in, then
  `assign_default_onboarding_form()` hands out the gym's default form (silently skipped until 0111 is applied). The check
  that decides whether to show the questions is asked fresh at every app start, so a member who finished on the web never
  sees them again.
- *Per-member screen access* now also hides the Forms row, the Home forms banner and the check-in blocks when the coach
  switched Forms or Weekly Log off.
- Tested in the browser build with a throwaway new member (full and short flows, validation messages, the plan matching the
  target shown afterwards), the realistic member (forms, the check-in, details) and a seeded form; all test data was removed.
  Not seen on a phone yet. Still open: the Learn half of "Learn & forms" and the Home Explore tiles (7c).

**Slice 7c (done in the browser build; migration 0112 applied and verified in the sandbox).** Community, Learn, nutrition extras and Big Dog.
- *Home.* The six "Explore" tiles (Resources, Events, Rewards, Refer a friend, Feedback, FAQ; Resources only when the coach has not
  switched Education off) and the next reward on the club bar ("100 club - 73 sessions to go" with the reward's name).
- *Community.* **Events** (gym events with the headcount; "I'm in" and leave, shown at once and rolled back on failure; a full or
  finished event cannot be joined), **Feedback** (star rating and comment), **Refer a friend** (a ready message with the gym's
  referral link, shared through the phone's share sheet or opened in the in-app browser), **Rewards** (session clubs, then
  loyalty rewards with earned-but-not-received first), **FAQs** (the owner's draft answers, kept in `packages/shared` so web and
  phone cannot drift). Terms and Privacy links are left out until the app has a web address to point them at.
- *Resources (Education).* The member's assigned courses with a progress bar, sections that open (the first unfinished one starts
  open), lessons that are locked until their date, a "Mark complete" button and a link that opens in the in-app browser (only
  http and https addresses are ever opened; a coach-typed `javascript:`, `tel:` or app link is not offered). Reached from the
  Coach tab's "Learn & forms" block.
- *Recipes and the Meal Planner* (Coach tab > Nutrition, only for members on full food tracking and not switched off). Recipes: create
  (name, servings), add ingredients through the same food search, favourites, recents and barcode scanner as the diary, edit or
  remove an amount, servings stepper, per-serving calories and macros, delete. The diary's "Add food" sheet gains a Recipes tab
  (log a recipe in a tap, scaled by servings). Meal Planner: six meal slots, add a food or a recipe, edit or remove, the totals
  against the member's target, and add one meal or the whole plan to today's diary (filed under the matching diary section). The
  scaling and limits are in `packages/shared/src/utils/mealPlan.ts`, with tests.
- *Activity* (Coach tab > Training): the "step swap". It uses the validated `equivalentMinutesForActivity`; the member's minutes
  per 1,000 steps are remembered on their profile (above 0, up to 60). `packages/shared/src/utils/activity.ts`, with tests.
- *Big Dog* (Profile > Big Dog standards): the T-shirt tier and ladder, every exercise's Rookie / Strong / Big Dog targets for the
  member's sex (read leniently, so a stored "female" counts), and a sheet to log a score (the level is worked out from the number,
  never picked) with history and delete for the member's own scores. A self-reported score shows "awaiting coach check" and does not
  count towards a T-shirt until a coach verifies it.
- *Per-member screen access* now also hides Resources, Recipes, the Meal Planner and Activity when the coach switches them off.
- Tested in the browser build against the sandbox with seeded events, a course (a video lesson, a text lesson, a lesson with an unsafe
  link, a locked lesson) and rewards, then the data was removed and the member restored. Not seen on a phone yet; the barcode scan
  inside a recipe or the planner and the share sheet need a phone.
- Still open (at the time of 7c; the diary modes pass above has since closed the first one): photo diary and manual-macro tracking (Food showed "opens in the web app" for those members), the Terms and Privacy
  links, the embedded video player, and the visual polish pass.

**Slice 8a (done in the browser build).** Forgot password and links. "Forgot your password?" on the sign-in screen: the member enters their
email, types the code from the email, and chooses a new password (the web's rules). A code rather than a link because the app has no web
address yet (so no universal links) and email apps often refuse to open a custom-scheme link; the code also works from any device.
`ballistic://reset-password?token_hash=...&type=recovery` opens the same screen, so a link works once there is somewhere to send it from.
If another member is signed in on the phone, they are signed out first (their saved data is cleared). A link that matches no screen lands on
a "Page not found" screen. One dashboard edit is needed before the email carries a code: see `docs/SLICE_8_SETUP.md`.

**Slice 8b (done in the browser build).** Offline writes. With no signal these keep working and are saved when the connection returns, even if
the app is closed and reopened in between: logging, editing and deleting a set; choosing a block and rating a session; adding, changing the
amount of and removing food in the diary (food from Recently logged, favourites or Quick add; search and barcode lookup need a connection);
the daily check-in figures. Credits, bookings, memberships, chat, forms, photos, profile changes, recipes, the meal plan and community actions
are never queued: they need the server's answer, so offline they fail at once with a plain message.
- *How.* Every request goes through one wrapper (`lib/connectivity.ts`), so the app always knows whether the server can be reached; offline it
  asks the server's health address every 8 seconds. A write (`lib/queuedWrites.ts`, run by `lib/writeQueue.ts` on TanStack Query's mutation
  queue) updates the screen at once; if the server cannot be reached it waits, is kept on the phone with the cache, and runs when the connection
  is back, in the order made, before the screens refresh. A line under the header says "You are offline. N changes will save when you are back
  online." (and "Saving...", or "N changes could not be saved and were undone" with Dismiss).
- *Safe to repeat.* Inserts carry an id made on the phone (`expo-crypto`) and the time the set or food was really done, so a repeat cannot add
  a set or a food twice and the day's order is kept; updates, deletes and upserts are by id or natural key. A repeat that hits the primary key
  counts as done only if every row is really there for this member (another member's id never does). Only "could not reach the server" is
  tried again; an answer from the server, even a refusal, is final: the write is undone by a refetch and the member is told.
- *Sign-out.* Waiting changes belong to the member who made them: signing out asks first ("Sign out without saving?"), then drops them, and
  they never run for anyone else. Fixed on the way: the cache saver writes up to a second late, and a write scheduled just before sign-out could land
  after the clean-up and put the previous member's copy back on the phone. Nothing is saved for two seconds after a clear now.
- *Checked.* `supabase/tests/security-audit/queued-writes-check.cjs` (22 checks, as real members): own id and time are kept, a repeat is
  recognised, another member's id is never mistaken for a repeat, batches are all or nothing, updates and deletes are repeatable.
  Browser build against the sandbox with the connection cut by a development-only switch (`localStorage "bp-debug-net"` = "offline" or "reject";
  inactive in a release build): sets and food added offline, edited and removed in the same offline stretch, a reload while offline, then
  reconnecting (each saved once, in order, with their original times), a refused write (undone and reported), signing out with a change waiting.
- *Not seen on a phone yet.* Airplane mode, weak signal and the app being killed while offline need a phone.
- *Left for later.* Photo diary, manual macros, and offline recipes / meal plan. Reading with no signal shows what is saved on the phone (kept up
  to a week now, so a set logged in a basement gym is still there to save); a screen never opened before shows nothing until the connection returns.

**Slice 8c (code done; migration 0113 applied and verified in the sandbox on 2026-10-13, `push-devices-check.cjs --expect-0113` 26/26; not seen on a phone).** Push notifications.
- *Database.* `0113_push_devices.sql`: a `push_devices` table (one row per phone, keyed by its Expo push token) that a member can read and delete
  (own rows only) but not write directly, and `register_push_device()` for the signed-in member only (members only; the token must look like an Expo
  token; a phone that changed hands moves to its new member; at most 5 phones per member; not callable by anon). Checked offline on an in-process
  Postgres (26 checks, no Supabase project touched) and by `supabase/tests/security-audit/push-devices-check.cjs` (26/26 once 0113 was applied).
- *Sending.* Not an Edge Function as the first plan said: the web app already sends push from its own server code (migration 0060 chose that on
  purpose), so `apps/web/lib/push.ts`'s `sendPushToClient` now also sends to the member's phones (`apps/web/lib/expoPush.ts`: Expo's push
  service, 100 per request, phones Expo reports gone are forgotten). Every push the web already sends reaches the phone with no change at the call
  sites, and no new cloud resource is needed. The shared rules (message building, ticket handling, link mapping) are in `packages/shared`
  `expoPush.ts`, with tests; the sender has mocked tests (web tests now 15).
- *On the phone.* "Never miss a message from your coach" card on Home (until turned on or "Not now"; the phone only asks permission once, so the app
  asks first in its own words) and a "Push notifications" switch in Profile > Notifications (or "off in your phone's settings, tap to open them").
  Tapping a notification opens the screen it is about (messages > Chat, nutrition > Food diary, check-in > Daily check-in, book > Book), whether the
  app was closed, in the background or open; only the app's own screens, an unknown link opens the notifications list. The app icon badge shows
  unread messages and notifications. This phone's registration is refreshed at app start; turning push off and signing out remove it.
  Expo Go on Android, simulators and the browser report "unsupported" and call no push API. Needs an EAS project id and a development build: see
  `docs/SLICE_8_SETUP.md`.
- *Found on the way.* The Food diary did not show the coach's feedback at all (only the web did), so a "your coach left feedback" notification
  would have opened a diary without it. It shows now ("From your coach" under the totals; read-only, RLS lets a member read their own).
- *Left for later.* Which pushes exist is still the web's list (coach message, nutrition feedback, check-in reminder): booking cancellations, form
  assignments and so on only create an in-app notification, as on the web (see GAP_ROADMAP). Universal links need a web address. A phone left
  registered by a member who signed out while offline is replaced when the next member turns push on, or when Expo reports it dead.

**Diary modes pass (after slice 8; done in the browser build; migration 0114 applied and verified in the sandbox on 2026-10-13, `diary-modes-check.cjs --expect-0114` 50 checks, 0 failures; not seen on a phone).** The Food screen
now has all three forms the coach can choose for a member, so nothing in the member's day is "web only" any more.
- *Manual macro entry* (`manual_import`): protein, carbs and fat in grams per meal section, with calories worked out from them by the validated formula (never
  typed), a live calorie preview, add and remove, the totals bar against the target, and the day's totals written to the daily log like the web does. It works
  with no signal through the offline queue (own ids and times, written to the day in order). `packages/shared` `manualMacros.ts` with tests.
- *Photo diary* (`photo_diary`): date navigation, "Add a meal photo" (camera or library, shrunk to 1600 px like the other photos, a short note up to 500
  characters), a card per meal with its time and note, full-screen view, delete (the row first, then the file), and the coach's feedback on the day and on each
  meal shown read-only. Photos need a connection (not queued). It is visual only: the web's member flow works out no numbers from a photo either, so the AI estimate
  route is not needed here and no cloud service is involved. `photoDiary.ts` in shared, with tests.
- *File under:* an entry sitting in "Other" can be moved into one of the member's sections (the web has it; the phone did not).
- *Not built, on purpose:* meal-section editing. On the web it is the COACH's tool (it only shows in the coach's read-only view), not the member's.
- *Database.* `supabase/tests/security-audit/diary-modes-check.cjs` (as members) found row isolation sound (29 checks) and 21 gaps the web only handled in its own forms:
  the `food-photos` bucket took any file of any size; a photo row could point at another member's file and carry any text or estimate; macro figures had no range
  (negative or absurd values flowed into the day's totals); an entry could be filed under another member's meal section; and nothing capped entries per day.
  `0114_diary_modes_limits.sql` (images only up to 10 MB; the photo's file must be in the member's own folder; description up to 500; figures 0 to 10,000 g; entries only in
  the member's own sections, for the photo-less diary too; 40 photos and 100 macro entries a day) was checked offline on an in-process Postgres (42 checks) and is run by the suite
  with `--expect-0114` once you apply it (`npx supabase db push`).
- *Tested in the browser build* with the realistic member switched between the three modes (then restored): manual entries added, a bad entry refused, removed and added offline
  across a reload and a reconnect (calories and day totals correct); a photo added through the file picker with a note, shown through a signed link, full screen, cancelled and
  confirmed delete (row and file both gone); coach comments on the day and on a photo; an entry filed from Other into Lunch.
- Camera and photo permission texts now mention meal photos too.

**Visual polish pass (done in the browser build; native look not seen on a phone).** Built from the project's own design material: the brand
spec (teal #2ABFBF, #111 background, #1e1e1e cards), the profile and messaging mockups in `docs/design`, and the real logos in `assets/brand`.
The menu, tab and segmented-control studies in `docs/design` are all marked "not decided yet", so none of that was touched.
- *Brand images.* The app icon, Android adaptive icon (and its one-colour version), splash (light and dark) and favicon were still Expo's blue template.
  They are now generated from the real badge by `apps/mobile/scripts/generate-brand-assets.cjs` (rerun it if the logo changes): the full badge on white
  for the icon and light splash, the teal BP mark on #111 for the dark splash. The unused Expo template images and the iOS template icon file are gone.
- *In-app logo.* The badge's black disc and ring vanished on the dark header, so dark screens show the teal BP mark and light screens the whole badge
  (`components/brand.tsx`); the logo also appears on the sign-in screen and onboarding.
- *Status bar and system colours* now follow the member's own Light / Dark choice (a light phone with the app on its default dark theme used to show a
  dark clock and battery on a dark bar). This needs a phone to see.
- *Profile* rebuilt to mockup 02: teal-ringed avatar with initials, a plan-and-site pill, a Big Dog tier card (existing tier logic, compact pips), a
  "My details" card with an Edit pill (only facts we have), then small groups with tinted icon chips, FAQs, and a red Log out. Terms and Privacy stay out until
  the app has a web address.
- *Chat* rebuilt to mockup 06: one rounded bar with the attach and mic icons inside and a round teal send button beside it; vector icons replace the emoji and
  text glyphs there and for the favourite star and the notification clear button.
- *Readability.* Small teal text uses a deeper teal on light backgrounds (the brand teal stays on dark, where it already contrasts well, and on big numbers and fills).
  Text scaling is capped only in the tight bars (tab labels, header title, chips and small buttons); body text still scales fully.
- *Feel.* Everything tappable dims slightly while pressed (one shared `Pressable`); Home, Book and Workouts show the shape of the screen while loading
  (a pulsing skeleton that holds still if the phone is set to reduce motion) instead of a lone spinner.
- *Left alone on purpose.* The system font (San Francisco on iPhone, very close to the brief's Helvetica Neue) rather than shipping a custom one; the menu and
  segmented-control style choices; a haptics layer (can be added later).

Go/no-go after slice 1: compare Today's load time against the web app. If the native app is not clearly faster, stop before more investment.

## 5. Native work

- Push: `expo-notifications` with Expo push tokens in a new table; sending via an Edge Function calling Expo's push API. The existing web-push path stays for the web app.
- Camera/barcode: `expo-camera` barcode scanning, Open Food Facts lookup, existing manual fallback. Camera usage strings are needed for the store.
- Voice notes: `expo-audio`, uploaded to the `voice-notes` bucket.
- Photos: `expo-image-picker` + `expo-image-manipulator` (replaces `shrinkImage`). The 6 storage buckets are re-wired with React Native uploads (ArrayBuffer, not `File`).
- Deep links: custom scheme plus universal/app links. Needs a domain serving `apple-app-site-association` and `assetlinks.json` (the future sandbox web host).
- Safe areas / layout: `react-native-safe-area-context`, `FlashList` for long lists, `expo-image` for caching.
- Charts: `react-native-svg` based (Recharts will not work).
- Offline queue: log writes (daily log, food entries, habits, set logs) queue locally with client-generated IDs so retries are idempotent and sync when online. Credits, bookings, memberships and chat sends are never queued: they show "needs connection" because they need server truth.
- Styling: `StyleSheet` + theme tokens with light/dark (`theme_preference` already exists on the profile). Short NativeWind spike in slice 0 before committing.
- Realtime: `postgres_changes` for chat and unread. The code comments record two known failure modes (unfiltered subscriptions, silent non-delivery) to handle.

## 6. Tests to write before porting

Pure logic (Vitest in `packages/shared`):
- `calculations` (22 tests exist): add the blank-goal-weight case and the carbs/calorie floor warnings.
- `cancelDeadline` and timezone handling, the day-boundary rule from migration 0044, `currentProgram`/`checkin` resolution, `foodTotals`, `habitStats`, `measurementDeltas`, `accountability`, `bigDog`, `workoutSections`, `onboarding`.

Database (against the sandbox project with test users):
- `book_class`: last-spot race (two members at once), insufficient credits, cutoff refund, waitlist behaviour, double booking.
- `cancel_booking` and `coach_cancel_booking` refund rules.
- Credit buckets: membership vs bonus, `replenish_due_memberships` idempotency, `expire_bonus_credits` catch-up.
- Ledger invariants: append-only, balance equals the sum.
- RLS: member A cannot read or write member B's rows in every table; coach sees only their clients/gym; owner scope; every `SECURITY DEFINER` function called as a disallowed role.

Mobile: component tests for Today and booking screens; a couple of end-to-end flows (Maestro) before release.

## 7. EAS and store setup

- iOS without a Mac: yes. EAS Build compiles iOS in the cloud from Windows and EAS Submit uploads to App Store Connect. The iOS simulator does not run on Windows, so iOS testing is on a real iPhone via an EAS development build or TestFlight. Android can use an emulator.
- Expo Go is not enough: push and several native modules need development builds.
- Accounts: Apple Developer ($99/yr; choose Individual vs Organization up front, since an organisation needs a D-U-N-S number and sets the seller name). Google Play ($25 once; new personal accounts must run a closed test with about 12 testers for 14 days before production, a rule to verify at submission).
- Apple needs: privacy policy URL, App Privacy labels (health/fitness, photos, contact info), in-app account deletion, permission strings, a working review login on the production backend (not the sandbox), screenshots, age rating. The app must be clearly more than a website wrapper.
- Google needs: Data Safety form, target API level, account-deletion web URL, adaptive icon.
- EAS plan: free-tier builds are limited and queued; expect a paid plan during active development.

## 8. Time estimates

Working days for one developer pairing with Claude, including tests, +/-40%. Excludes store review and the 14-day Play test wait. Nothing has been measured yet; slice 1 gives the first real data point.

| Slice | Days |
|---|---|
| 0 Foundation, security audit, tests moved | 8-12 |
| 1 Login -> Today, onboarding | 6-9 |
| 2 Food diary, barcode, photos | 9-13 |
| 3 Classes, booking, credits | 8-12 |
| 4 Workouts (largest single screen, ~1,300 lines on web) | 10-15 |
| 5 Chat | 6-9 |
| 6 Progress | 6-9 |
| 7 The rest (~15 areas) | 15-25 |
| 8 Native hardening | 6-10 |
| 9 Release | 5-10 (plus waiting) |
| **Total** | **~80-125 days, roughly 4-6 months** |

Separate, parallel: trimming the coach/owner web bundle (~5-8 days). Replacing Next.js on the web would be a further project, only after the mobile pilot.

## 9. Decisions (answered)

1. Apple Developer account: not created yet. Not needed for slices 0-7: the app runs in Expo Go on the iPhone and in the browser. It IS needed for development builds (push, slice 8) and TestFlight/store (slice 9). Sign up around slice 5, since an Organization account needs a D-U-N-S number and can take days to weeks. Individual vs Organization and the app name / bundle ID are still open.
2. Members get a browser version too: ship it as an Expo web export of the same app (see section 10).
3. Devices: iPhone, Windows PC. A Mac is available through the owner's boss for occasional use (not required: EAS builds iOS in the cloud). Android testing on a partner's Android phone plus the Android emulator.
4. Moving the web into `apps/web` is approved (one commit, no logic changes).
5. Sandbox Supabase project exists; its ref and URL live only in `.env.local`, never in committed files.

## 10. Members in the browser (Expo web export)

One codebase serves iPhone, Android and the browser through Expo Router + react-native-web.

- Every package chosen must have a web fallback or be gated by platform: barcode scanning (browser camera is less reliable, so keep manual search prominent), voice notes, local storage (no MMKV on web), push (web push stays on the existing web-push path or is skipped at first).
- Responsive layout: phone-width column on small screens, wider centred layout on desktop.
- Once the Expo web export is at parity, the legacy Next.js member dashboard (`/dashboard`) can be retired. Coaches viewing a member (`isCoachView`) still use the existing DOM components until the coach side is migrated.
- Hosting: static export on the sandbox Vercel project (also serves the universal-link association files).
- Estimate impact: +10-15 working days across slices 0-8 for web fallbacks and layout testing (total roughly 90-140 days).

## Known open items from Step 1

- Create the sandbox Supabase project and sandbox Vercel project (never the live ones).
- Apply `schema.sql`, then the migrations, then seed and create test accounts. Sandbox-only rename to fix duplicate migration versions (the pairs are independent, verified): `0086_notifications_clearable` -> `00861_...`, `0094_programme_rollouts` -> `00941_...`, `0100_session_cancel_reason_restore` -> `01001_...`. Re-check against the live repo's ordering before ever syncing migrations back.
- Confirm RLS isolation between members.
- `.claude/settings.local.json` still pre-approves `git push` / `npx vercel`; remove those entries.

# Port guide: what the mobile member app needs from the web changes

Built from the 160 commit subjects, the file lists of each commit, and the migration headers. It was NOT built by
reading every line of every diff, so treat hash numbers as pointers: open the matching file in
`patches/by-commit/` (named by order, then subject) or `changed-files/` before acting on a line below.
Hashes are in `COMMITS.md`.

Order of work: **1 database, 2 shared logic, 3 screens, 4 skip list.** Plan first, code after approval.

---

## 1. Database (do this first; the app depends on it)

Apply `migrations/0115` to `0144` to the sandbox Supabase, in filename order. `0105` to `0114` are already there
(see the README note about 0111 to 0114 being re-runnable). `migrations/INDEX.md` has each file's own header comment.

Notes that matter when applying:
- `0127` was broken in the first version (it stopped on an education function that no longer exists); the file here
  is the fixed one, and `0134` finishes its work. Apply both in order.
- `0142` also holds the report and referral SQL (folded in from a later commit). `0143` must stay LAST of the
  security set (it drops direct inserts on the credits ledger), then `0144`.
- `0113` (`push_devices`) is the table the phone push uses. The web side added `register_web_push` (0128-era, for
  browsers) which the mobile app does not call.
- Several migrations add `check` constraints and limits. Anything the app writes must respect them (lengths, ranges).
  Surface the database's message to the member instead of a generic failure.

### Contract changes the mobile app must follow (these break screens if ignored)

| Change | What the app must do | Where |
|---|---|---|
| Members can no longer write `bookings` directly (H2) | Book and cancel only through the RPCs (`book_class`, the cancel function). `book_class` now rejects past dates, a day the class does not run, a cancelled session, dates too far ahead and another gym's class | 0107, 0127 (H2), 0132; `lib/data/classes.ts` |
| Class check-in window is enforced by the server: 30 minutes before to 60 minutes after | Same window on the check-in button | 0132; commit `01b3af4`; `lib/checkinWindow.ts` |
| Refunds are capped at the weekly allowance through one shared function; sessions are retired, not deleted | Do not compute refunds in the app; show what the RPC returns | 0132; `lib/bookingRules.ts` |
| **Weekly credits reset on Saturday, not Monday**, so members can book the week ahead | Any "resets Monday" text, countdown or week maths must say and use Saturday | 0144; commit `cd764fb`; FAQ text |
| Coach can no longer insert into `credits_ledger` directly (0143); credits go through `grant_credits`, `remove_credits`, `grant_credit_pack` | Members only ever read the ledger. If the app shows history, page it | 0133, 0143 |
| Exercise library is coach-only; members read exercises through their own programmes | Do not query `exercise_library` as a member; carry only the exercises a programme uses (commit `53cbc18`) | 0127 (H1) |
| `profiles` plan and review fields are protected (M10) | The Setup/profile save sends only changed, member-editable fields (commit `7426943`) | 0110, 0127 (M10) |
| `foods` insert is limited to barcode-cache rows; hidden foods stay out of search, favourites, recents and scans | Keep the scan-cache insert shape; filter `hidden` | 0106; commit `2599f55` |
| Chat, progress, diary, forms, community have length and range limits | Validate client-side the same way (`lib/limits.ts`, `lib/foodLimits.ts`) | 0108-0114 |
| `client_profiles.nutrition_goal` and `nutrition_setting` (fat loss / muscle gain; steady / moderate / aggressive) replace the old tier for calories | Onboarding and Setup must write these; see calculations below | 0123 |
| Privacy consent is asked in onboarding; referral link comes from the member's own gym | Add a consent step; hide "Refer a friend" when the gym has no link | 0138; commits `fc0026e`, `5e2b493` |
| "Confirm your details" is a dismissible banner on Home, not a lock-out | Flag lives in 0142 (`details-confirm`); no blocking screen | 0142; commit `48b57df` |
| Member strength personal bests come from the database | Read them from the new function/view instead of scanning logs | 0137; commit `61c99f8` |
| Plans can hide the daily check-in (ongoing plans) and include the Strength screen; clients can have metrics disabled | The tab/tile list must respect `included_screens`, the hide-check-in rule and `client_disabled_metrics` | 0116, 0118, 0121 |
| Coach review and challenge check-ins | Challenge check-in prompts appear for challenge members only | 0122; commit `f4990a0` |

---

## 2. Shared logic (`packages/shared/src`): copy new versions, with their tests

Take the CURRENT file from `changed-files/lib/` (and its `*.test.ts`), then run the tests in the shared package.

**Changed, and important:**
- `lib/calculations.ts` (+121 lines changed, tests rewritten). Calorie and macro engine changes: macros follow the
  **Pyramid** (fat as a share of calories, minimum fat and carbs; commit `9d4afe3`); calories from goal + setting
  instead of tier (`2e14abd`); targets are held back until a coach has reviewed a new member's plan; no sign-up under
  16; activity level and BMI sanity checks (`b824b25`); the real-world maintenance estimate shows only with enough
  data (`761d1a8`). CLAUDE.md says this file is the source of truth: it is, and the web version above is the newer one.
- `lib/bigDog.ts` and its tests: boundaries are inclusive; the session-club bar grows through coloured stages instead of resetting (`1e3eba1`); `lib/clubs.ts` is new; Big Dog shirts (0119).
- `lib/onboarding.ts`: short version for existing members, draft keeping, consent, missing height/weight prompt.
- `lib/utils/dates.ts`, `lib/utils/dateFormat` helpers (`formatLongDate`, `formatDateTime`, `formatTime`): dates are en-GB everywhere.

**New pure helpers the member app should reuse** (all have tests): `workoutSets` (unique set numbers, no empty sets),
`trainingStats`, `trainingWindow`, `programWeek` and `planCountdown` (programme week counts from the start date),
`streak` (counts from the latest logged day and can pass 85), `weeklyAverages` (the Overview weekly tabs),
`trackerInput` (typed values on sleep/steps/water), `dayPatch`, `profilePatch` (save only what changed),
`foodLimits`, `scanDate`, `midnight` (day rollover), `utils/foodTotals`, `utils/dayCalories` (kcal-only foods count,
emptied days are empty), `utils/measurementDeltas`, `utils/uploadName` (safe upload names), `todaySessions`,
`bookingRules`, `checkinWindow`, `chatMessages`, `voiceFormat`, `onboardingDraft`, `formAnswers`, `lessonLink`,
`imageHosts`, `utils/videoEmbed`, `faqContent`, `eventBanner`, `challengeCheckins`, `checkinMetrics`, `limits`,
`detailsConfirm`, `legalContent`/`legalDoc`, `dataExport`, `utils/localData` (clears unsent drafts on sign-out).

---

## 3. Member screens: behaviour to replicate in React Native

Grouped by screen. Each line is "what the web now does". Use the commit hash to find the diff.

**Home**
- Next session and My bookings merged into one full-width tile; My coaching its own tile with a message-your-coach row (`345fc6a`, `e574159`).
- Challenge countdown card removed for members; Today / My progress tabs removed again; progress cards and club bar sit under the streak card, Explore below (`02f7859`, `5722340`).
- Next-event tile; check-in toggles; Peak Week export (`f4990a0`). Details-confirm banner (`48b57df`). Update-available prompt on web (`ee02778`) has a mobile equivalent in store updates, not this.

**Food (Coach tab > Nutrition)**
- What a member logs is the same everywhere: kcal-only foods count, emptied days are empty, sliders stop saving zeros, old days are not blanked (`38fe785`).
- No blank days when browsing; no reload per tap; midnight rollover; sensible quantity limits; Quick Adds can be edited; the app asks how much after a barcode scan (`7fc0a4d`). Barcode padding and quantity boxes: earlier commits are already in the baseline.
- Hidden foods are excluded (`2599f55`). Photo diary stays visual only. Coach feedback on days/photos is visible to the member.
- Meal planner and recipes use the same Add food, favourites and recent sheet as the diary.

**Training**
- Workout screen: unique set numbers, no empty sets, block choices follow the server, Finish workout says what was done; Coach hub follows the current programme (`d134e2e`).
- Logging, correcting or deleting a set updates the screen at once without reloading the dashboard (`c8f5d65`).
- Personal bests from the database (`61c99f8`, 0137).

**Book and credits**
- Cancellation rules come from the gym, not the first session (`526dae4`). Credits screen: recent activity, bonus credits that run out, the reset (now Saturday) (`182c92e`, `cd764fb`). Booking and set history is bounded (`61c99f8`).
- The bell marks everything read in one call (`182c92e`). Class cancellations now push to every booked and waitlisted member with a refund line (`3e5050a`, server side: the app only has to display the push).

**Chat**
- Opens on the latest 50 messages with "Load earlier"; attachments are signed as they scroll into view; sent messages appear at once; the app catches up after a dropped connection (`5f46c01`).
- Realtime stays; limits in 0108.

**Profile, Setup, Onboarding**
- Setup saves only what the member changed, explains coach-controlled fields, and locks the starting weight (`7426943`).
- Onboarding keeps answers if the page is lost, asks for privacy consent, offers sign-out, asks existing members for a missing height or weight (`fc0026e`). No sign-up under 16 (`b824b25`).
- Account deletion request and "download my data" exist (`f4990a0`, `65e1a9c`).
- Notification toggles roll back if the save fails (`526dae4`).

**Progress and check-in**
- Measurements show the latest value per site and refuse an empty save; uploads use safe names, clean up after a failed save, and signed links last an hour (`3363d42`).
- Overview weekly average tabs for weight, calories, protein, steps, sleep and water (`1d53519`).
- Weekly Log: streak counts from the latest logged day; day chips say which day is chosen and the traffic-light dot is also written out (`75b7e68`, accessibility intent applies to RN too). Numbers in forms must be real numbers; sign-out clears unsent drafts (`dcff438`).
- A coach opening a day of meal photos or an answered form no longer marks it reviewed (server and coach side only).

**Community, learning, legal**
- Lesson links only when https; YouTube from the no-cookie host; library images only from allowed hosts with no referrer (`991496a`).
- Events: event dates en-GB; people signed up are told when an event moves, changes place or is cancelled (push, server side).
- Refer a friend uses the member's own gym link and is hidden without one; the FAQ is built from the app's own data (`5e2b493`).
- Privacy Policy and Terms are readable signed out and come from `content/legal/*.md`, marked draft (`65e1a9c`).

**Push notifications**
- Web push changes (tags, failure counting, shared-phone takeover) are web only. The phone push uses `push_devices` (0113) and the sandbox's own sender. Keep the message wording the web now uses: class cancellation with refund line, replies with the coach's name only.

---

## 4. Skip list (web-only, do not port)

Security headers and CSP; service-worker versioning and the install/offline page; Next.js 16.4.1 upgrade; skip links,
`main` landmarks, focus traps and `inert` page-behind handling, keyboard menus, arrow-key tab rows, zoom-by-keyboard
(but keep the intent in React Native with `accessibilityRole`, `accessibilityLabel`, `accessibilityState` and
44 pt touch targets; the web's rule is 40 px minimum); `/auth/confirm` one-time token and mail-scanner safeguards
(unless the mobile app does its own magic links); middleware / signed-token route gating; skeleton before JavaScript;
"update ready" banner; unsubscribe page for broadcast email; CSV formula guards; coach and owner screens
(`patches/5-*`), gym switcher, hub tabs, owner roster/reports, red flags, broadcast, imports.

## 5. Suggested order

1. Apply 0115 to 0144; run the SQL checks under `supabase/tests` if they exist in both projects.
2. Replace `packages/shared` calculations, Big Dog and onboarding logic with the current versions; run its tests.
3. Add the new helpers above with their tests.
4. Slice by slice: Home, Book/credits (Saturday reset!), Food, Training, Chat, Progress/check-in, Profile/onboarding, Community/legal.
5. Re-capture the screens with the Playwright script and compare with `docs/screens/` to see which design details changed (the web's Home layout changed in `345fc6a`/`e574159`/`5722340` after the screenshots there were taken, so those Home screenshots are OUT OF DATE; re-capture them).

## 6. Questions for the owner before porting

- Do you want the mobile app to match the new Home layout exactly, or keep its current one?
- Saturday reset: confirm it applies to the mobile credits screen and any widget copy.
- Native push wording: reuse the web's, or write mobile-specific text?

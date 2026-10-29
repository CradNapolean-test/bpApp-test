# Expo Rewrite: Final Roadmap

Written 2026-10-12, after the visual polish pass. Covers: what is left to match the web app, the backend work, getting the app onto real
devices (including Xcode on a Mac), the legal requirements, and what it takes to pass App Store and Google Play review.

How this was made: from the repo (screens, migrations, API routes, crons, docs) and from the Apple, Google and Expo pages listed under
Sources. It is not a pixel-by-pixel comparison with the web app, so step 1 of Phase 3 is a side-by-side audit that produces the final
punch list. Store rules change; anything marked **[verify]** came from a third-party page or from memory and must be confirmed in
App Store Connect or Play Console before you rely on it. **This is not legal advice**: privacy policy, terms and the breach and deletion
rules need a lawyer who knows UK data protection and consumer law (your members are in the UK).

Standing rules still apply: sandbox only until you explicitly move to production, no push / deploy / store submission / new cloud
resource without asking, no secrets in the repo, `lib/calculations.ts` is never re-derived, credits stay an append-only ledger and RLS
stays the security boundary.

---

## 0. The short version

**Where we are.** Every member screen the web has now exists in the phone app and works in the browser build against the sandbox:
Home, Book and credits, Coach hub, Food (all three modes), Workouts, Chat, Progress, check-in, Forms, onboarding, Learn, Recipes, Meal
Planner, Activity, Community, Big Dog, Notifications, Profile, password reset, offline writes, and push code. Coaches and owners stay on
the web. Nothing has been run on a phone from slice 8 onward, migrations through 0114 are applied and verified in the sandbox (2026-10-13), and the app is not yet
configured for any store.

**The critical path is not code.** What takes calendar time is waiting: an Apple/Google organisation account (a D-U-N-S number can take
up to about 30 days), a lawyer-reviewed privacy policy and terms, Google's 14-day closed test for new personal accounts, and review
cycles. Start those first, in parallel with the code. Rough total if started now: **8 to 10 weeks**, of which perhaps 4 to 5 are building.

**Eight things that would get the app rejected or break it today:**

1. The web's `/legal/privacy` and `/legal/terms` are placeholders ("Your coach hasn't published a privacy policy yet"). Both stores
   require a real privacy policy URL.
2. Account deletion is "request it from your coach, not instant". Apple's guideline 5.1.1(v) and its FAQ say outside regulated
   industries the user must be able to start and complete deletion in the app without contacting support; Google also wants an in-app
   path plus a web link.
3. A reviewer cannot sign in: accounts are invite-only. You need a demo account and review notes.
4. The app has no store configuration: no bundle identifier / Android package, no `eas.json`, no EAS project id, a leftover template-blue
   notification colour (`#208AEF`), no export-compliance flag.
5. The database the app talks to is the sandbox. The live database very likely lacks the security fixes in migrations 0105 to 0114, and
   the phone talks to the database directly, so those fixes must reach production **before** the app does.
6. Coach-private notes (`admin_notes`) are still readable by the member who owns the profile row (known, unfixed; exists on the live web
   too).
7. Nothing has been run on a phone from slice 8 onward (offline queue, push, camera scan, share sheet, status bar, new icon).
8. No self-serve consent record exists (no `terms_accepted_at` anywhere), and the sign-in screen has no Terms/Privacy links.

---

## 1. Decisions needed from you (with my recommendation)

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | Is Ballistic Performance a registered company? Apple/Google account type: Individual or Organisation | Organisation if there is a registered entity (needs D-U-N-S; a UK limited company often has one already, so look it up free with Dun & Bradstreet before requesting one **[verify]**); otherwise Individual | The seller name on the store is your legal name (Individual) or company name (Organisation). Google personal accounts created after 13 Nov 2023 need a 12-tester, 14-day closed test; organisation accounts do not. An Individual Apple membership can later be converted [verify] |
| D2 | Public web address (domain) | One domain you own, e.g. a `/legal`, `/support`, `/delete-account` set of pages plus `.well-known` files | Needed for privacy policy URL, support URL, Google's deletion link, universal links, email deliverability, invite links |
| D3 | Where do your members live? | **Answered 2026-10-13: the United Kingdom.** (An earlier version of this roadmap guessed NZ/AU from a barcode research note; that was wrong, and the note itself records the same mistake.) | UK law applies: section 6.4 |
| D4 | How does the app reach production? | Promote the sandbox work to the live Supabase project by applying migrations 0105 to 0114 after a rehearsal (section 3, B8) | This is the one step that lifts the sandbox-only rule. It is yours to approve and run |
| D5 | Production database region | London (eu-west-2) is the closest region for UK members; the sandbox is in Ireland (eu-west-1), which is also close and which UK rules treat as adequate **[verify]**. I do not know the live region (never touched) | Every screen makes several round trips, so distance is felt directly. A project's region cannot be changed in place |
| D6 | Keep the AI food-photo estimate? | **Answered 2026-10-14: no, scrapped for the app.** The phone's photo diary stays visual only. Code removed from the sandbox web app 2026-10-14 (`lib/ai/estimateFoodPhoto.ts` and `app/api/estimate-food-photo`). Still to do on the live site (yours): confirm no `ANTHROPIC_API_KEY` is set in the live Vercel project | No new cloud route, no AI provider in the privacy policy, one fewer processor |
| D7 | Accounts created in the app? | No for 1.0: keep sign-up on the web invite link, the app only signs in | Fewer store rules triggered (account creation raises deletion, consent and Sign in with Apple questions) |
| D8 | Public store listing, or "unlisted" on iOS | Start with TestFlight to your members, then decide. Apple's unlisted distribution [verify] suits a members-only gym app | Public listing means anyone can download an app they cannot use |
| D9 | iPhone only, or iPad too | iPhone only for 1.0 | Fewer screenshots and layouts to test |
| D10 | Android in the first release | Yes, but start its closed test early | The 14-day test is the longest fixed wait |
| D11 | Members reading lessons of their coach's unassigned courses | Restrict to assigned courses (fix in a migration) | Open question from slice 7c |
| D12 | Bundle identifier / Android package (reverse domain, e.g. `com.yourdomain.ballistic`) | Decide once; it cannot change after the first App Store release | Affects every credential and link |

---

## 2. Phases at a glance

| Phase | Goal | Depends on | Mostly who | Calendar (rough) |
|---|---|---|---|---|
| 0 | Decisions D1 to D12; start every long-lead item (enrolment, D-U-N-S, domain, lawyer, data inventory) | nothing | You (+ me for the data inventory) | day 0, then waiting |
| 1 | Finish the sandbox backend: apply 0113 and 0114, run every suite | **DONE 2026-10-13** | You ran `db push`, I ran the suites | done |
| 2 | First real devices: Android build now (Windows), iPhone via EAS, optional Mac/Xcode | Phase 1 for push; Apple paid account for iOS builds | Me (config) + you (devices) | 1 to 2 weeks incl. fixing what the phones show |
| 3 | Parity: close the remaining gaps between app and web | 2 | Me | 2 to 3 weeks |
| 4 | Backend to production grade (section 3) | 1; some items need D2 | Me + you | in parallel with 3 |
| 5 | Compliance build: legal pages, in-app deletion, consent, licences, privacy declarations | D1, D2, lawyer | Me + lawyer + you | 2 to 3 weeks, in parallel |
| 6 | Production rehearsal and cutover | 3, 4, 5 | You run, I prepare | 1 week |
| 7 | Beta: TestFlight external testers, Play closed test | 6 | You + members | 2 weeks (Google's 14 days) |
| 8 | Submit, review, phased release | 7 | You (I prepare everything) | 1 to 2 weeks incl. one rejection cycle |
| 9 | After launch: updates, monitoring, yearly renewals | 8 | You + me | ongoing |

Effort labels below: **S** under a day, **M** two to four days, **L** one to two weeks of focused work, excluding waiting on others.

---

## 3. Backend: what exists and what must be done

### 3.1 How the backend is shaped today

- **Supabase** (Postgres + Auth + Storage + Realtime): about 75 distinct `SECURITY DEFINER` functions, six storage buckets
  (`progress-photos`, `food-photos`, `voice-notes`, `chat-photos`, `inbody-scans` private; `coach-branding` public), Realtime only on
  `chat_messages`. RLS is the real boundary and passes 55/55 isolation checks in the sandbox.
- **No Edge Functions, no `pg_cron`, no `pg_net`.** Everything privileged runs in the Next.js app on Vercel (a deliberate precedent from
  migrations 0039 and 0060): six daily crons (`replenish-memberships`, `expire-credits`, `checkin-reminders`, `send-communications`,
  `red-flags`, `apply-programme-rollouts`, each guarded by `CRON_SECRET`), push sending (`lib/push.ts`, now also `lib/expoPush.ts`), email
  through Resend, coach/member creation (`create-client`, `import-clients`,
  `create-coach`) and the invite sign-up (`/api/join`, uses the service role).
- **The phone calls Supabase directly under RLS** and calls no web route today. So the web deployment must stay healthy for everything
  server-side: push, reminders, emails, invitations.
- Sandbox project is in eu-west-1; the live region is unknown to me. There is no sandbox Vercel project yet (so nothing web-side can be
  reached from a phone until one exists, which needs your approval).

### 3.2 Backend work list

**B1. Apply 0113 and 0114, re-run all suites (DONE 2026-10-13: both applied; all 13 suites pass with 0 failures, RLS 56/56, 158 RPC denial calls).** `npx supabase db push`, then
`push-devices-check.cjs --expect-0113`, `diary-modes-check.cjs --expect-0114`, and re-run the rls, rpc and every other suite (0113 adds a
`SECURITY DEFINER` function).

**B2. Close the open security items before production (M to L).** All are listed in `docs/SECURITY_DEFINER_AUDIT.md` "Not covered yet":
- Members can read coach-only columns of their own `client_profiles` row (`admin_notes` and friends). Fix: move them to a coach-only table
  and change the web coach screens. Already true on the live web today, so this is worth fixing even without the app. (Since the review
  fix on 2026-10-13 the phone app no longer fetches or caches `admin_notes`; it names its columns in
  `packages/shared/src/data/clientProfileColumns.ts`. The database itself still lets a member read it, which is what this item closes.)
- Decide D11 (unassigned course lessons) and write the migration.
- Tests for a coach at a different gym and an unassigned coach (needs a second gym and coach in the sandbox).
- Owner-role functions beyond the denial tests; a hand review of the credit maths and waitlist promotion for logic errors.
- Run Supabase's **Security Advisor and Performance Advisor** on the sandbox and, by you, on the live project (RLS gaps, mutable
  `search_path`, unindexed foreign keys, slow policies). Add indexes the advisors and `EXPLAIN` find.
- Several migrations use `NOT VALID` constraints (they protect new writes without scanning old rows). On the live data: find rows that
  violate them, clean them, then `VALIDATE CONSTRAINT`.

**B3. A small "phone API" on the web server (M).** The phone needs a few things only a server can do. Recommendation: Next.js routes in
the existing app (same pattern, same secrets, no second codebase), not Supabase Edge Functions. They need a bearer-token variant of
`createClient` (the existing routes read cookies; a phone sends `Authorization: Bearer <access token>`), per-user rate limits, and a
stable public URL (D2). Endpoints: delete my account (B4), invite sign-up (only if D7 changes), and
optionally a push-receipt check. Watch Vercel function time limits for the AI call on your plan **[verify]**.

**B4. Self-serve account deletion (M to L).** Today `requestAccountDeletion` only sets `deletion_requested_at` and emails the coach.
Needed: an in-app "Delete my account" that works without the coach, with a confirmation step (password or emailed code) and a short grace
period if you want one. Design points found in the schema:
- Deleting the auth user needs the service role, so it runs in a B3 route, not on the phone.
- `profiles` and most member tables cascade on delete, including `credits_ledger`. The ledger is also a financial record. Decide with your
  accountant whether to delete it, or keep rows with the member anonymised (UK businesses generally keep accounting records for at least six years; confirm with your accountant **[verify]**). The
  ledger stays append-only either way.
- Storage objects are not removed by table cascades: photos, voice notes, chat photos and scans must be deleted explicitly.
- Remove push tokens (cascade), sign out other sessions, notify the coach, block deletion of the reviewer demo account.
- Needs a new suite proving another member's data is untouched.

**B5. Consent record (S to M).** Nothing stores that a member accepted the terms. Add `terms_accepted_at`, `terms_version`,
`privacy_version` (and a re-accept prompt when a version changes), written at invite sign-up and at first sign-in on the phone. Needed for
health data and useful in any dispute.

**B6. Auth configuration for production (S, you in the dashboard).**
- Redirect allow-list must include the app scheme (`ballistic://`) and the web URLs.
- Reset-password template: keep the web link and add `{{ .Token }}` (the app uses the code), so web and app members both work off one
  template (`docs/SLICE_8_SETUP.md`).
- **Custom SMTP.** Supabase's built-in sender is for testing and is rate-limited. Real members need a custom sender (Resend is already in
  the web app) with SPF, DKIM and DMARC set on your domain.
- Review password policy / leaked-password protection (a paid-plan feature **[verify]**), rate limits, email OTP length, session lifetime.
- The success path of "change email" is still untested because it sends a real email; test it once SMTP is real.

**B7. Production Supabase project (S to M, you).** Plan with daily backups and, ideally, point-in-time recovery (free projects pause
when idle and have no backups **[verify]**); region (D5); a tested restore; Realtime concurrent-connection limit of the plan versus your
member count (each open app is one connection); key hygiene: anon/publishable key only in the app, service-role only in Vercel, rotate
if ever exposed.

**B8. Migration promotion and cutover (M, rehearsed by me, run by you).**
1. Treat the sandbox as **staging** from now on: every change lands there first, then is promoted.
2. Rehearsal: restore a backup of live into a throwaway project, apply 0105 to 0114 (and anything newer) there, run every security suite
   and click through the coach and owner web screens. This proves the hardening does not break the live web app.
3. Check the migration history first with `supabase migration list` against the live project. Two files have unusual numbers
   (`00941_programme_rollouts.sql`, `01001_session_cancel_reason_restore.sql`), and if the live schema was ever applied by hand the history
   table may not match the files, in which case `db push` could try to re-run old migrations. Repair the history before pushing.
4. Order on cutover day: back up, apply migrations (additive and hardening), deploy the matching web release, then publish the app.
   Rollback is restore-from-backup, so pick a quiet hour.
5. I prepare the ordered script, the checklist and the `--ref` parameterised suites; **you** run them against live.

**B9. Web release to deploy with the app (S to M).** Phone push sender (`expoPush.ts`, `push.ts`), the voice-note recorder fix (P8 below),
the B3 routes, real `/legal/*` pages, support and deletion pages, `public/.well-known/apple-app-site-association` and `assetlinks.json`
for universal links, and the environment variables (`EXPO_ACCESS_TOKEN` optional, `RESEND_*`, `CRON_SECRET`, VAPID
keys). Deployment is yours.

**B10. Push hardening (M).**
- Duplicates: `sendPushToClient` sends to phones **and** browsers, so a member with the installed web app and the phone app is notified
  twice. Prefer the phone when one is registered.
- Expo returns delivery receipts later (about 15 minutes) that report `DeviceNotRegistered`; today only the immediate ticket errors prune
  tokens. Add a small receipt-check job if stale tokens pile up.
- Credentials: an APNs key (needs the paid Apple membership) and an FCM service account, both uploaded through EAS.
- The web only pushes three things today (coach message, nutrition feedback, check-in reminder). Anything more (class reminders,
  cancellations, form assignments) is beyond web parity; decide later.

**B11. Crons and jobs (S).** Confirm all six Vercel crons run on the production plan, add failure alerts (cron errors into Sentry),
and check the check-in reminder time (`0 4 * * *` UTC) suits members' local time now that it also reaches phones.

**B12. Keep old app versions working (M).** The database is shared with app binaries that members may not update for months.
- Rule: migrations are **expand, then contract**: never drop or rename a column or function the shipped app reads.
- Add a `min_supported_app_version` setting the app checks at start and an "Please update" screen for a forced upgrade.
- Use EAS Update (over-the-air) for JavaScript-only fixes, on separate channels per environment, with a runtime-version policy so a
  fix never reaches a binary it was not built for.

**B13. Observability (S to M).** Sentry exists on the web only; the phone app has no crash reporting. Add it (and list it in the privacy
policy). Uptime checks for the web and Supabase, Supabase log review, alert on auth-failure spikes, Expo push delivery stats.

**B14. Performance on real networks (M).** All timings so far are from one PC. Re-measure on a phone over mobile data against the
production region. Likely follow-ups: resized photo thumbnails created at upload (today whole files load), indexes from the advisors, and a
single `get_member_home()` function **only if** the phone measurements show round trips hurt. Live "spots left" should refetch on focus
rather than add Realtime on booking tables (members cannot read other members' bookings under RLS).

**B15. Environments and secrets (S).** Three environments (local, sandbox/staging, production) with per-profile EAS environment
variables; `.env.local` and credential files stay gitignored; Apple, Google and Expo accounts owned by the business, not a personal login,
with a second admin for each.

**B16. Content readiness (S to M).** A demo gym with a realistic demo member for reviewers (the seeded 12-week member is the model);
default onboarding form and starter forms present in production; exercise demo videos hosted with the right to use them; FAQ text signed
off.

---

## 4. Parity: web app versus the phone app

### 4.1 Done (in the browser build; none seen on a phone after slice 7)

Home, Book (classes, waitlist, credits), Coach hub, Food (full diary, manual macros, photo diary, recipes, meal planner), Workouts (logging,
maxes, rest timer, block choices, rating), Chat (text, photo, voice, Realtime), Progress (photos, measurements, scans, overview), daily
check-in, Forms, Personal details, onboarding, Learn, Events, Feedback, Refer, Rewards, FAQs, Big Dog, Activity, Notifications, Profile,
screen-access switches, Light/Dark, password reset, offline writes, push code.

### 4.2 Gaps to close (Phase 3)

| # | Gap | Size | Needs |
|---|---|---|---|
| P1 | **Parity audit**: walk every web member screen next to the app, record differences, wording, empty states, errors | M | web and phone side by side |
| P2 | Terms and Privacy links (sign-in, Profile, onboarding) | S | published legal pages (Phase 5) |
| P3 | Self-serve account deletion screen | M | B3, B4 |
| P4 | Consent screen / record and health disclaimer in onboarding | S | B5, legal text |
| P5 | ~~AI estimate for food photos~~ **Dropped (D6 = no).** The phone photo diary stays visual only | none | none |
| P6 | PDF body-scan printout upload (only existing PDFs open today) | S | `expo-document-picker` |
| P7 | Invite-link join in the phone (only if D7 is "yes"); otherwise the link opens the web join page | M | B3, D7 |
| P8 | **Voice notes across devices**: the web recorder saves WebM, which iPhones may not play. Make the web recorder prefer MP4/AAC and test coach-to-phone playback | S | web change + phone test |
| P9 | Universal links / app links so reset, invite and push links open the app from any email app | M | D2, B9 |
| P10 | Embedded demo-video player (links open the in-app browser today) | S to M | `expo-video`; know where videos are hosted |
| P11 | Live "spots left" refreshing on the Book tab | S | B14 note |
| P12 | Crash reporting | S | B13 |
| P13 | Open-source and data licences screen (Open Food Facts requires attribution; Lucide is ISC; Expo and React Native are MIT) | S | none |
| P14 | Role gate: make sure a coach or owner signing in on the phone gets a clear "use the web app" message instead of a member app | S | check current behaviour |
| P15 | Haptics, accessibility pass (VoiceOver labels, Dynamic Type, contrast) | S to M | a phone |
| P16 | Minimum-version gate and "Please update" screen | S | B12 |

### 4.3 Deliberately not copied

- Coach and owner features (clients, programmes, classes admin, reports, business, run-class, TV view): stay on the web.
- Habits (the web has no member screen), Insights (coach-only), meal-section editing (coach-only).
- Install banner and service worker (browser-only ideas).
- Selling credits or memberships inside the app: the web has no payment processor either (the coach grants credits). **Keep it that way for
  1.0** (see section 7, payments).
- Offline recipes and meal planner: not in the web either; optional later.

---

## 5. Getting the app onto real devices

You are on Windows. Xcode only runs on a Mac, so there are three routes. Pick by what you have.

| Route | Needs | Gets you | Push works |
|---|---|---|---|
| A. Android build via EAS | free Expo account, an Android phone | installable APK from a link | yes, once Firebase/FCM is set up |
| B. iPhone via EAS (no Mac) | **paid** Apple Developer Program, Expo account | ad hoc build on registered iPhones, then TestFlight | yes (APNs key) |
| C. Mac with Xcode | a Mac that runs current Xcode 26 (**[verify]** macOS requirement), Apple ID (free works for plain installs, 7-day signing; paid needed for push and TestFlight) | local build, run on a cabled iPhone or the simulator, archive and upload | push needs paid + real iPhone |

Expo Go (what you may have used so far) cannot run the push plugin and some native modules, and iOS App Store uploads need Xcode 26 or later
(in force since 28 April 2026), which EAS Build uses by default.

### 5.1 Repo configuration needed before any of the routes (S, me, after D1, D2, D12)

- `app.json`: `ios.bundleIdentifier` and `android.package` (D12); `ios.buildNumber` / `android.versionCode` handled by EAS auto-increment;
  `ios.supportsTablet` decided (D9); `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` (the app uses only standard HTTPS);
  `ios.privacyManifests` for any "required reason" API the build reports; the notification colour changed from template blue `#208AEF`
  to brand teal `#2ABFBF`; `extra.eas.projectId` (written by `eas init`); `updates` / `runtimeVersion` for EAS Update;
  associated domains for universal links (D2); `android.googleServicesFile` (Firebase).
- `eas.json` with three profiles: `development` (dev client, internal), `preview` (internal distribution, sandbox variables),
  `production` (store, production variables, auto-increment version).
- `.gitignore`: add `/ios` and `/android` (generated by `expo prebuild`, never hand-edited).
- Expo patch updates (`expo`, `expo-router`, `@expo/ui`, `expo-splash-screen`) applied with `npx expo install --fix`, then re-tested.

### 5.2 Route A: Android on your PC, today

1. Create a free Expo account; `npx eas-cli@latest login`; `eas init` in `apps/mobile` (creates the cloud project: ask first).
2. Add the `preview` profile with `android.buildType: apk`; set the sandbox variables in EAS.
3. `eas build --platform android --profile preview`; open the link on the phone; install.
4. For push: create a Firebase project, add the Android app, download `google-services.json`, upload the FCM key through `eas credentials`.

### 5.3 Route B: iPhone through EAS (no Mac)

1. Join the Apple Developer Program (D1). Confirm the App Store Connect login works.
2. `eas device:create`; open the link on each iPhone you want to test on (registering with Expo is not enough; the device reaches Apple only
   when it is first included in a build).
3. `eas build --platform ios --profile preview` (ad hoc, installs on registered devices only; add a device and rebuild).
4. For wider testing: `eas build --platform ios --profile production` then `eas submit --platform ios` to TestFlight.
   - Internal testers: up to 100 people on your App Store Connect team, available once processing finishes.
   - External testers (your members): a first build goes through a light Beta App Review; a public link allows many more testers
     **[verify limits]**; builds expire after 90 days **[verify]**.
5. Push: `eas credentials` creates the APNs key on first build. Needs a real iPhone, not the simulator.

### 5.4 Route C: Mac with Xcode

1. On the Mac: install Xcode 26 from the Mac App Store, open it once to accept the licence and install components; install Node (LTS),
   Watchman and CocoaPods (or let Expo's tools install them).
2. **Move the project without pushing it.** In the sandbox repo: `git bundle create ballistic-sandbox.bundle --all`, copy the file by USB,
   AirDrop or a private drive, then on the Mac `git clone ballistic-sandbox.bundle expo-rewrite`. Do not copy `.env.local` or
   `sandbox-credentials.local.txt` through shared storage; re-create `.env.local` from `.env.local.example`.
3. `cd expo-rewrite/apps/mobile` then `npm install`. (`@ballistic/shared` is linked from `../../packages/shared`.)
4. `npx expo prebuild --platform ios` generates the `ios/` folder. Do not edit it by hand; change `app.json` or a config plugin and re-run
   (`--clean`).
5. Open `ios/<name>.xcworkspace` in Xcode (the **workspace**, not the project, because of CocoaPods).
6. Xcode > Settings > Accounts: sign in with the Apple ID. Select the app target > Signing & Capabilities > pick your Team and keep
   "Automatically manage signing" on. Add the Push Notifications capability (paid membership only).
7. On the iPhone: Settings > Privacy & Security > Developer Mode on; plug in; trust the computer. In Xcode choose the iPhone as the run
   destination and press Run. (Alternative without opening Xcode: `npx expo run:ios --device`.) The simulator is free and needs no
   account but cannot receive push.
8. For the store: Product > Archive > Distribute App > App Store Connect > Upload (or run `eas submit` from the Mac). Uploads must come
   from Xcode 26 or later.

### 5.5 What to check on a phone (nothing below has been seen on a device yet)

- Look: status bar colour in Light and Dark, notch and home-indicator spacing, keyboard covering inputs (chat, check-in, diary), the
  new icon and splash, tab bar on small and large phones, Dynamic Type at the largest size.
- Permissions: camera, photo library, microphone: allow and **deny** paths; barcode scanner on real packaging.
- Share sheet (Refer a friend), in-app browser (lessons, videos), voice notes both directions (P8).
- Offline: airplane mode while logging sets and food, kill the app while offline, reopen online (each change saved once, in order);
  weak signal; sign-out with changes waiting.
- Push: foreground, background, app killed; tap lands on the right screen; permission prompt wording; badge count; unsubscribe on sign-out.
- Links: `ballistic://reset-password` link; later universal links.
- Speed: cold start and each tab over mobile data; battery and memory on a low-end Android.
- Data: move through sign-in, reset, onboarding with a throwaway account; session survives an app restart.

---

## 6. Legal requirements

### 6.1 Accounts and who the stores think you are

| Item | Apple | Google |
|---|---|---|
| Fee | US$99 per year | one-time fee (about US$25 **[verify]**) |
| Individual | quick; your personal legal name shows as seller; no collaborators | allowed, but accounts created after 13 Nov 2023 must run a closed test with at least 12 opted-in testers for 14 days before production |
| Organisation | needs a registered legal entity, a D-U-N-S number (free, can take up to about 30 days), a public website on a domain tied to the organisation, a work email on that domain, and authority to sign for the company | also needs a D-U-N-S whose name and address match your payments profile; exempt from the 14-day test |
| EU storefronts (only if you also offer the app in EU countries; UK-only does not need it) | declare "trader" status; contact details appear publicly **[verify]** | same **[verify]** |

One D-U-N-S number serves both stores. Start it first if D1 is "organisation".

### 6.2 Documents to publish (on your own domain, D2)

1. **Privacy Policy** (mandatory on both stores; also reachable inside the app). Must say what is collected, why, who receives it, where it
   is stored, how long it is kept, how to access, correct and delete it, how to complain (to the ICO), who to contact, and how breaches are handled. Under UK GDPR it also names the legal basis for each use (for health data, explicit consent).
2. **Terms of Service / EULA** (Apple's standard EULA applies unless you provide your own): coaching relationship, the health disclaimer
   ("not medical advice; check with a doctor before changing diet or training"), credits (no cash value, expiry, cancellation and refund
   rules), acceptable use, liability, minimum age, governing law.
3. **Support page** (Apple requires a support URL) with a contact email/form.
4. **Account and data deletion page** (Google requires a web link; Apple wants a direct link if any step is on the web).
5. **Open-source and data attributions** (in-app screen and web page).
6. The web already links `/legal/terms` and `/legal/privacy` from the invite page; those pages need real text, not the current placeholder.

Do not copy a template for health data. The web's own code comment says legal text should not be auto-generated for real health data. I
can produce a **data inventory** from the code (section 6.3) so the lawyer starts from facts, and the store declarations stay accurate.

### 6.3 Data inventory (from the schema and screens; the lawyer and the store forms both need this)

| Data | Where it lives | Sensitivity | Goes to |
|---|---|---|---|
| Name, email, phone, date of birth, address, emergency contact | Supabase (profiles, client_profiles) | personal | Supabase |
| Bodyweight, measurements, goal, body-scan figures and scan printouts | Supabase + `inbody-scans` bucket | **health** | Supabase |
| Progress photos | `progress-photos` bucket | **health / sensitive images** | Supabase |
| Food diary, macros, food photos | Supabase + `food-photos` bucket | **health** | Supabase (not sent to an AI provider in the app; D6 = no) |
| Period start dates (female members; the cycle day is worked out from them) | `daily_logs.period_started` | **reproductive health: most sensitive** | Supabase |
| Sleep, steps, water, hunger, energy, motivation, stress, notes | `daily_logs` | **health** | Supabase |
| Workout logs, maxes, Big Dog scores | Supabase | fitness | Supabase |
| Chat messages, photos, voice notes | `chat_messages`, `chat-photos`, `voice-notes` | personal / possibly health | Supabase; notification text passes through Expo, Apple and Google push services |
| Bookings, attendance, credits ledger | Supabase | business records | Supabase |
| Push token, device type | `push_devices` | device identifier | Expo push service, Apple APNs, Google FCM |
| Barcode numbers looked up | sent to Open Food Facts | low | Open Food Facts |
| Emails (reset codes, broadcasts) | Resend, Supabase SMTP | personal | Resend |
| Crash and error logs | Sentry (web today, app when added) | diagnostic | Sentry |

Processors to list: Supabase, Vercel, Expo (EAS, push, updates), Apple and Google (push, stores), Resend, Open Food Facts, Sentry. **No advertising, no tracking across apps, no selling data** (state this explicitly; it also makes the store labels simple).

### 6.4 UK law to check with a lawyer

Your members are in the UK, so UK law applies. Points to put to a lawyer who knows it:

- **UK GDPR and the Data Protection Act 2018.** You are the "controller" of your members' data. Health data (weight, body scans, progress photos, food
  and period data) is special-category data: you need a lawful basis **and** an extra condition, normally explicit consent that you record (B5).
  Members' rights to see, correct, export and delete their data must be met within a month, which is why B4 (self-serve deletion) matters.
- **ICO registration.** Most organisations that handle personal data must register with the Information Commissioner's Office and pay the annual
  data protection fee **[verify the tier and any exemption]**. The ICO is also where members can complain and where a serious breach is reported.
- **Breaches.** A breach that risks members' rights must be reported to the ICO within 72 hours of you becoming aware of it, and to the members
  affected if the risk is high. Write the plan before launch.
- **Data protection impact assessment (DPIA).** Health data at scale, including photos and cycle data, may call for one; the ICO publishes a
  template. Keep it with the data inventory (6.3). Ask the lawyer whether your scale needs it.
- **Processor contracts and transfers.** Each service that handles members' data for you (Supabase, Vercel, Expo, Resend, Sentry)
  needs a data processing agreement. Data held in the EEA (Ireland, eu-west-1) is covered by UK adequacy rules **[verify]**; US vendors need the
  UK-US data bridge or the UK's standard contract terms, which most vendors' agreements already include.
- **Children.** The ICO's Children's Code applies to services likely to be used by under-18s. Set a minimum age (18 is simplest) in the Terms and the
  store age-rating answers. The app already collects date of birth, so decide what happens to an under-18 sign-up.
- **Marketing messages (PECR).** Marketing emails or push notifications need consent (or the "soft opt-in" for existing customers) and an easy
  unsubscribe; messages about a member's own coaching are service messages. The coach broadcasts and the notification switches in Profile should follow this.
- **Consumer law.** Consumer Rights Act 2015, Consumer Contracts Regulations 2013 and the subscription rules in the Digital Markets, Competition and
  Consumers Act 2024 (check the start dates **[verify]**): credit expiry, auto-renewal, cancellation and refund wording in the Terms, and the
  information given before a membership is sold online.
- **Business records.** UK businesses generally keep accounting records for at least six years **[verify with your accountant]**; that, more than a
  deletion request, decides what the credits ledger may lose (B4).
- **Online Safety Act.** It targets services where users share content with each other publicly; a private member-to-coach chat is unlikely to be in
  scope, but ask the lawyer to confirm **[verify]**.
- **Outside the UK.** If members ever sign up from the EU or elsewhere, the rules there (and possibly an EU representative) come into play; the
  invite-only model keeps this unlikely.

### 6.5 Practices that keep health data defensible

- Collect only what a screen uses; cycle data stays optional and clearly explained.
- Explicit consent at first use of: progress photos, body scans, cycle tracking.
- No use of health data for advertising or sale; no third-party analytics SDKs in the app.
- Encryption in transit is already standard; confirm encryption at rest on the production project; session storage on the phone is
  unencrypted SQLite today (listed as a hardening item in the original plan): move the auth token to the platform keychain/keystore
  (`expo-secure-store`) before release.
- Retention schedule and a tested deletion procedure (B4).
- Staff access: coaches can read their own clients only; owners per gym; document it.

### 6.6 Store declarations to complete

**Apple (App Store Connect):** App Privacy ("nutrition label"), derived from 6.3 (health and fitness data, contact info, user content,
identifiers; none used for tracking); privacy policy URL; support URL; age rating questionnaire (Apple replaced its age tiers in 2025, so
expect the newer questions **[verify]**); export compliance (HTTPS only); EU trader status; copyright and category (Health and Fitness);
App Review contact name, phone and email; demo account and notes.

**Google (Play Console):** Data safety form; **account deletion** link and in-app path; Health apps declaration (nutrition and weight
management, period tracking and sleep are listed options); content rating questionnaire; target audience (adults only, not Families);
app access (the demo login); ads declaration (none); privacy policy URL. New apps and updates must target **Android 16 / API 36** or
higher since 31 August 2026; a personal account also needs the 12-tester, 14-day closed test.

### 6.7 Payments rule

Credits and memberships are sold outside the app (cash, bank transfer, GoTeamUp) and used to book classes at a physical gym, which stores
generally allow without in-app purchase (Apple 3.1.3(e) **[verify]**). Keep the 1.0 app to **showing** balances and bookings: no buy
button, and no link out to buy digital items. If you ever add online payment for classes, re-read the payments guidelines first.

---

## 7. Passing store review: risk register

| Risk | Rule | Today | Fix |
|---|---|---|---|
| No or placeholder privacy policy | Apple 5.1.1(i); Google User Data policy | **Fails** | Phase 5 |
| Deletion needs the coach | Apple 5.1.1(v) + FAQ; Google deletion policy | **Fails** if accounts can be created in the app; weak otherwise | B4, P3; keep D7 "no" |
| Reviewer cannot log in | Apple 2.1 | **Fails** | demo member in a demo gym, credentials in review notes, deletion blocked for it |
| Members-only app looks "empty" to a reviewer | Apple 4.2, 2.1 | risk | review notes: "members are invited by their coach"; or unlisted distribution (D8) |
| Health and weight-loss content | Apple 1.4 (physical harm), 5.1.3 (health data); Google Health apps policy | medium | disclaimer in onboarding and Terms; coach review of starting plans is already in the web (mention it in review notes); confirm with the owner that auto-generated starting targets cannot produce unsafe targets for low-BMI or under-18 users (do not change `calculations.ts` here; raise it with the owner) |
| Sensitive data handling | Apple 5.1.1, 5.1.3; Google Data safety must match behaviour | medium | accurate labels from 6.3; no analytics SDKs |
| Permission prompts | Apple 5.1.1 purpose strings | good (specific strings exist) | ask only when a feature is used; push is already opt-in from a Home card |
| Push permission and badge | Apple 4.5.4 | good | keep opt-in; no marketing push without consent |
| Placeholder or broken content | Apple 2.1 | low | the parity audit (P1) and a link check |
| Crashes | Apple 2.1; Google vitals | unknown | real-device testing, Sentry |
| Privacy manifest / required-reason APIs | Apple upload checks | unknown | read the warnings after the first EAS build and add `privacyManifests` |
| Sign in with Apple | Apple 4.8 | not needed (email and password only) | do not add Google/Facebook sign-in without it |
| In-app purchase | Apple 3.1.1, 3.1.3(e) | none | keep it that way |
| Misleading metadata | Apple 2.3 | n/a yet | real screenshots, no "beta", no other-platform names |
| Icon | Apple icon rules | low | 1024 px, no transparency (the generated icon is on white) |
| Android target API and large-screen rules | Google (API 36 since 31 Aug 2026) | unknown | check the built bundle's targetSdk; test on a tablet/foldable emulator |
| Android 14-day test for personal accounts | Google | not started | schedule it early (D1, D10) |
| User-generated content | Apple 1.2 | low (private coach chat, no public feed) | keep chat coach-to-member; if a public feed is added, add report and block |

---

## 8. Submission runbook

1. **Prepare listing assets:** name, subtitle, description, keywords, category, promotional text, screenshots (current required iPhone
   size set **[verify]**, plus Android phone), feature graphic and 512 px icon for Google, support and privacy URLs.
2. **Final builds:** `eas build --profile production` for both platforms, with production environment variables and the production
   Supabase project. Smoke-test the exact store build on a clean phone.
3. **iOS:** `eas submit` (or Xcode upload) > build processes in App Store Connect > TestFlight internal > external beta (Beta App Review) >
   attach the build to version 1.0 > fill App Privacy, age rating, review notes and demo login > Submit for Review > choose manual or
   phased release.
4. **Android:** upload the `.aab` to Internal testing > Closed testing (14 days with 12+ testers if required) > Production with a staged
   rollout (start small); complete Data safety, Health apps declaration, content rating, target audience, app access and deletion link.
5. **If rejected:** read the exact guideline cited, fix, reply in Resolution Center; budget one cycle. Keep a rollback build ready.
6. **Day one:** watch Sentry, Supabase logs, push delivery and support email; keep the web app as the fallback for members.

---

## 9. After launch

- Renewals: Apple membership yearly; keep signing keys and App Store Connect/Play access with at least two admins.
- Yearly platform deadlines: Apple raises the minimum Xcode/SDK each spring; Google raises the target API each August; Expo releases a
  new SDK about every four months, so budget a regular upgrade.
- Ship JavaScript-only fixes by EAS Update; ship native changes through the stores.
- Review privacy declarations whenever a new SDK, data type or processor is added (a new AI feature, analytics, a new push type).
- Quarterly: security suites against production (read-only), advisor review, backup restore drill, dependency updates.
- Product backlog beyond web parity: more push types, haptics, widgets, offline recipes, Apple Health / Health Connect steps import
  (this would trigger additional Apple and Google health-data rules).

---

## 10. Order of work (suggested)

| When | Do | Who |
|---|---|---|
| Day 0 | Answer D1 to D12 (even "not sure yet" helps); start enrolment, D-U-N-S, domain, lawyer | You |
| Day 0-1 | ~~Apply 0113 and 0114 (`npx supabase db push`); I run all suites~~ done 2026-10-13 | You, then me |
| Day 1-3 | I add EAS/store config (5.1), build an Android preview; you install it and test on a phone; iPhone stays on Expo Go until the paid membership | Me, you |
| Week 1 | Data inventory for the lawyer; draft legal page structure; B2 security items; P1 parity audit with real phones | Me, lawyer |
| Weeks 2-4 | P2 to P16 gaps; B3 to B5 routes, deletion, consent; B10, B12, B13 | Me |
| Weeks 2-5 | Legal documents finalised and published; store declarations drafted; Google closed test started once the Android build is stable | Lawyer, you, me |
| Week 5-6 | Production rehearsal on a restored copy; fix what it shows | Me, you |
| Week 6-7 | Cutover (B8): you run migrations and web deploy; production builds; TestFlight external + Play closed test with real members | You, me |
| Week 8-9 | Submission, review, staged release | You |

**What only you can do:** enrol and pay; supply the legal entity and D-U-N-S; own the domain and DNS; choose the lawyer; run migrations on
live; deploy the web; create cloud resources (EAS project, Firebase, sandbox Vercel); approve every submission; add real members as testers.

**What I can do now without asking for anything new:** the store config, the Android build setup (the build itself needs your approval and
Expo account), the data inventory, the legal page structure, the parity audit checklist, the new routes and screens in sections 3 and 4, the
rehearsal script and suites, and keeping every doc and memory note current.

---

## Sources

- Apple, [Guideline 5.1.1(v) Account Deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) and
  [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- Apple, [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) (Xcode 26 / iOS 26 SDK for uploads since
  28 April 2026) and Expo's [explanation](https://expo.dev/blog/app-store-connect-minimum-sdk-26)
- Google, [Target API level requirements](https://developer.android.com/google/play/requirements/target-sdk)
- Google, [App account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) and
  [Health apps declaration](https://developer.android.com/health-and-fitness/health-connect/declare-access)
- Google, [Organisation account verification and D-U-N-S](https://support.google.com/googleplay/android-developer/answer/13628312)
- Expo, [Internal distribution](https://docs.expo.dev/build/internal-distribution/),
  [TestFlight](https://docs.expo.dev/submit/testflight) and [EAS plans](https://docs.expo.dev/billing/plans/) (the free-plan build count
  differed between Expo's own pages; check it before relying on a number)
- Third-party, to confirm in the consoles: [Google closed-testing rule](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026),
  [Apple/Google account guide](https://capgo.app/blog/how-to-create-apple-developer-and-google-play-developer-accounts/)

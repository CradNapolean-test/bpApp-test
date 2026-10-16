# Brief 12: Your own tasks and decisions (not for a chat)

This is the part of the audit **only you can do**: settings in dashboards, data clean-up, decisions the code cannot make for you, and the order to release the fixes. Each decision (D1 to D20) is referred to by the code briefs; they implement the **recommended default** until you decide otherwise.

## 1. Do first (no code, about an hour)

| # | Task | Where | Why |
|---|---|---|---|
| 1 | Turn **off** "Allow new users to sign up" | Supabase, Authentication, Sign In / Providers, Email | R1: today anyone on the internet can create a login and reach every "any logged-in user" weakness. The app never uses sign-up (the join link uses the admin key), so nothing breaks |
| 2 | Switch Brad's **active gym to Salford Quays** | App, Settings, Gym, Your gyms | R38: his screens show wrong data while it is Worsley. This is a data setting |
| 3 | Do **not** edit any form members have answered; do not use "Everyone at the gym" when starting a programme; open one coach conversation at a time | Habit | R3, R5, R4 until fixed |
| 4 | Verify a **sending domain** in Resend, then set `RESEND_FROM_EMAIL` (and `VAPID_SUBJECT` with a business address) in Vercel **Production**, then redeploy | Resend, Vercel | R2, R42: no app email reaches members today |
| 5 | Enable **custom SMTP** for Supabase Auth (Resend SMTP works) | Supabase, Authentication, SMTP Settings | Built-in sender is limited to a few emails an hour and, on current plans, only to your own team: member password resets would fail |
| 6 | Set **Site URL** and **Redirect URLs** to the production address (remove `localhost` for production) | Supabase, Authentication, URL Configuration | Reset links must not point at the wrong place |
| 7 | **Remove the 219 test accounts** (section 3) before testers join | Script or SQL | R6, R46: they inflate every owner number, get daily reminders, and would be emailed by a gym broadcast |
| 8 | Delete the "test" event, the "Test" and "test 2" programme templates, and one of the two "Education Library" courses | App | R35: members see "Next event: test" on Home today |
| 9 | Fix the **Worsley "6 week challenge" plan** (no length, no daily check-in) and give **Salford a default intake form** | App, Business and Library | R35/D8: new Salford members currently get no form automatically |
| 10 | Check your **Supabase plan and backups** (Free has no backups and pauses after a week unused) and the **project region** | Supabase, Billing and Infrastructure | R8, R10 |

## 2. Dashboard checklists

Use the tables in `docs/PRE_TESTING_CHECKLIST.md` section 3 (Supabase, Vercel, Resend, Sentry) and the 20-step real-device script in the same file. Extra items:

- **Supabase, Database, Advisors:** run the Security Advisor and Performance Advisor and keep the output (it lists missing row-level security, loose functions, missing indexes).
- **Vercel, Settings, Advanced:** enable **Skew Protection** (R8); **Settings, Domains:** add the custom domain **before** members install the app (they install from the address; changing it later means reinstalling).
- **Multi-factor:** after brief 08 ships the screens, enrol every coach and owner (R7).

## 3. Data clean-up (read first, run on a copy or after a backup)

None of these were run by the audit. Take a backup first. Replace nothing; run each query separately.

```sql
-- 1. The 219 seeded test members (check the count first; expect 219)
select count(*) from auth.users where email like 'smoke-%@example.com';
-- Prefer the seed script's own cleanup: npx tsx scripts/seed-smoke-fleet.ts --cleanup
-- (brief 10 adds a guard; until then it has none: run it only knowing what it deletes).

-- 2. The test notification left on your test member by the form proof
delete from notifications where message ilike '%ZZ AUDIT%';

-- 3. The seeded test member's day that the audit changed (only if you keep that account)
update daily_logs set protein = null, carbs = null, fat = null, sleep = null
where id = '48ff2ffb-2a5f-44f5-875a-169dde8a97f4';

-- 4. One member account has no gym: find it
select id, email from profiles where role = 'client' and gym_id is null;

-- 5. Duplicate red-flag entries filed under the wrong gym (read-only first)
select e.week_start, e.gym_id, count(*)
from red_flag_entries e
where e.gym_id is distinct from public.client_gym_id(e.client_id)
group by 1, 2 order by 1 desc;
-- Brief 02 writes the reviewed delete; do not delete before reading its notes.

-- 6. Empty "logged" food days (0/0/0 and no entries): read-only count
select count(*) from daily_logs d
where d.protein = 0 and d.carbs = 0 and d.fat = 0
  and not exists (select 1 from food_diary_entries f where f.daily_log_id = d.id)
  and not exists (select 1 from manual_macro_entries m where m.daily_log_id = d.id);
```

## 4. Decisions (D1 to D20)

Reply to any you want to change. Until you do, the briefs implement the **recommended default**.

| ID | Question | Options | Recommended default | Used by |
|---|---|---|---|---|
| D1 | When a member cancels a booking made **before** the Monday reset, how do refunds work? (CH4) | Cap the refund at the weekly allowance; refund into a bonus bucket that expires at week end; refund only if booked after the reset | **Cap at the weekly allowance** | 03 |
| D2 | What is an owner for? (R37) | Read-only totals only; roster and actions through functions (no direct health data); full read access like a coach | **Roster and admin actions, no direct health data** | 02, 08 |
| D3 | Who may read member health information? (CM7) | Every coach in the gym (forms, meal photos, notes); assigned coach plus a named cover coach; assigned coach only | **Gym coaches read forms, meal photos, injury notes; only the assigned coach reads chat, progress photos, scans.** State it in the privacy policy | 02, 10 |
| D4 | One exercise library for all gyms? (CM4) | Shared by the organisation; per gym | **Shared; seeded rows editable by gym admins only; authors edit their own** | 01, 02 |
| D5 | Class check-in window (R17, L6) | Today: 2 minutes before to 15 after (UI only) | **30 minutes before to 60 minutes after, enforced by the server** | 03, 07 |
| D6 | New members whose targets look risky (under 18, goal weight not below start, target under 1,200 kcal, health notes) (M8) | Show immediately (today); hold back until a coach confirms | **Hold back** ("your coach is setting up your plan") | 06 |
| D7 | Referral link and FAQ (R16) | Per-gym link and fixed FAQ; per-member link with credit; remove both | **Per-gym link (hidden if unset), FAQ built from live data** | 07, 08 |
| D8 | Plan and form set-up per gym (R35) | Your call: which plans, lengths, default intake form in each gym | Match Salford's set-up in Worsley | owner |
| D9 | Calories-only food entries (R11) | Estimate macros; store a day calorie total | **Store `daily_logs.calories`** | 06 |
| D10 | Keep the unused phone-push tables? (R39) | Keep; remove | **Keep, unused** | 09 |
| D11 | Scheduled broadcasts (CM1) | One daily run (up to a day late); upgrade Vercel for hourly runs | **Daily, with honest wording** (upgrade when you move to Pro) | 09 |
| D12 | Hosting (R8, R10) | Stay on Hobby and US; Pro plan plus London database | **Pro plan; London region before members grow** | 12 |
| D13 | Privacy, retention and data requests (H3) | Draft by you or a lawyer; export button | **Lawyer-reviewed policy; JSON "download my data"** | 10 |
| D14 | Editing a form that has answers (R3) | Update in place and archive removed questions; full versioning | **In place plus archive** | 04 |
| D15 | Deleting a session (CH2) | Keep deleting; retire it | **Retire (history kept, members refunded and told)** | 03, 04 |
| D16 | Gym model for coaches in two gyms (R38) | Remove "active gym" and show all gyms with a filter; keep it but scope member screens to the member's gym | **Keep; member screens use the member's gym; banner and write guard** | 05 |
| D17 | Public join link controls (M7) | Reusable link (today); per-link limits and expiry; closed sign-up | **Rate limits, per-link daily cap, email confirmation** | 10 |
| D18 | Minimum age (M8) | 10 (today); 16 | **16** | 06 |
| D19 | Coach notifications for member messages (R40) | Push with preview; push without text; email digest | **Push without message text, quiet 21:00 to 07:00, one per member per 5 minutes** | 09 |
| D20 | How far back can members edit (R14, FT1) | Unlimited (today); 14 days edit, 30 days browse | **14 days edit, 30 days browse** | 06 |

## 5. Things only you (or a lawyer) can supply

- **Privacy Policy and Terms text** (`content/legal/*.md` in brief 10). The data inventory in `docs/PRE_TESTING_CHECKLIST.md` section 5 lists what is collected and which companies handle it. Ask whether you must register with a data-protection regulator and have processor terms with Supabase, Vercel, Resend and Sentry (this is not legal advice).
- **FAQ and referral wording** (brief 07) and the **iPad splash artwork** approval (brief 10).
- **A sandbox Supabase project** for testing migrations and the sensitive checks (below).

## 6. Setting up the sandbox (once; needed for briefs 01 to 03)

1. Create a new, **empty** Supabase project (free plan is fine), in London. Note its project ref (the part before `.supabase.co`).
2. Apply `supabase/schema.sql`, then every file in `supabase/migrations/` in numeric order (SQL editor, or ask any chat to write a guarded helper script `scripts/apply-migrations.cjs` that runs them against a connection string you give it, refusing any project not in `AUDIT_ALLOWED_REFS`).
3. Create a few test logins (a coach, two members, an owner) in the sandbox and put them in `sandbox-credentials.local.txt` as the existing check scripts expect (`email / password` per line; keep that file out of git).
4. Run the existing checks: `AUDIT_ALLOWED_REFS=<sandbox ref> node supabase/tests/security-audit/rls-isolation-check.cjs --ref=<sandbox ref>` (and the others in that folder). They refuse to run against any project not listed. Never list the live project.
5. Point a copy of `.env.local` at the sandbox when you want a chat to verify screens in a browser.

## 7. Release plan (after the fixes)

1. **Branches:** one per brief; merge in the order of `00-README.md` (SQL briefs and 10 first; then 04, 06, 08, 09; then 05, 07; then 11 last).
2. **Before applying any migration to live:** back up (Supabase, Database, Backups); run the pre-flight queries in each migration's comments; apply to the **sandbox** and run the checks; then apply to live **one migration at a time in numeric order**. `0143` (drops the direct credit-ledger insert policy) goes **only after** brief 05 is merged and deployed.
3. **Deploy** (every push to `master` deploys): merge, wait for the Vercel build, then smoke-test as a member, a coach and an owner on the production address.
4. **Roll back:** keep the previous deployment (Vercel, Deployments, Promote); for SQL, each migration should have a reverse written in its header comment; restore from backup only for data loss.
5. **Re-run the audit proofs** (`docs/audit-proofs/member-api-proofs.mjs` as a seeded test member on the **sandbox**, and the R3, R4, R5 checks) after the fixes: each should now be refused or behave correctly.

## 8. Go-live gate (tick before real testing)

- [ ] Public sign-up is off; custom SMTP works; a reset email reaches a non-team address.
- [ ] `RESEND_FROM_EMAIL` and `VAPID_SUBJECT` set; a test broadcast email arrives in Gmail and Outlook, not spam.
- [ ] 219 test accounts and test content removed; Brad's active gym is Salford; Worsley and Salford plans and forms are set up.
- [ ] Briefs 01 to 04 and 10 merged and applied; R3, R4, R5, H1, H2, CM5 proofs now fail safely.
- [ ] Backups confirmed (and one restore tried); plan and region decided.
- [ ] Privacy policy and terms published and reachable when logged out.
- [ ] One iPhone and one Android run through the real-device script; push arrives for a coach reply and a coach gets a push for a member message.

## Status (after briefs 01 to 11)

Written 16 Oct 2026 on branch `fix/12-owner-tasks`, which contains everything: `master` plus briefs 08 to 11 plus one small fix for brief 12 itself (below). `master` is an ancestor of this branch, so merging it is a straight fast-forward. This replaces the earlier `## Status (after briefs 01 to 06)` that sits on the separate branch `fix/12-owner-checklist` (it is out of date: briefs 01 to 07 are now on `master`, and 08 to 11 are done). That branch can be deleted.

**Nothing in this section was done for you.** No dashboard setting was changed, no SQL was run, no account was created, nothing was pushed or deployed. `npm test` (118 files, 1,097 tests), `npx tsc --noEmit`, `npm run lint` (0 errors) and `npm run build` pass on this branch.

### The one thing I changed for this brief

**Task 1 (turn off public sign-up) used to break the join link.** The brief says "the app never uses sign-up", but brief 10's default join flow calls Supabase's public sign-up endpoint to get the confirmation email, and that endpoint is exactly what the switch turns off. Members using a coach's link would have got "We could not create your account" and nothing in the app would have said why. Fixed in `c6381cc`: when Supabase answers "sign-up is switched off", the link creates the login through the admin API instead (the old one-step flow), one Sentry warning is logged, and the rate limits and the daily cap per link still apply (`lib/joinFlow.ts` `isSignupDisabled`, `app/api/join/route.ts`, three new tests). **The cost:** with sign-up switched off, a new member is not asked to confirm their email (their address is trusted as typed). That is the pre-audit behaviour. Getting both (sign-up off **and** a confirmation email) means the app sending its own confirmation email through Resend; say so if you want that built. I could not test the fallback against a real Supabase project (no sandbox), only against a fake of its error; **try one join on a sandbox or a throwaway link after you switch sign-up off.**

### Where I stopped, and why

You asked for the migrations to be pushed and the code pushed live once this brief was done. I have **not** done either, for two reasons you should know about:

1. **I cannot apply SQL from here.** This machine has the app's keys (anon, service role, Resend, Vercel) but no database connection string, no Supabase access token and no `psql` or Supabase CLI. The service key can read and write rows but cannot run `create function` or `alter table`. The migrations have to be pasted into the Supabase SQL editor by you.
2. **The order matters.** Pushing to `master` deploys at once, and the new code calls things that only exist after migration `0142` (the owner team and report screens, "Reset link" on the sign-up link, the referral-link setters, the like-for-like owner figures). Until it is applied the owner roster and team actions show "We could not load this" and rotating a join link fails. `0139` and `0140` are safe to apply late (the app works without them, see their sections), but there is no reason to.

### Release order (what I would run, and what is left for each step)

You have been applying the earlier migrations yourself (the `0127`/`0134` fix on `master` says so), so I do not know which of `0127` to `0143` are already live. The three that are **new on this branch and not on `master`** are `0139`, `0140` and `0142`.

1. **Back up** (Supabase, Database, Backups) and confirm the plan has backups.
2. **Apply `0139`, `0140`, `0142` in the SQL editor, in that order.** Each is re-runnable and rejects nothing existing. If one stops with an error, expect the whole file to be rolled back, as `0127` was on live; send me the message. `0142` replaces `owner_gym_stats` and `owner_activity_report`, which already exist: if it complains about a changed return type, tell me the message rather than dropping anything. It depends on `0129`, `0131` and `0138` already being applied.
3. If any of `0127` to `0136`, `0141`, `0143` is **not** applied yet: apply it first, in numeric order, with `0143` always last (it drops the coach's direct write to the credit ledger and the code for it is already on `master`).
4. **Set the Vercel Production variables** (names only; never paste values into a chat): `RESEND_FROM_EMAIL` (a sender on a domain verified in Resend; **required in production now**, without it email is off and coaches are told), `UNSUBSCRIBE_SECRET` (a random string of 32 or more characters; do not change it later), `SUPPORT_EMAIL` or `VAPID_SUBJECT` (a business address; without one, push is off), and optionally `NEXT_PUBLIC_SITE_URL`. Leave `FEATURE_AI_PHOTO`, `JOIN_EMAIL_CONFIRMATION` and `CSP_ENFORCE` alone. Keep "Automatically expose System Environment Variables" on, and switch on **Skew Protection** (task in section 2).
5. **Merge and push:** `git checkout master`, `git merge --ff-only fix/12-owner-tasks`, `git push origin master`. Wait for the Vercel build. Say the word and I will do this step: it is two commands once step 2 is confirmed.
6. **Smoke-test on the production address** as a member, a coach and an owner: sign in, the Home screen, book and cancel a class, send a chat message, an owner Overview and Reports page, Settings > Gym (referral link, team).
7. **Check `job_runs`** the next morning: `select job, ran_at, ok, detail from job_runs order by ran_at desc limit 20;` (brief 09). Watch Sentry for "CSP would block" for about a week, then set `CSP_ENFORCE = true` in `next.config.ts` (brief 10).
8. **The two clean-up scripts** from briefs 02 and 06, each read first: `supabase/cleanup/0129_red_flag_entries_wrong_gym.sql` and `supabase/cleanup/0136_empty_food_days.sql`.

**A short window to know about** (carried over from the brief 03 status): between applying the earlier migrations and deploying the code that uses them, the old app meets the new rules. That is long past for `0127` to `0136`, which are on `master`.

### Section 1 tasks: where each stands

| # | Task | State |
|---|---|---|
| 1 | Turn off public sign-up | **Yours, and now safe to do** (see above). The join link keeps working. |
| 2 | Brad's active gym to Salford Quays | **Yours (a data setting).** Brief 05's banner tells a coach when their members are in another gym. |
| 3 | The three habits (answered forms, "Everyone at the gym", one conversation at a time) | **Fixed in code** (briefs 04 and 05, on `master`); keep them until the migrations are live. |
| 4 | Resend domain, `RESEND_FROM_EMAIL`, `VAPID_SUBJECT` | **Yours**, and now needed: see step 4 above. Also `UNSUBSCRIBE_SECRET`. |
| 5, 6 | Custom SMTP for Supabase Auth; Site URL and Redirect URLs | **Yours.** Add one more setting: **Auth, email, link expiry** as long as you are comfortable with (up to 24 hours); the set-password links for new members and coaches (brief 08) use it, and the default of one hour can run out. |
| 7 | Remove the 219 test accounts | **Yours.** **The guarded seeder will not do it on live any more:** brief 10's `--cleanup` refuses the live project on purpose, and it is meant for a sandbox. For live, use the Supabase Authentication dashboard or the SQL in section 3 (query 1 counts them; read the foreign keys or try it on a backup before deleting, as the rows they own are removed with them). Three scripts are still untracked on this machine (`scripts/seed-smoke-fleet.ts`, `seed-smoke-activity.ts`, `seed-walkthrough.ts`): they contain real coach addresses and gym ids, so decide whether to keep them local or clean them before they go into git. |
| 8, 9 | Test event and templates; Worsley plan; Salford default form | **Yours.** |
| 10 | Supabase plan, backups, region | **Yours** (D12: Pro plan and a London database before members grow). |

### Section 3 clean-up queries: updates

- **Query 5** (red-flag entries under the wrong gym): use `supabase/cleanup/0129_red_flag_entries_wrong_gym.sql` (brief 02).
- **Query 6** (empty food days): use `supabase/cleanup/0136_empty_food_days.sql` (brief 06).
- **Query 1** (the 219 test accounts): see task 7 above.
- **Queries 2 to 4:** unchanged. Nothing was run.

### Decisions in force (D1 to D20)

Defaults are used wherever you have not said otherwise. The ones that changed since the last status:

| ID | State |
|---|---|
| D5 check-in window | Server **and** screens (30 minutes before to 60 after), briefs 03 and 07. |
| D7 referral link and FAQ | **Implemented** (per-gym link, hidden when empty; FAQ from live data), brief 07; the admin field to set the link is in brief 08 (needs `0142`). **Set each gym's link** (Settings > Gym or the owner's gym page) or members see nothing. |
| D10 phone push tables | Kept, unused (comment in `lib/push.ts`), brief 09. |
| D11 scheduled broadcasts | Daily, with honest wording ("about 6 am UK time, tomorrow"), brief 09. Change the constant in `lib/communicationsSchedule.ts` if you move to hourly runs. |
| D13 privacy, retention, data requests | **Draft** policy and terms pages (`content/legal/*.md`, clearly marked "not legal advice") and a "Download my data" button, brief 10. **A lawyer-checked text is still yours to supply**, then change `status: draft` to `status: final`. |
| D17 join link controls | Implemented (5 attempts per address per hour, a daily cap per link, optional end date, email confirmation). With sign-up switched off in Supabase the confirmation step is skipped (see above). |
| D19 coach notifications | Implemented (no message text, quiet 21:00 to 07:00 gym time, one per member per 5 minutes), brief 09. Needs `VAPID_SUBJECT` or `SUPPORT_EMAIL`. |
| D2, D3, D6, D20 | As in the earlier status: D2 database and screens done (brief 08); D3 only part (forms, meal photos, scans and chat read rules should be checked against your choice before you write the privacy policy); D6 holds back **every** new member until a coach clears them (`targetsHeldBack` in `lib/onboarding.ts` if that is too many); D20 is in the screens only. |
| D8, D12 | Yours (gym set-up, hosting). |

### Owner steps that came out of briefs 07 to 11

- **Two-factor (R7):** switch on TOTP in Supabase Auth, then ask for the follow-up that adds the code step to the sign-in page and an enrolment card on `/owner/account` (brief 08 skipped it on purpose: a card without the sign-in step would look protective and do nothing).
- **Legal text:** see D13.
- **iPad splash artwork:** brief 10 did not add the missing sizes; it needs your approval of the look.
- **`middleware` to `proxy` rename:** the build warns it is deprecated; the redirects still work. A separate change.
- **A removed coach's scheduled broadcasts keep sending** under their name; cancel them by hand when a coach leaves (brief 05).
- **A coach switched off by the owner can keep working** until their current sign-in expires (up to an hour).
- **The fixed password that used to be in `seed-demo-fleet.ts`** is in git history: change or delete any real account that used it.
- **Screen readers:** run VoiceOver (iPhone) and TalkBack (Android) through login, booking a class and logging food, and list anything announced as just "button" (brief 11).
- **Look at the screens on a phone:** brief 11 made many controls 36 to 40 px tall; the Clients page, the Library filters and a member page changed most.

### Go-live gate (section 8): where it stands

| Gate | State |
|---|---|
| Sign-up off; SMTP works; a reset email reaches a non-team address | Yours. Not done. |
| `RESEND_FROM_EMAIL` and `VAPID_SUBJECT` set; a test broadcast arrives | Yours. Not done. |
| Test accounts and test content removed; Brad's gym; plans and forms | Yours. Not done. |
| Briefs 01 to 04 and 10 merged and applied; proofs fail safely | 01 to 07 are on `master`; `0139`, `0140`, `0142` still to apply. **The proofs have never been run** (no sandbox). |
| Backups confirmed and one restore tried; plan and region decided | Yours. Not done. |
| Privacy policy and terms published and reachable when logged out | Pages are reachable (draft text); your text is still needed. |
| iPhone and Android real-device run; push arrives | Yours. Not done. |

### What I would do next

1. Apply `0139`, `0140`, `0142` (steps 1 and 2) and tell me; I will fast-forward `master` and push (step 5).
2. Do tasks 1 and 4 to 6 in the dashboards, then one join on a throwaway link.
3. Create the sandbox (section 6) if you want the proofs run: it is the only thing that turns "reviewed" into "tested" for the SQL. Section 6 step 2 offers a guarded `scripts/apply-migrations.cjs`; it needs a Postgres driver (`pg`) added as a dev dependency, which needs your approval.

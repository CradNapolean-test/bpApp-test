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

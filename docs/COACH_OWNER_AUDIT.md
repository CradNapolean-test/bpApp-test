# Coach and owner side audit

Date: 2026-10-14 · Scope: the `/coach` and `/owner` apps, their API routes and cron jobs, and every database function and policy they depend on. Companion to [MEMBERS_APP_AUDIT.md](MEMBERS_APP_AUDIT.md); the second pass is [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md). Findings that already appear in the members report (for example H1 exercise library, H2 bookings) are not repeated in full.

Nothing in the codebase was changed. Every item is a finding with a proposed fix.

## How this was done

| Check | Result |
|---|---|
| Database functions | Extracted the **final** definition of all 91 SQL functions (later migrations replace earlier ones), flagged the 83 `SECURITY DEFINER` ones, and read ~45 of them in full: every function a coach, gym admin or owner can call, plus the credit and membership engine. The rest are internal (execute revoked from all roles) or trigger functions |
| NULL-safety scan | Searched every function body for permission checks that evaluate to NULL for the wrong caller (the bug class migration `0105` says it fixed) |
| Routes | Read all three coach/admin API routes and all seven cron routes; checked every `/coach/**` and `/owner` page for a role gate |
| Data layer | Read the coach dashboard, client list, gym admin, communications, memberships/credits, template import, red flags, owner, email and push code |
| Live check | Ran the dev server and, using the test **member** session, requested every coach page and the three coach APIs. Read-only |
| Round 2 | Every coach and owner screen was then read line by line, and the live Supabase and Vercel setup was checked read-only. New findings, corrections and what could not be tested live are in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md) (R3, R4, R5, R24 to R34 are coach and owner screens) |
| Not covered in this first pass | Coach and owner screens were never exercised in a browser (no coach or owner login could be created); round 2 did that. This project is the web app only; migrations 0108 to 0114 contain groundwork for a phone app that is not part of it |

## Summary

| ID | Severity | Finding |
|---|---|---|
| CH1 | High | No way to remove a coach, deactivate their login, or reassign their members |
| CH2 | High | Deleting a session wipes all its bookings and attendance history, with no refund and no notice |
| CH3 | High | "Ask all my clients to confirm details" locks every member out of the app, with no skip and no sign-out |
| CH4 | High | Weekly credit reset plus refunds can leave members above their plan's allowance |
| CM1 | Medium | Failed broadcast emails are recorded as sent; no unsubscribe; scheduled sends can be ~a day late |
| CM2 | Medium | Account creation routes: partial failures, lost passwords, shared plain-text passwords, cross-gym email lookup |
| CM3 | Medium | Coach functions missing checks the member versions got (NULL-unsafe rollout check, coach booking skips validation) |
| CM4 | Medium | The exercise library is writable by every coach in every gym |
| CM5 | Medium | Any logged-in user can upload to the public `coach-branding` bucket, with no limits |
| CM6 | Medium | Coach dashboard and birthdays job have hard 1,000-row ceilings |
| CM7 | Medium | Gym-wide access to member health data is broad, inconsistent and undisclosed |
| CM8 | Medium | Seed and stress scripts: known passwords in git, no guard against running on the live project |
| CM9 | Medium | Coach credit tools have no cap, and a check-then-write race |
| CL1–CL10 | Low | See the Low section |

---

## High

### CH1. A coach cannot be removed, and their members cannot be moved

- **What:** there is no function, policy or screen to remove a coach from a gym, deactivate their login, or reassign a member to another coach. I searched the migrations, `lib/data/gym.ts` and every script: the gym roster (`GymAdminSection.tsx`) only offers "Make admin" and "Add coach". `coach_gym_memberships` has select policies only, and `profiles` has no update policy, so `coach_id` cannot be changed from the app.
- **Impact:**
  - A coach who leaves keeps their login, keeps gym-wide read access to every member's food photos, health forms, habits and private coach notes (see CM7), and keeps full access to their own members' chat, progress photos and body scans.
  - Their members stay assigned to them. Chat, scans and progress photos are visible only to the assigned coach (`owns_client`), so nobody else, including gym admins and the owner, can pick those members up.
  - Only an operator with SQL access can fix this.
- **Fix:**
  1. `reassign_clients(p_from, p_to)` (gym admin only, both coaches in the caller's gym).
  2. `remove_coach_from_gym(p_coach_id)` (gym admin only; refuse while they still have members in this gym).
  3. Disable the Auth login when a coach has no gyms left (`auth.admin.updateUserById(id, { ban_duration: '876000h' })` from a route).
  4. Show both on the gym roster.

### CH2. Deleting a session destroys booking and attendance history

- **Where:** `lib/data/classes.ts:63` `deleteClass` runs a plain `delete` on `classes`; `bookings.class_id` is `ON DELETE CASCADE` (`schema.sql:123`); the button is in `TimetableView.tsx:236-245`.
- **What:** one click removes the session and **every booking ever made for it**: upcoming, past, attended. The confirm text says bookings are removed and it cannot be undone, but it does not say:
  - credits already spent on upcoming bookings are **not refunded** (the ledger rows stay; `booking_id` is set to null);
  - members get **no notification**;
  - members' "sessions done" and club progress (100/250/500) drop, because they are counted from attended bookings;
  - the coach and owner attendance reports lose that history.
- **Related:** editing a weekly session's day or time (`updateClass`) leaves existing future bookings in place with their old dates and no notice to members.
- **Fix:** replace delete with "retire" (an `archived_at` / end date; hide from the timetable, keep history). For future dates use the existing `cancel_class_occurrence`, which refunds and notifies. Make `bookings.class_id` `ON DELETE RESTRICT`.

### CH3. One button can lock every member out of the app

- **Where:** `lib/data/onboarding.ts:234-263` (`requestDetailsUpdate`, `requestDetailsUpdateForAll`) sets `onboarding_completed_at = null`; `app/dashboard/page.tsx:28` then renders only the onboarding flow; `JoinLinkCard.tsx` has the "Ask all my clients to confirm details" button behind a single confirm dialog.
- **What:** until a member finishes the form they cannot reach Home, booking, chat, food or training. `OnboardingFlow.tsx` has no skip, no "later" and no sign-out (searched; the only "later" text is on the final install screen). A member who cannot finish it (a server error, a missing date of birth, no time) is stuck, as is a member who signed into the wrong account.
- **Impact:** a coach tapping this before a busy morning blocks every one of their members from booking or logging until each completes it.
- **Fix:** show it as a dismissible prompt or banner instead of replacing the app, or add "Remind me later" and a sign-out link; make the confirm dialog say members will be blocked; consider a separate `details_confirmed_at` flag instead of reusing `onboarding_completed_at`.

### CH4. Credits can end up above the plan's weekly allowance

- **Where:** `replenish_due_memberships` / `top_up_membership_credits` (`0088`) set the `membership` bucket to exactly `credits_per_week` every week (`v_per_week - v_balance`). `cancel_booking`, `cancel_class_occurrence` and `coach_cancel_booking` (all `0105`) refund each deduction back into its original bucket with no reference to the reset.
- **Scenario:** a member on 3 credits a week books next week's session on Friday (3 to 2). Monday's reset sets the balance back to 3 and the Friday spend is wiped. On Tuesday they cancel before the cut-off and are refunded +1: 4 credits against a plan of 3. They can repeat this every week, so each "book ahead, then cancel after the reset" gains one credit.
- **Caveat:** whether credits are meant to count by booking week or by class week is a business decision, so confirm intent before changing anything. The effect is real either way.
- **Measure it:**
  ```sql
  select b.client_id, b.balance, p.credits_per_week
  from credits_balance_by_bucket b
  join client_memberships m on m.client_id = b.client_id and m.ended_at is null
  join membership_packages p on p.id = m.package_id
  where b.bucket = 'membership' and b.balance > p.credits_per_week;
  ```
- **Fix options:** refund only deductions made since the current reset week (`credits_ledger.created_at >= last_reset_week`); or refund into the `bonus` bucket with an expiry at the end of the week; or cap the membership bucket at `credits_per_week` on refund.

---

## Medium

### CM1. Broadcast email reliability and compliance

- **Marked sent when it failed.** `composeCommunication` (`lib/data/communications.ts:58`) and the cron (`app/api/cron/send-communications/route.ts:65`) stamp `email_sent_at` whenever the key is configured, even when `sendPersonalisedEmails` sent 0 (`lib/email.ts:50-66` swallows each batch error). A Resend outage or a bad `RESEND_FROM_EMAIL` domain means the coach is told it went and it never will. Only stamp when `sent > 0`, and report partial results.
- **No unsubscribe.** Broadcast emails carry no `List-Unsubscribe` header or link; the only opt-out is a toggle inside the app. Promotional broadcasts to customers generally need one (NZ Unsolicited Electronic Messages Act / UK PECR; not legal advice).
- **Default sender.** Without `RESEND_FROM_EMAIL` the sender is Resend's sandbox address, which only delivers to the Resend account owner.
- **Scheduled time is approximate.** Scheduled and repeating broadcasts only go out when the cron runs, once a day at 05:00 UTC (`vercel.json`). A message set for 9:00 goes at the next 05:00 UTC run, which can be up to ~21 hours late. I found no wording about this in `BroadcastsPane.tsx`. Show the real send time, or run the job more often (your own migration notes say the project is on Vercel's Hobby plan, which limits cron to once a day and is meant for non-commercial use).
- **Long messages fail whole.** `chat_messages.text` is limited to 4,000 characters (`0108`), but a broadcast is not length-checked; a 5,000-character message to a gym fails the entire `create_communication` call with a database error.

### CM2. Creating coaches and members

`app/api/coach/create-client/route.ts`, `app/api/coach/import-clients/route.ts`, `app/api/gym/create-coach/route.ts`. Role checks on all three are correct (verified live: a member gets 403 on each).

- **Orphan logins.** If the profile insert fails after the Auth user is created, nothing deletes the login (`/api/join` does clean up; these do not). The retry then fails with "already registered".
- **Import can time out and lose passwords.** `import-clients` creates up to 200 accounts one at a time inside one request and returns all generated passwords at the end. If the function times out partway, those accounts exist and their passwords are gone. Process in batches of ~20, return progress per batch.
- **Email handling.** `create-client` does not validate or lower-case the email; `import-clients` only checks it contains `@`; `create-coach` looks up `profiles.email` with an exact-case match.
- **Cross-gym lookup.** Any coach gets the raw Auth error ("already registered") for an email that exists anywhere on the platform, and a gym admin adding a coach learns whether any email is a client or a coach at any gym ("That email belongs to a client account"). Return one neutral message.
- **Passwords.** Initial passwords are random but are shared as plain text (copy-and-paste message) and never expire; there is no forced change at first login. An invite or reset-link email is safer.
- **Adding a coach by email attaches them to your gym** without that coach or their own gym being asked (`add_coach_to_gym`). Probably intended for multi-gym coaches, but it is silent.

### CM3. Coach functions that skip checks the member versions have

- `apply_programme_rollout` (`0094:` `if auth.uid() is not null and v_r.gym_id <> public.my_gym_id()`): for a **member** caller `my_gym_id()` is NULL, so the comparison is NULL and the check passes. The caller needs a rollout's UUID (members cannot list them), so it is hard to use, but it is exactly the NULL bug class `0105` set out to fix. Use `is distinct from` and require `my_gym_id() is not null` when `auth.uid()` is set.
- `book_class_for_client` (`0062`): when a coach books a member in, it does not check that the class belongs to the member's gym, that the date is not in the past, that the class runs that weekday, or that the session was not cancelled. Migration `0107` added all four to the member version and explicitly left this one alone. A coach-side typo can book a nonexistent session and spend a credit.
- `assign_membership` and `start_membership` do not check that the package belongs to the coach's gym.
- `cancel_class_occurrence` only writes an in-app notification; no push or email goes out for a cancelled session, which is the most time-critical message a gym sends. It also allows cancelling a past date, which would refund and cancel attended bookings.
- `set_gym_name` accepts a blank or huge name; `set_default_checkin_reminder_days` has no upper bound; the last-admin guard exists only in the UI (`GymAdminSection.tsx:157`), not in `set_gym_admin`.

### CM4. The exercise library is shared by every gym and writable by every coach

- `exercise_library` has no `gym_id`. Any coach at any gym can rename, change the video link of, or delete (when unused) an exercise that another gym's programmes use. This is on top of the member write access in H1.
- If the product is meant to host several independent gyms, give the library a `gym_id` (or organisation) and scope the policy and `getExerciseLibrary` to it. If the gyms are one organisation sharing a library on purpose, scope it to the organisation.

### CM5. Public `coach-branding` bucket

- `0047_coach_branding.sql`: the bucket is public and the upload policy checks only that the first folder equals `auth.uid()`, not the role. Any logged-in member can upload files to it. The bucket has no size or file-type limit (the limits added in `0108`/`0109`/`0114` skip it). `uploadCoachLogo` also builds the object name from the file's extension and never deletes old logos.
- **Fix:** restrict the policies to coaches, set a small size limit and an image-only MIME list, delete the previous logo on replace.

### CM6. Hard ceilings and unbounded growth on coach screens

- `lib/data/coachDashboard.ts:217` caps the member query at 1,000 members; in whole-gym scope the 1,001st member and beyond silently never appear in any dashboard list or count. The same query pulls every membership, every form assignment and every Big Dog result for every member, all time. The dashboard, client list (`getMyClients`, `searchGymClients`) and chat overview load everything in one go with no pagination.
- `app/api/cron/birthdays/route.ts` loads every `client_profiles` row with a date of birth in one query; Supabase's default 1,000-row response cap means members past row 1,000 never get a birthday email or push, silently.
- `lib/data/redFlags.ts:41,61` (`getActiveHold`, `getActiveHoldClientIds`) work out "today" in UTC rather than the gym's timezone, so a hold starting today is wrong for part of every day (up to 13 hours for Auckland). The owner stats functions use `current_date` (database time, UTC) for "this month" and "this week".

### CM7. Gym-wide access to member data is broad, inconsistent and undisclosed

- Migration `0053` lets **every coach in the gym** read every member's food diary, **meal photos**, **health questionnaire responses** (`form_responses`), habits, recipes, workout programmes, big-dog results and the coach-only **private notes** table (`0124`, `client_coach_notes`). The owner role gets the same access through `is_same_gym_as_client()`.
- But chat, progress photos and body scans are restricted to the assigned coach. So the rules are inconsistent: meal photos are open to the whole gym while progress photos are not.
- The privacy policy is a placeholder (members H3), so members are not told who can see what. If coaches covering for each other is the intent, state it; if not, narrow `form_responses` and meal photos to the assigned coach plus an explicit cover arrangement.
- Related: any coach can export the whole gym's client names and emails to CSV (`ClientTable.tsx:154`) with no audit trail. **Correction (round 2):** I first wrote here that the export blocks spreadsheet formulas. It does not: `ClientTable.tsx` uses `lib/utils/csv.ts`, which has no protection (only `lib/csv.ts` does). See R24 in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md).

### CM8. Seed and stress scripts

- `scripts/seed-demo-fleet.ts` (tracked in git), `seed-smoke-fleet.ts` and `seed-walkthrough.ts` create real Auth users with fixed passwords written in the source (a different fixed password in each script; not repeated here). `stress-test.ts` creates users, books classes and moves credits. None has a guard against running on the live project, unlike `supabase/tests/security-audit/_safety.cjs`.
- If `.env.local` ever points at the live project when one of these runs, accounts with known passwords exist there. Your notes say the dev database is shared with real owner content.
- **Fix:** add the same project-ref allowlist guard to every script that writes; generate passwords at run time; search the live `auth.users` for the emails these scripts create.

### CM9. Credit tools

- `grantCredits` and `grantCreditPack` (`lib/data/classes.ts:170`, `memberships.ts:140`) insert straight into the ledger: any amount, positive or negative, no cap and no confirmation (a typed 1000 instead of 10 is accepted). The grant is attributed to the coach, which is a good audit trail, but nothing alerts the owner to large grants.
- `removeCredits` (`memberships.ts:216`) reads the balance, then inserts; two coaches acting together can both pass the check.
- The weekly reset overwrites any manually added `membership`-bucket credit (CH4).

---

## Low

- **CL1.** `owner_gym_stats`, `getOwnerGymStats` and `getOwnerActivityReport` return `null` on any error (`lib/data/owner.ts`), so a failing owner report looks empty rather than broken.
- **CL2.** `assign_education_content` and `mark_education_complete` were not in the `0105` revoke list, so `anon` can still execute them (they fail their own checks). `client_gym_id(uuid)` is callable by any logged-in user and returns the gym of any member UUID.
- **CL3.** `importProgramTemplate` is not atomic: it inserts the template, then each day and exercise one request at a time, and a failure partway leaves a half-built template. It does whitelist every field, which is good.
- **CL4.** `updateRedFlagEntry` accepts any `coach_id`; `startHold` does not stop overlapping holds.
- **CL5.** `coachDashboard.ts:198-199` defines `lastWeek` and `prevWeek` identically, which reads like a bug even though the values are used consistently.
- **CL6.** Initial member and coach passwords are returned in the API response and shown on screen; fine for one-time hand-off, but there is no way to resend or reset from the coach side other than the member using "Forgot password".
- **CL7.** Gym admin demotion and promotion have no audit trail; coach credit grants do (`granted_by`).
- **CL8.** Coach pages return HTTP 200 and redirect on the client (Next streams the loading skeleton first). Verified: no member data is in those responses, so this is cosmetic, but a scanner will see 200s.
- **CL9.** `set_logo_path` accepts any path string (it only affects the caller's own profile).
- **CL10.** Owner role has no write functions, so owners cannot fix anything they see (add a coach, reassign a member) without a coach admin. Confirmed in use, and widened (no member data on screen, no password or settings page): see R37 in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md).

---

## Checked and sound

- **Role gates.** Every `/coach/**` page checks `role = 'coach'` (the six without a check are pure redirects), `/owner` checks `role = 'owner'`, and the three account-creation APIs return 403 to non-coaches. **Verified live** with a member session: every coach page's response body contains only a redirect marker to `/dashboard` and no member data, and the three POST routes return 403.
- **Coach functions check who is calling.** The member-affecting functions (`start_membership`, `end_membership`, `assign_form`, `assign_education_course`, `instantiate_program_template`, `set_checkin_reminder_days`, `set_client_admin_details`, `set_nutrition_tracking_mode`, `clear_scheduled_end`) all require `is_coach_of(client)`; gym-wide actions (`mark_attendance*`, `coach_cancel_booking`, `cancel_class_occurrence`, `restore_class_occurrence`, `duplicate_program_template`) check the caller's gym; admin actions (`add_coach_to_gym`, `set_gym_admin`, `set_gym_name`, `set_gym_booking_settings`) require `is_gym_admin`.
- **Owner functions** (`owner_gyms_overview`, `owner_gym_stats`, `owner_activity_report`) require `is_owner()` and are limited to the owner's own organisation; the activity report also validates the requested gym belongs to it.
- **Internal functions are locked down.** The functions with no auth check in their body (credit top-up, clear, expiry, cron jobs, communication helpers) have execute revoked from every role; the rest of that list are trigger functions.
- **Switching gyms** (`switch_active_gym`) verifies membership; `set_gym_admin` updates both the membership and the cached flag; the booking-rules form confirms before a timezone change and the function validates the timezone name.
- **Broadcasts** validate the audience (a group must belong to the caller's gym), respect each member's email opt-out and escape HTML. (Round 2 correction: the CSV exports are **not** all protected against spreadsheet formulas; see R24 in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md).)
- **Template import** whitelists every field. Course copy to another gym requires membership in the target gym.
- **Credit engine** is idempotent per week (`last_reset_week`), refunds are tied to the booking that was charged and are not duplicated (a second cancel returns early), and `removeCredits` stops at zero and caps one call at 50.
- **No new XSS sinks** and every external link has `rel="noopener"`.

---

## Please verify (cannot be seen from the code)

1. **CH4:** run the SQL above; any rows are members currently over their allowance.
2. **CH1:** `select p.email, g.name, m.is_gym_admin from coach_gym_memberships m join profiles p on p.id = m.coach_id join gyms g on g.id = m.gym_id;` and check for anyone who has left.
3. **CM8:** search `auth.users` for the emails the seed and stress scripts create, on the live project.
4. **CM1:** confirm `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` are set in production, and the Vercel plan.
5. **CM6:** how many members the gym has now (the 1,000 ceiling).
6. **CM7:** whether gym-wide coach read of food photos and forms is what you want.
7. Whether anything other than this web app (a script, or any other app) writes directly to `bookings`, `exercise_library` or `client_profiles` before changing policies (H1, H2, CM4).

## Suggested order

1. **One database migration (low risk):** the H1/H2 fixes from the members report, `coach-branding` policies (CM5), the NULL-safe `apply_programme_rollout` and coach-booking validation (CM3), `bookings.class_id` to `RESTRICT` (CH2).
2. **Before anyone leaves or the gym grows:** CH1 (remove, deactivate, reassign), CH3 (make "confirm details" non-blocking), CH2 (retire instead of delete).
3. **Money:** CH4 (confirm intent, then fix the refund rule), CM9.
4. **Messaging:** CM1.
5. **Scale and privacy:** CM6, CM7, then CM2, CM4 and CM8.

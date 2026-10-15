# Brief 02: Database: gym scoping and permissions (SQL only)

**Goal:** make every gym-related database rule use the **member's own gym**, not the coach's currently "active" gym, and add the missing permission checks and admin functions. All changes are **new migrations**. App changes that use these functions are in briefs 05 and 08.

**Migration numbers reserved:** `0129` (red flags and reports), `0130` (scoping and permission checks), `0131` (owner and admin functions).
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (R36, R38, R37, R28), `docs/COACH_OWNER_AUDIT.md` (CM3, CM4, CH1, CL4, CM6).

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project. You write migrations and tests; the owner applies them. Test only against a throwaway sandbox project, using the guard in `supabase/tests/security-audit/_safety.cjs` (`--ref` must be in `AUDIT_ALLOWED_REFS`). If no sandbox exists, write the checks and say they have not been run.
3. Never edit an existing migration. New files only, idempotent. New `security definer` functions: `set search_path = public`, NULL-safe checks (`is distinct from`, `coalesce`), then `revoke execute ... from public, anon` and grant to `authenticated` only, as `0105` does.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass. Test data must be fictional.
5. Stay inside this brief's files. No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (see `12-owner-tasks-and-decisions.md`), implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file (ID, done/partly/skipped, commit, what the owner must check).

## Background you need

- A coach has an **active gym** stored on `profiles.gym_id` (set by `switch_active_gym`); `my_gym_id()` returns it for role `coach` and NULL for everyone else (`0052_gyms.sql:55`).
- A **client's** own gym is `profiles.gym_id` too, read by `client_gym_id(client)` (`0056_coach_gym_memberships.sql:58`: `select gym_id from profiles where id = target_client_id and role = 'client'`).
- A coach can work in several gyms (`coach_gym_memberships`). Plans (`membership_packages`), classes, forms, templates, events, groups and red flags are per gym.
- **The live problem:** Brad works in both gyms, his active gym is Worsley, and all 90 of his members are in Salford. Every query that resolves "my gym" through the coach shows wrong or empty data. See R38.

## Migration 0129: red flags and reports

### R36. Red flags are filed under the coach's active gym (Medium)
- **Where:** `red_flag_week_stats` in `0098_red_flag_report.sql` (about line 126): `where c.role = 'client' and exists (select 1 from profiles coach where coach.id = c.coach_id and coach.gym_id = p_gym)`. That is the **coach's** active gym, not the member's. `generate_red_flag_week(p_gym, ...)` and `red_flag_report(p_week_start)` (which uses `v_gym := public.my_gym_id()`) write entries under whichever gym the viewing coach has active.
- **Live evidence (read-only):** Worsley has no members but shows 38 flagged for the week of 5 Oct; Salford has 76; the owner "All gyms" total is 114 for 76 distinct members (Brad's 38 members are filed under both). `red_flag_entries` has 187 rows, entries for the week of 5 Oct filed under Worsley: 38.
- **Change:**
  1. In `red_flag_week_stats`, select members by their own gym: `and public.client_gym_id(c.id) is not distinct from p_gym`.
  2. Give `red_flag_report` an optional `p_gym uuid default null`: when null use `my_gym_id()`; when given, require the caller to be a coach with a `coach_gym_memberships` row for that gym (or an owner of it via `is_owner_of_gym`), else raise 'Not authorized'. This lets a coach look at the other gym without switching.
  3. `generate_red_flag_week` stays internal (execute revoked); make it refuse a gym the caller is not allowed to see, as above.
  4. **Clean-up (separate, reviewed by the owner):** a commented script (not auto-run) that lists, then deletes, `red_flag_entries` whose `gym_id` differs from `client_gym_id(client_id)`, but **only** rows with no coach input (check the columns: contacted flag, reason, tier, follow-up coach). Rows with input must be listed for manual review. Provide the count queries first.
- **CL4 (same area):** `updateRedFlagEntry` (`lib/data/redFlags.ts`) accepts any `coach_id`. Add a check in the function or a trigger that the chosen coach belongs to the entry's gym (`coach_gym_memberships`). Also stop overlapping holds: add an exclusion or a check in `startHold`'s database path so two holds for one member cannot overlap.
- **Check:** with a coach whose active gym is A viewing gym B via `p_gym`, entries are only created for gym-B members; no entries appear for gym A.

### RF1. Merely viewing the Red Flags tab writes records (Low-Medium)
- **Where:** `red_flag_report` (`0098`, about line 226) calls `generate_red_flag_week(v_gym, p_week_start)` for whatever week is viewed; stepping back week by week creates entries for old weeks computed from **today's** membership and hold state, not history. The newest entry in the live table was created by a coach opening the tab, not by the 06:00 UTC job.
- **Change:** `red_flag_report` becomes read-only: it returns stored entries, and for a week with no stored entries returns a flag the screen uses to say "not generated". Only the daily job (`/api/cron/red-flags`) and the most recent completed week may generate. Keep a way for a gym admin to generate the **latest** completed week on demand (a separate function, rate-limited).
- **Check:** opening any week as a coach inserts no rows (count `red_flag_entries` before and after).

### CM6 (SQL part). Owner stats use UTC dates (Medium)
- `owner_gym_stats`, `owner_gyms_overview`, `owner_activity_report` (`0104`, `0120`) use `current_date` (database time) for "this month" and "this week". Use each gym's timezone: `(now() at time zone g.timezone)::date`. Add a test with a gym on `Pacific/Auckland` near midnight UTC.

## Migration 0130: scoping and permission checks

### R38 (database half). Plans, forms and classes from the wrong gym are accepted (High)
- **Where and what:**
  - `start_membership` (`0088_membership_panel.sql:62`) checks `is_coach_of(p_client_id)` but not that `p_package_id` belongs to the member's gym. Confirmed live: a Worsley plan was offered for a Salford member. Same for `assign_membership` if it exists (grep).
  - `assign_form` accepted a Worsley form for a Salford member (confirmed live on 15 Oct). Check `assign_education_course`, `instantiate_program_template`, `apply_programme_rollout` and any `assign_*` function the same way.
  - `book_class_for_client` (`0062_coach_book_class.sql`) does not check that the class belongs to the member's gym, that the date is not in the past, that the class runs that weekday, or that the session is not cancelled. Migration `0107` added all four to the member version `book_class` and explicitly left this one. Copy those checks.
  - Plans are only readable by the coach's **active** gym (`membership_packages` policy "gym reads membership_packages", `0054`), so a coach whose active gym is A sees "No plan" for members whose plan belongs to gym B.
- **Change:**
  1. Add a helper `public.same_gym_as_client(p_gym uuid, p_client uuid) returns boolean` (`is not distinct from public.client_gym_id(p_client)`), and use it to raise `'That belongs to a different gym.'` in every function above when the object's `gym_id` differs from the member's gym.
  2. Add a SELECT policy so a coach can read the plan rows that **their own clients' memberships** point at (`using (exists (select 1 from client_memberships m where m.package_id = membership_packages.id and public.is_coach_of(m.client_id)))`). Do the same for any other lookup table the coach views show as blank for the same reason; check `classes`, `form_templates`, `gym_events` by reading the screens listed in `AUDIT_ROUND_2.md` R38.
  3. Copy the four validations into `book_class_for_client`.
- **Check:** coach with active gym A: assigning a gym-B plan or form to a gym-A member (and the reverse) is refused; reading their own members' plan names works from either active gym.

### CM3. Coach functions that skip checks (Medium)
- `apply_programme_rollout` (`0094`): `if auth.uid() is not null and v_r.gym_id <> public.my_gym_id()`; for a member caller `my_gym_id()` is NULL, so the comparison is NULL and the check passes. Use `is distinct from` and require `my_gym_id() is not null` when `auth.uid()` is set. (A member would need a rollout UUID; still the NULL bug class `0105` set out to remove.)
- `cancel_class_occurrence`: refuse a past date (it would refund and cancel attended bookings).
- `set_gym_name`: reject blank or longer than 80 characters. `set_default_checkin_reminder_days`: bound 0 to 60.
- `set_logo_path` (CL9): accept only a path whose first folder is the caller's id.
- `cancel_class_occurrence` only writes an in-app notification; the push is brief 09.

### CM4. The exercise library has no owner and no gym scope (Medium, DECISION D4)
- **Default (D4):** keep one library shared by the organisation, but control who can change what: rows with `created_by = auth.uid()` are editable by their author; rows with `created_by is null` (the 474 seeded ones) are editable only by a **gym admin** (`profiles.is_gym_admin`). Replace the policy brief 01 creates with this rule (coordinate: brief 01 makes it coach-only first; yours refines it). Also add an `is_active boolean default true` so unused rows can be retired instead of deleted (the FK from `workout_exercises.exercise_library_id` is `NO ACTION`, so deleting a used exercise already fails).
- If the owner later wants per-gym libraries, add `gym_id` and scope the policy; not now.

### GA1. The last admin can be demoted (Low-Medium)
- `set_gym_admin` (`0056_coach_gym_memberships.sql:96`): add a check inside the function: refuse when the change would leave the gym with zero admins in `coach_gym_memberships`. Do it under a lock on the gym row so two admins cannot demote each other at once.

## Migration 0131: owner and admin functions

### CH1 (database half). No way to move members or remove a coach (High)
- **Where:** nothing exists. `coach_gym_memberships` has select policies only; `profiles` has no update policy, so `coach_id` cannot change from the app.
- **Add (all `security definer`, callable by a gym admin of that gym **or** an owner of its organisation):**
  1. `reassign_clients(p_gym uuid, p_from uuid, p_to uuid)`: move every client of `p_from` in that gym to `p_to` (both must be coaches in that gym). Find every table that stores the coach of a member (`grep -n "coach_id" supabase/migrations/*.sql`: for example red flag entries, scheduled communications, groups) and decide per table whether it moves with the member; document the choice. Notes written by the old coach (`client_journal_entries`) keep their author but must stay readable (see below).
  2. `remove_coach_from_gym(p_gym uuid, p_coach uuid)`: refuse while the coach still has clients in that gym; otherwise delete the membership; if the coach has no gym left, set a flag the app uses to disable the login (`profiles.deactivated_at timestamptz`). Disabling the Auth login itself is brief 08 (needs the admin API).
  3. Make `client_journal_entries` (goals, injuries, notes) readable by every coach of the member's gym (today only the author reads them, so injury notes are stranded when a coach leaves). DECISION D3 is the wider question of who reads what; default: coaches in the member's gym can **read** journal entries, only the author can edit or delete.
- **Check:** admin reassigns 3 test clients; the old coach loses access to their chat, the new coach gains it; removing a coach who still has clients is refused.

### R37 (database half). The owner can read far more than any screen uses (Medium, DECISION D2)
- **Where:** `0103_owner_foundation.sql`: owner SELECT policies on `profiles`, `coach_gym_memberships` (`:73`, `:76`) and `is_same_gym_as_client()` (`:56-65`) which also returns true for the owner, so an owner can read through the API every member's food diary, meal photos, health forms, habits, programmes and the private coach notes table.
- **Default (D2):** the owner works through **security definer functions only** (like `owner_gym_stats` today) and has no direct table access to health data.
  1. Change `is_same_gym_as_client` back to the coach-only meaning (remove the `or public.is_owner_of_gym(...)` clause), keeping a second function if any table truly needs the owner.
  2. Keep owner SELECT on `profiles` (non-health columns are fine) and `coach_gym_memberships`.
  3. Add owner functions, each checking `is_owner_of_gym(p_gym)`: `owner_gym_roster(p_gym)` (member name, coach, plan, last active, status: **no** health fields), `owner_set_gym_admin(p_gym, p_coach, p_is_admin)`, `owner_add_coach_to_gym`, `owner_remove_coach_from_gym`, `owner_reassign_clients`, `owner_rename_gym`, `owner_set_gym_booking_settings`. These call the same internals as the admin versions. Brief 08 builds the screens.
- **Check:** as an owner, `select * from food_diary_entries`, `form_responses`, `client_coach_notes` return 0 rows; the existing owner Overview and Reports still work; the new functions work for gyms in the owner's organisation and are refused for any other.

## Definition of done

- Three migration files; pre-flight and clean-up queries written as comments or separate `.sql` files; sandbox check scripts added for R36, R38, CM3, GA1, CH1 and R37; all `security definer` functions revoked from `anon`.
- `## Status` lists each ID, the functions added (name and arguments) so briefs 05 and 08 can call them, and the live clean-up queries the owner must review.

## Status

Branch `fix/02-gym-scoping` (cut from `fix/01-database-security`, so it builds on 0127 and 0128), 9 commits plus this status commit, nothing pushed. Three migrations: `0129_red_flags_and_reports.sql`, `0130_gym_scoping_and_permission_checks.sql`, `0131_owner_and_admin_functions.sql`, and one reviewed script that is **not** a migration: `supabase/cleanup/0129_red_flag_entries_wrong_gym.sql`.

**Not run anywhere yet.** There is no sandbox project and no Postgres on this machine, so none of the SQL has been executed and `gym-scoping-check.cjs` has never been run. What did run: `npm test` (226 pass; 32 new static tests in `supabase/tests/migration-scoping.test.ts` that replay the SQL and fail without these migrations), `npx tsc --noEmit` (clean), `npm run lint` (0 errors, the same 9 warnings as before). The first real test is applying the three files to the sandbox and running `gym-scoping-check.cjs` (needs `--ref=<sandbox ref>` in `AUDIT_ALLOWED_REFS`).

### Findings

| ID | Result | Commit | Notes |
|---|---|---|---|
| R36 | done | `ae6669a` | Members selected by `client_gym_id`. Clean-up script `53df6fc` (not run). |
| RF1 | done | `ae6669a` | `red_flag_report` only reads; new `red_flag_week_runs` table; `generate_latest_red_flag_week`. |
| CL4 | done | `ae6669a` | Trigger on `red_flag_entries` (coach must work at the gym) and on `membership_holds` (no overlap; a trigger, not an exclusion constraint, so existing overlaps do not block the migration). |
| CM6 | done (SQL) | `ae6669a` | `owner_gym_stats` and `owner_activity_report` use the gym's calendar. Test: `local_date` near midnight UTC for Auckland and London in the sandbox script. |
| R38 | done (database half) | `460dda1` | Beyond the brief: `communication_recipients` and `my_scoping_gym_id` had the same bug and are fixed. |
| CM3 | done | `8f60114` | `apply_programme_rollout` also picks members by their own gym (brief 03 R5 can skip that part). |
| CM4 | done (D4 default) | `5ac3c46` | Replaces brief 01's single coach-only rule; brief 01's static test updated. |
| GA1 | done | `a496721` | |
| CH1 | done (database half) | `d2cf31b` | |
| R37 | done (database half, D2 default) | `cd5a94f` | |
| Checks | added, not run | `634c6b6` | |

### Functions for briefs 05 and 08 (name and arguments)

All signed-in only, `security definer`, `set search_path = public`; names starting with an underscore are internal and cannot be called by anyone.

| Function | Who | Returns |
|---|---|---|
| `red_flag_report(p_week_start date, p_gym uuid default null)` | coach at the gym, or the gym's owner | jsonb: `gym_id`, `week_start`, **`generated`**, `generated_at`, `latest_completed_week`, `thresholds`, `stats`, `entries`, `master`. For a week that was never generated `generated` is false and `stats` and `entries` are empty. **The old one-argument version is dropped**; `{p_week_start}` alone still works |
| `generate_latest_red_flag_week(p_gym uuid default null)` | gym admin or owner | jsonb `{gym_id, week_start, created}`; refuses a second call within 10 minutes ("This list was generated a moment ago...") |
| `reassign_clients(p_gym, p_from, p_to)` | gym admin of `p_gym`, or the owner | integer: members moved |
| `remove_coach_from_gym(p_gym, p_coach)` | same | jsonb `{removed, deactivated, remaining_gyms}`; `deactivated` true means the coach has no gym left and `profiles.deactivated_at` is set, so brief 08 should now disable the login |
| `owner_gym_roster(p_gym, p_filter default null, p_search default null, p_limit default 100, p_offset default 0)` | owner of `p_gym` | jsonb `{gymId, total, limit, offset, filter, members: [{clientId, name, email, coachId, coachName, plan, planEndsOn, status, lastActive, onboarded, flagged, joinedOn}]}`; filters `on_plan`, `no_plan`, `ending_soon`, `flagged`, `new_this_month`, `left_last_30` (same definitions as `owner_gym_stats`); limit capped at 500; no health fields |
| `owner_set_gym_admin(p_gym, p_coach, p_is_admin)`, `owner_add_coach_to_gym(p_gym, p_coach, p_is_admin)`, `owner_remove_coach_from_gym(p_gym, p_coach)`, `owner_reassign_clients(p_gym, p_from, p_to)`, `owner_rename_gym(p_gym, p_name)`, `owner_set_gym_booking_settings(p_gym, p_timezone, p_blackout_start, p_blackout_end)` | owner of `p_gym` | same results as the admin versions |
| `set_gym_admin(p_coach_id, p_is_admin)`, `add_coach_to_gym(p_coach_id, p_is_admin)`, `set_gym_name(p_name)`, `set_gym_booking_settings(...)` | unchanged signatures | now share the internals above |
| `local_date(p_tz text, p_at timestamptz default now())`, `latest_completed_week(p_tz text)` | any signed-in user | date |
| `is_coach_in_gym(p_gym)` | any signed-in user (used by policies) | boolean |

New column: `profiles.deactivated_at`; `exercise_library.is_active` (default true). Error text brief 05 and 08 should show as it is: "That belongs to a different gym.", "A gym needs at least one admin. Make someone else an admin first.", "This coach still has N member(s) at this gym. Move them to another coach first.", "That coach does not work at this gym.", "This member already has a hold that overlaps those dates.", "You can't cancel a session that has already happened."

### Before applying: what the owner must do

1. Back up. Apply `0129`, `0130`, `0131` to the sandbox in order (after `0127` and `0128`), then run `gym-scoping-check.cjs`.
2. Run these **read-only** queries on live. The first three decide whether the clean-up is needed:

```sql
-- R36: red flag entries filed under a gym the member does not belong to
select e.gym_id, g.name, count(*) as wrong_gym_entries
from public.red_flag_entries e join public.gyms g on g.id = e.gym_id
where e.gym_id is distinct from public.client_gym_id(e.client_id) group by 1, 2;

-- CL4: holds that already overlap (left alone), and entries naming a coach from another gym
select a.client_id, a.id as hold_a, b.id as hold_b from public.membership_holds a
join public.membership_holds b on b.client_id = a.client_id and b.id > a.id
 and a.started_on <= coalesce(b.ended_on, 'infinity'::date) and b.started_on <= coalesce(a.ended_on, 'infinity'::date);
select e.id, e.gym_id, e.coach_id from public.red_flag_entries e
where e.coach_id is not null
  and not exists (select 1 from public.coach_gym_memberships m where m.coach_id = e.coach_id and m.gym_id = e.gym_id);

-- CM6: the timezones the owner statistics will use
select name, timezone from public.gyms where organisation_id is not null;

-- R38: objects already given to a member from another gym (they keep working; new ones are refused)
select 'plan' as kind, count(*) from public.client_memberships m join public.membership_packages p on p.id = m.package_id
  where p.gym_id is distinct from public.client_gym_id(m.client_id)
union all select 'form', count(*) from public.form_assignments a join public.form_templates t on t.id = a.template_id
  where t.gym_id is distinct from public.client_gym_id(a.client_id)
union all select 'course', count(*) from public.education_course_assignments a join public.education_courses c on c.id = a.course_id
  where c.gym_id is distinct from public.client_gym_id(a.client_id)
union all select 'booking', count(*) from public.bookings b join public.classes c on c.id = b.class_id
  where c.gym_id is distinct from public.client_gym_id(b.client_id);

-- CM3: existing values the new bounds would not have allowed (nothing is changed in them)
select id, name from public.gyms where btrim(name) = '' or char_length(name) > 80;
select id, default_checkin_reminder_days from public.profiles where default_checkin_reminder_days > 60;
select id, logo_path from public.profiles where logo_path is not null and logo_path !~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$');

-- CM4 and GA1: who owns the library, and gyms with no admin
select (created_by is null) as seeded, count(*) from public.exercise_library group by 1;
select g.id, g.name from public.gyms g
where not exists (select 1 from public.coach_gym_memberships m where m.gym_id = g.id and m.is_gym_admin);

-- CH1: members per coach per gym, and members whose coach does not work at their gym
select g.name as gym, coalesce(c.display_name, c.email) as coach, count(m.id) as members
from public.coach_gym_memberships cgm join public.gyms g on g.id = cgm.gym_id join public.profiles c on c.id = cgm.coach_id
left join public.profiles m on m.coach_id = c.id and m.role = 'client' and m.gym_id = g.id group by 1, 2 order by 1, 3 desc;
select m.id, m.gym_id, m.coach_id from public.profiles m
where m.role = 'client' and m.coach_id is not null
  and not exists (select 1 from public.coach_gym_memberships c where c.coach_id = m.coach_id and c.gym_id = m.gym_id);

-- R37: the policies an owner could read through before 0131 (compare with the sandbox check afterwards)
select polname, polrelid::regclass from pg_policy where pg_get_expr(polqual, polrelid) ilike '%is_same_gym_as_client%' order by 2, 1;
```

3. Apply to live one file at a time, in order. **Then run the red flag clean-up** (`supabase/cleanup/0129_red_flag_entries_wrong_gym.sql`): step 1 counts, step 2 lists, and only after you have read the list, step 3 (commented out) inside a transaction. Until it is run, the owner Overview still counts the 38 Worsley entries, because `owner_gym_stats` reads the stored entries by gym. Group C (entries where the team recorded something) is never touched by the script.
4. After applying, ask the coaches who work in both gyms (Brad) to open the Red Flags tab once: with 0129 it no longer writes anything, so the latest week will say "not generated" until the 06:00 UTC job runs or a gym admin generates it.

### Decisions used (recommended defaults)

- **D2 (owner):** the owner works through functions only. `is_same_gym_as_client` is coach-only again; the owner keeps `SELECT` on `profiles` and `coach_gym_memberships`. The existing owner screens only call `owner_gyms_overview`, `owner_gym_stats` and `owner_activity_report` (checked in `lib/data/owner.ts` and `app/owner`), so they are unaffected.
- **D3 (journal):** every coach at the member's gym can read journal entries (notes, goals, injuries); only the author can edit or delete; the assigned coach can add. The assigned coach used to be able to edit anyone's entry, so after a reassign the new coach can read but not edit the old coach's entries. Brief 05 should hide those edit and delete buttons.
- **D4 (library):** authors edit their own entries, gym admins (`profiles.is_gym_admin`, the active-gym flag, as the brief says) edit the seeded ones, nobody can change an author, `is_active` retires an entry. Entries created by coach A can be edited by coach A only, as before.

### Things to know

- **Red flag tables follow gym memberships, not the active gym.** `red_flag_entries`, `red_flag_settings` and `membership_holds` were readable and writable only while the coach's active gym matched; they now follow `coach_gym_memberships`. Without this a coach looking at their other gym through `p_gym` could read the list but not save a note. Any coach at the member's gym can manage that member's holds, as before.
- **Weeks generated before 0129 with nobody flagged** have no record and will show "not generated". Weeks that have entries are backfilled as generated.
- **`generate_red_flag_week` is stricter:** a signed-in caller can only generate the latest completed week of a gym they may see. The daily job (no signed-in user) is unrestricted.
- **`red_flag_week_stats` still uses `current_date` for its "unmarked sessions" column** (UTC). It is outside CM6 (owner statistics); left as it was.
- **`owner_activity_report`** uses the gym's timezone when one gym is asked for; for "all gyms" it still uses the `p_tz` the caller passes.
- **Not changed:** class and attendance functions (`mark_attendance`, `cancel_class_occurrence`, `restore_class_occurrence`, `coach_cancel_booking`) still compare the class's gym with the coach's active gym. That matches the app showing one gym's timetable at a time; brief 05 decides whether a coach should act on another gym's classes. `gym_events` has no member-linked coach view, so it got no extra read policy.
- **`remove_coach_from_gym` does not cancel the coach's scheduled broadcasts** at that gym (`scheduled_communications`); a repeating message from a removed coach would keep sending under their name. Brief 09 (or 05) should cancel or reassign them.
- **Members are not notified** when their coach changes; whether to tell them is for the screen (brief 08).
- **Per-table choice for `reassign_clients`:** `profiles.coach_id` and open red flag follow-ups move with the member; journal entries, past red flag entries with a recorded follow-up, chat history, and everything a coach authors for the gym (classes, plans, forms, templates, groups, scheduled broadcasts, join links) stay where they are.

### Hand-offs

- **Brief 03:** it starts from my definitions of `book_class_for_client`, `cancel_class_occurrence` and `apply_programme_rollout`. The audience selection fix for `apply_programme_rollout` is already done; keep the null-safe check and the past-date check when rewriting.
- **Brief 04:** `ExerciseLibraryManager` can use `is_active`; its delete message should say a used exercise cannot be deleted.
- **Brief 05:** `lib/data/redFlags.ts` calls `red_flag_report(p_week_start, p_gym)` and must handle `generated: false` and offer `generate_latest_red_flag_week` to gym admins; `lastCompletedWeek()` can use `latest_completed_week` from the answer.
- **Brief 08:** the function names above; use `deactivated` from `remove_coach_from_gym` to call the deactivate route; show the last-admin message as it is.

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

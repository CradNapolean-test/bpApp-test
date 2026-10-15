-- Security access rules, part 1 (fix brief 01): who may write what.
--
--  H1   Exercise library: only coaches can add, edit or delete entries (0013 let any logged-in user do it).
--  H2   Bookings: members can no longer write the table directly; every legitimate write goes through the booking functions.
--  M10  Plan and review fields on a member's own profile can no longer be rewritten by the member.
--  R31  Event capacity: NO CHANGE NEEDED, already enforced by the database (see the note at the end of this file).
--  M9   Timezone defaults now match the app (Europe/London); existing rows are left alone.
--  CL2  Education functions and internal trigger functions are no longer executable by logged-out callers.
--
-- Each section starts with a read-only PRE-FLIGHT query. Run them on the database you plan to migrate BEFORE applying this
-- file; none of them changes anything. Apply 0127 before 0128.
--
-- Written to be re-run safely (drop policy if exists / create or replace).

-- =====================================================================================================================
-- H1. Anyone logged in could rewrite the shared exercise library.
-- The old policy was FOR ALL ... USING (true) WITH CHECK (created_by = auth.uid()) and never looked at the role, so a member
-- could delete any entry or take one over by setting created_by to themselves.
--
-- PRE-FLIGHT (informational; who created the existing entries, by role. A non-coach role here means a member already wrote to
-- the library):
--   select p.role, count(*) from public.exercise_library l left join public.profiles p on p.id = l.created_by group by 1;
--
-- my_gym_id() is only non-null for coaches (0052), so it doubles as the "is a coach" test. Owners are not coaches and so
-- cannot edit the library; they can still read it. Which gym an entry belongs to is not decided here (brief 02, CM4): any
-- coach can still delete any entry for now.
-- =====================================================================================================================
drop policy if exists "authenticated coaches manage exercise_library" on public.exercise_library;
drop policy if exists "coaches manage exercise_library" on public.exercise_library;
create policy "coaches manage exercise_library"
  on public.exercise_library for all
  to authenticated
  using (public.my_gym_id() is not null)
  with check (created_by = auth.uid() and public.my_gym_id() is not null);
-- The read policy "authenticated users read exercise_library" (0013) stays: everyone signed in can still see the library.

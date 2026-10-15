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

-- =====================================================================================================================
-- H2. Members could skip credits and fake attendance by writing to the bookings table.
-- "client books for self" (INSERT) and "client cancels own booking" (UPDATE) let a member add any booking row and change
-- any column of their own bookings (status, attended, no_show). Every write the web app makes goes through security-definer
-- functions that ignore these policies: book_class, book_class_for_client, cancel_booking, coach_cancel_booking,
-- check_in_booking, mark_attendance, mark_attendance_status, cancel_class_occurrence (checked: nothing under app/, lib/ writes
-- to bookings, and the only scripts that do use the service role). The SELECT policy "select own or coached bookings" stays.
--
-- PRE-FLIGHT (informational; booked sessions that were never charged a credit. Some are legitimate: free classes, bookings a
-- coach made on a member's behalf. A pile of them for one member points to the hole being used):
--   select b.client_id, count(*)
--   from public.bookings b
--   join public.classes c on c.id = b.class_id
--   where b.status = 'booked' and c.credit_cost > 0
--     and not exists (select 1 from public.credits_ledger l where l.booking_id = b.id and l.delta < 0)
--   group by 1 order by 2 desc;
-- =====================================================================================================================
drop policy if exists "client books for self" on public.bookings;
drop policy if exists "client cancels own booking" on public.bookings;

-- =====================================================================================================================
-- M10. Members could write the plan and review fields on their own client_profiles row.
-- 0110 only protected the reminder days, join date and referral source. This extends the same trigger (latest definition: 0124)
-- to the plan and review columns, but only as far as no member flow breaks:
--
--   * Coaches (is_coach_of) and the system (auth.uid() is null: service role, crons, security-definer functions) are unchanged.
--   * needs_coach_review: a member's own actions raise it (full onboarding, an InBody scan), but only a coach can clear it.
--   * review_reasons: a member may add reasons (the InBody scan appends one) but not remove any. Exception: while the member is
--     still onboarding (onboarding_completed_at is null) the full-onboarding save may replace the list, provided the flag stays raised.
--   * nutrition_goal, nutrition_setting, diet_approach: set by the full-onboarding save while onboarding is open; after
--     onboarding_completed_at is set they belong to the coach. (The Setup screen shows these controls to coaches only.)
--   * onboarding_completed_at: a member can complete onboarding (null to a date, and re-stamp a date) but cannot re-open it.
--     Only a coach can ask for a details update (requestDetailsUpdate sets it back to null).
--   * deletion_requested_at stays member-writable on purpose: "request account deletion" and its cancel button are member actions.
--
-- Members can still write everything else on their own row (name, contact details, goals, weights, measurements, notification
-- switches, minutes_per_1000_steps, body_fat_pct and body_fat_estimated, nutrition_tracking_mode, timezone and so on).
--
-- Side effect to know about: until brief 06 (R15) makes the Setup save send only changed fields, a member whose coach changed
-- their goal or setting while their Setup screen was open now gets an error on Save instead of silently putting the old value
-- back. That is the safer failure.
--
-- PRE-FLIGHT: none. The trigger only judges future changes, so no existing row is refused. (Informational: members still
-- mid-onboarding, who may still set their plan:
--   select count(*) from public.client_profiles where onboarding_completed_at is null;)
-- =====================================================================================================================
create or replace function public.protect_coach_owned_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_onboarding_open boolean;
begin
  -- The system, and the member's own coach, may set these.
  if auth.uid() is null or public.is_coach_of(new.client_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- First save by the member: the reminder default is seeded here, but nothing else of the coach's may be set.
    if new.join_date is not null or new.referral_source is not null then
      raise exception 'Not authorized to set coach-managed profile fields';
    end if;
    return new;
  end if;

  -- UPDATE (this includes the update half of an upsert).
  if new.checkin_reminder_days is distinct from old.checkin_reminder_days
     or new.join_date is distinct from old.join_date
     or new.referral_source is distinct from old.referral_source then
    raise exception 'Not authorized to change coach-managed profile fields';
  end if;

  v_onboarding_open := old.onboarding_completed_at is null;

  if not v_onboarding_open then
    if new.onboarding_completed_at is null then
      raise exception 'Only your coach can ask you to update your details again';
    end if;
    if new.nutrition_goal is distinct from old.nutrition_goal
       or new.nutrition_setting is distinct from old.nutrition_setting
       or new.diet_approach is distinct from old.diet_approach then
      raise exception 'Your coach manages your nutrition plan';
    end if;
  end if;

  -- Only a coach can mark a plan as reviewed.
  if coalesce(old.needs_coach_review, false) and not coalesce(new.needs_coach_review, false) then
    raise exception 'Only your coach can mark your plan as reviewed';
  end if;

  -- Reasons can be added to, never removed (except by the full-onboarding save while the flag is raised).
  if not (coalesce(new.review_reasons, '{}'::text[]) @> coalesce(old.review_reasons, '{}'::text[]))
     and not (v_onboarding_open and coalesce(new.needs_coach_review, false)) then
    raise exception 'Only your coach can clear the review notes';
  end if;

  return new;
end;
$$;

-- A trigger function is never called directly; keep it out of the API's reach (as 0110 did).
revoke execute on function public.protect_coach_owned_profile_fields() from public, anon, authenticated;

drop trigger if exists protect_coach_owned_profile_fields on public.client_profiles;
create trigger protect_coach_owned_profile_fields
  before insert or update on public.client_profiles
  for each row execute function public.protect_coach_owned_profile_fields();

-- =====================================================================================================================
-- M9. Timezone defaults.
-- client_profiles.timezone (0044) and gyms.timezone (0064) defaulted to Pacific/Auckland; the app's DEFAULT_TIMEZONE is
-- Europe/London. Only the DEFAULT changes. Existing rows are NOT touched: the live gyms are already on Europe/London and the
-- seeded test members (Auckland) are to be deleted.
--
-- PRE-FLIGHT (informational; check what is there now):
--   select name, timezone from public.gyms;
--   select timezone, count(*) from public.client_profiles group by 1;
-- =====================================================================================================================
alter table public.client_profiles alter column timezone set default 'Europe/London';
alter table public.gyms alter column timezone set default 'Europe/London';

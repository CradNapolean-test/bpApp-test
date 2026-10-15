-- Catch-up for 0127 (fix brief 01) on a database where 0127 did not apply.
--
-- Found on the live database on 15 Oct 2026: 0128 to 0141 were in place but 0127 was not (the two member write rules on bookings and the
-- old open rule on exercise_library were still there). 0127 had stopped on "function public.assign_education_content(uuid, uuid) does
-- not exist" (migration 0026 dropped it long ago) and rolled back. 0127 is fixed now, but re-running it on this database would be
-- wrong, because its library rule ("coaches manage exercise_library") was replaced by the finer add / edit / delete rules in 0130. This
-- file does the rest of 0127 in the shape that fits what is already there. Numbered 0134 so that 0143 stays the last migration; on a
-- database built from the start it simply repeats what 0127 did and changes nothing.
--
--  H1  Drops the old rule that let anyone signed in rewrite the exercise library. It does NOT re-create 0127's rule: 0130's
--      "coaches add to", "owners edit" and "owners delete" exercise_library rules, and the read rule, stay as they are.
--  H2  Members can no longer write the bookings table directly (every real booking goes through the booking functions).
--  M10 Plan and review fields on a member's own profile can no longer be rewritten by the member (same trigger as 0127).
--  M9  Timezone defaults match the app (Europe/London). Existing rows are not touched.
--  CL2 Logged-out callers can no longer run the internal trigger functions.
--
-- Safe to run again. PRE-FLIGHT: the queries in 0127's comments (informational; nothing in them changes data).
-- To undo H2: create policy "client books for self" on public.bookings for insert with check (is_self(client_id));
--             create policy "client cancels own booking" on public.bookings for update using (is_self(client_id));

-- H1
drop policy if exists "authenticated coaches manage exercise_library" on public.exercise_library;

-- H2
drop policy if exists "client books for self" on public.bookings;
drop policy if exists "client cancels own booking" on public.bookings;

-- M10 (the same definition as 0127)
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

-- M9
alter table public.client_profiles alter column timezone set default 'Europe/London';
alter table public.gyms alter column timezone set default 'Europe/London';

-- CL2: whichever of these trigger functions exist, logged-out callers lose the right to run them.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sync_profile_email', 'enforce_advance_booking_window', 'sync_gym_session_from_attendance')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

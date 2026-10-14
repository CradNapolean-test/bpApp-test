-- Members cannot write the profile fields that belong to their coach.
--
-- Found while building the member Account screen (slice 7a; see docs/SECURITY_DEFINER_AUDIT.md). The "client updates own
-- client_profiles" policy (is_self) has no column split, so a member could change ANY column of their own row by calling
-- the API directly. The web only avoided that by leaving four fields out of the member's own save (its "Omit list"), and
-- 0046 notes the same thing in a comment. Reproduced on the sandbox with a plain member: they could change their own
-- check-in reminder days, join date and referral source, and overwrite the coach's private admin notes.
--
-- This adds one BEFORE trigger that refuses those changes unless the caller is the member's own coach or the system
-- (the service role, crons and the security-definer functions all run with no signed-in member, so auth.uid() is null).
-- The coach's existing routes still work, because inside them the caller is still the coach: set_checkin_reminder_days
-- and set_client_admin_details check is_coach_of() themselves.
--
-- What stays writable by the member, on purpose:
--   * everything else in their own row (their details, goals, notification switches, deletion request, the body-fat and
--     review flags the scan and onboarding flows set, and nutrition_tracking_mode, which onboarding lets them pick);
--   * checkin_reminder_days on the FIRST save only: that is how the row is seeded from their coach's default. After that
--     only the coach can change it.
--
-- Not fixed here: a member can still READ the coach-only admin columns of their own row (RLS is row-level, so hiding a
-- column from the member but not the coach means moving those fields into a coach-only table, which also needs web
-- changes). The audit records this as a known gap.

create or replace function public.protect_coach_owned_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The system, and the member's own coach, may set these.
  if auth.uid() is null or public.is_coach_of(new.client_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- First save by the member: the reminder default is seeded here, but nothing else of the coach's may be set.
    if new.join_date is not null or new.referral_source is not null or new.admin_notes is not null then
      raise exception 'Not authorized to set coach-managed profile fields';
    end if;
  elsif new.checkin_reminder_days is distinct from old.checkin_reminder_days
     or new.join_date is distinct from old.join_date
     or new.referral_source is distinct from old.referral_source
     or new.admin_notes is distinct from old.admin_notes then
    raise exception 'Not authorized to change coach-managed profile fields';
  end if;

  return new;
end;
$$;

-- A trigger function is never called directly, but keep it out of the API's reach like the other internal functions (0105).
revoke execute on function public.protect_coach_owned_profile_fields() from public, anon, authenticated;

drop trigger if exists protect_coach_owned_profile_fields on public.client_profiles;
create trigger protect_coach_owned_profile_fields
  before insert or update on public.client_profiles
  for each row execute function public.protect_coach_owned_profile_fields();

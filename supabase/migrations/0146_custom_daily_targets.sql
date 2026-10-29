-- Members can set their own daily calorie and macro targets (for example a member who tracks elsewhere and only types in totals).
--
-- When all four custom_* values are set they replace the calculated target on every screen (the calculation in lib/calculations.ts is
-- unchanged and still used when they are empty). The coach can set or clear them for any of their members, and can switch off the
-- member's ability to change them with custom_targets_locked. The database enforces both: a member's own save is refused while the
-- lock is on, and only a coach (or the system) can turn the lock on or off. Row-level security is untouched: the member still updates
-- only their own row and the coach only their members' rows.

alter table public.client_profiles
  add column if not exists custom_calories numeric,
  add column if not exists custom_protein numeric,
  add column if not exists custom_carbs numeric,
  add column if not exists custom_fat numeric,
  add column if not exists custom_targets_locked boolean not null default false;

alter table public.client_profiles drop constraint if exists client_profiles_custom_targets_range;
alter table public.client_profiles
  add constraint client_profiles_custom_targets_range check (
    (custom_calories is null or (custom_calories >= 0 and custom_calories <= 20000))
    and (custom_protein is null or (custom_protein >= 0 and custom_protein <= 2000))
    and (custom_carbs is null or (custom_carbs >= 0 and custom_carbs <= 3000))
    and (custom_fat is null or (custom_fat >= 0 and custom_fat <= 1500))
  ) not valid;

-- The same definition as 0134, plus the two rules for custom targets.
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
    if new.join_date is not null or new.referral_source is not null or new.custom_targets_locked then
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

  -- Only a coach can lock or unlock a member's own targets, and while locked the member cannot change them.
  if new.custom_targets_locked is distinct from old.custom_targets_locked then
    raise exception 'Only your coach can lock or unlock your daily targets';
  end if;
  if old.custom_targets_locked
     and (new.custom_calories is distinct from old.custom_calories
          or new.custom_protein is distinct from old.custom_protein
          or new.custom_carbs is distinct from old.custom_carbs
          or new.custom_fat is distinct from old.custom_fat) then
    raise exception 'Your coach has locked your daily targets';
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

revoke execute on function public.protect_coach_owned_profile_fields() from public, anon, authenticated;

drop trigger if exists protect_coach_owned_profile_fields on public.client_profiles;
create trigger protect_coach_owned_profile_fields
  before insert or update on public.client_profiles
  for each row execute function public.protect_coach_owned_profile_fields();

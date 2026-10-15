-- Owner and admin features (fix brief 08).
--  CH3  "Ask my clients to confirm their details" no longer clears onboarding_completed_at (which locked members out of the
--       app). It sets client_profiles.details_confirm_requested_at instead; the member sees a dismissible banner.
--  JL1  rotate_my_join_link(): a new sign-up token for the calling coach; the old one stops working at once.
--  CL7  admin_audit: who changed a gym-admin flag, and when (written by a trigger, so every path is covered).
--
-- PRE-FLIGHT (read-only): nothing here rejects existing rows.
-- Re-runnable.

-- ---- CH3 ----
alter table public.client_profiles add column if not exists details_confirm_requested_at timestamptz;

-- ---- JL1 ----
create or replace function public.rotate_my_join_link()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  -- Two random UUIDs (the database's secure random source), dashes removed: 244 bits, url-safe.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into onboarding_links (coach_id, token, active) values (auth.uid(), v_token, true)
  on conflict (coach_id) do update set token = excluded.token, active = true;
  return v_token;
end;
$$;

revoke execute on function public.rotate_my_join_link() from public, anon;
grant execute on function public.rotate_my_join_link() to authenticated;

-- ---- CL7 ----
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  gym_id uuid not null,
  coach_id uuid not null,
  is_gym_admin boolean not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.admin_audit enable row level security;
-- No policies: nobody reads it through the API; the owner reads it in the SQL editor.

create or replace function public.log_admin_flag_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.is_gym_admin is not true then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_gym_admin is not distinct from old.is_gym_admin then
    return new;
  end if;
  insert into admin_audit (gym_id, coach_id, is_gym_admin, changed_by)
  values (new.gym_id, new.coach_id, coalesce(new.is_gym_admin, false), auth.uid());
  return new;
end;
$$;

revoke execute on function public.log_admin_flag_change() from public, anon, authenticated;

drop trigger if exists log_admin_flag_change on public.coach_gym_memberships;
create trigger log_admin_flag_change
  after insert or update of is_gym_admin on public.coach_gym_memberships
  for each row execute function public.log_admin_flag_change();

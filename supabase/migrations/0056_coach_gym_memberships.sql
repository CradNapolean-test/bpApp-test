-- Multi-gym coach accounts: a coach can now belong to more than one gym and switch which one
-- is "active" without a separate login per location. profiles.gym_id/is_gym_admin narrow to
-- meaning "my currently active gym + my admin flag there" for a coach -- a cache kept in sync
-- by switch_active_gym() below, which is exactly what every existing RLS policy from
-- 0052-0055 already reads (my_gym_id(), is_same_gym_as_client(), the gym-shared-library
-- policies) -- none of that needs to change.
--
-- This also fixes a latent gap: a client's gym used to be derived live through their coach
-- (client_gym_id() joined client.coach_id -> coach.gym_id). That was fine while a coach only
-- ever had one gym, but once a coach can be active on gym B while still owning gym-A clients,
-- deriving through the coach's current selection would silently reclassify those clients the
-- moment the coach switches. Clients now get their own fixed gym_id, set once at creation and
-- never touched again -- a stable "home gym" independent of their coach's active pointer.

create table coach_gym_memberships (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  gym_id uuid not null references gyms(id) on delete cascade,
  is_gym_admin boolean not null default false,
  created_at timestamptz default now(),
  unique (coach_id, gym_id)
);

alter table coach_gym_memberships enable row level security;

create function public.is_admin_of_gym(target_gym_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from coach_gym_memberships
    where coach_id = auth.uid() and gym_id = target_gym_id and is_gym_admin
  );
$$;

-- Writes only via the RPCs below (switch_active_gym, add_coach_to_gym, set_gym_admin) --
-- same "no direct table write" shape as credits_ledger.
create policy "coach reads own or administered memberships"
  on coach_gym_memberships for select
  using (coach_id = auth.uid() or public.is_admin_of_gym(gym_id));

-- ============ Backfill ============
-- One membership row per existing coach, copying their current active gym/admin flag.
insert into coach_gym_memberships (coach_id, gym_id, is_gym_admin)
select id, gym_id, is_gym_admin from profiles where role = 'coach' and gym_id is not null;

-- Every existing client gets a fixed gym_id snapshotted from their coach's gym today --
-- unambiguous, since no coach has more than one gym yet at migration time.
update profiles client
set gym_id = coach.gym_id
from profiles coach
where client.role = 'client' and client.coach_id = coach.id;

-- ============ client_gym_id(): read the now-direct column instead of joining through coach ==
create or replace function public.client_gym_id(target_client_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select gym_id from profiles where id = target_client_id and role = 'client';
$$;
-- my_gym_id() and is_same_gym_as_client() need no changes -- they already just call this.

-- ============ profiles: fix coach-visibility to a real membership-overlap check ============
-- The old "gym_id = my_gym_id()" policy only matched a gym-mate whose *currently active* gym
-- happened to equal mine -- it would hide a dual-gym coach from their gym-B roster while
-- they're active on gym A. This checks actual shared membership instead.
create function public.shares_gym_membership(target_coach_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from coach_gym_memberships mine
    join coach_gym_memberships theirs on theirs.gym_id = mine.gym_id
    where mine.coach_id = auth.uid() and theirs.coach_id = target_coach_id
  );
$$;

drop policy "same-gym coaches read each other" on profiles;
create policy "same-gym coaches read each other"
  on profiles for select
  using (role = 'coach' and public.shares_gym_membership(id));

-- ============ set_gym_admin(): write through the membership, not profiles directly =========
-- Admin rights are per-membership now, not global to the coach -- this updates the target's
-- membership row for the caller's active gym, and only mirrors into their profiles cache if
-- that gym happens to be their own currently-active one (a no-op otherwise).
create or replace function public.set_gym_admin(p_coach_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;

  update coach_gym_memberships
  set is_gym_admin = p_is_admin
  where coach_id = p_coach_id and gym_id = public.my_gym_id();

  update profiles
  set is_gym_admin = p_is_admin
  where id = p_coach_id and gym_id = public.my_gym_id();
end;
$$;

grant execute on function public.set_gym_admin(uuid, boolean) to authenticated;

-- ============ switch_active_gym(): move a coach's active pointer to a gym they belong to ====
create or replace function public.switch_active_gym(p_gym_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  select is_gym_admin into v_admin
  from coach_gym_memberships
  where coach_id = auth.uid() and gym_id = p_gym_id;

  if not found then
    raise exception 'Not a member of that gym';
  end if;

  update profiles set gym_id = p_gym_id, is_gym_admin = v_admin where id = auth.uid();
end;
$$;

grant execute on function public.switch_active_gym(uuid) to authenticated;

-- ============ add_coach_to_gym(): add an existing coach account to my gym ===================
-- Distinct from creating a brand-new account (still handled by /api/gym/create-coach's
-- admin client, since Postgres can't call auth.admin.createUser) -- this just grants an
-- already-existing coach membership at the caller's active gym.
create or replace function public.add_coach_to_gym(p_coach_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;

  insert into coach_gym_memberships (coach_id, gym_id, is_gym_admin)
  values (p_coach_id, public.my_gym_id(), p_is_admin)
  on conflict (coach_id, gym_id) do update set is_gym_admin = excluded.is_gym_admin;
end;
$$;

grant execute on function public.add_coach_to_gym(uuid, boolean) to authenticated;

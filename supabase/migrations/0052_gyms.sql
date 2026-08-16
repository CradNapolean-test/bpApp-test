-- Multi-gym support: a gym has several coaches, each coach still owns their clients directly
-- (profiles.coach_id, unchanged), but coaches at the same gym can see each other's clients
-- read-only and share one timetable/library of resources. This migration adds the gym concept
-- and the helper functions later migrations build on; 0053 broadens read access to
-- client-scoped data, 0054 makes the coach-owned "library" tables (classes, membership
-- packages, form templates, etc.) gym-wide instead of per-coach.
--
-- Written idempotently throughout (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE) --
-- safe to re-run against a database where it's already partially or fully applied.

create table if not exists gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table gyms enable row level security;

-- Readable by any authenticated user -- needed so a coach's/client's own gym name can be
-- shown in the UI without a separate admin-only lookup.
drop policy if exists "authenticated users read gyms" on gyms;
create policy "authenticated users read gyms"
  on gyms for select
  to authenticated
  using (true);

-- gym_id is only ever set on coach-role profiles -- a client's gym is derived through their
-- own coach (client_gym_id() below), never stored redundantly, so it can't drift if a client
-- is ever reassigned to a different coach.
alter table profiles add column if not exists gym_id uuid references gyms(id);
alter table profiles add column if not exists is_gym_admin boolean not null default false;

-- Backfill: this app has run for exactly one gym in production so far. Create that gym and
-- attach every existing coach to it, with admin rights preserved so no one loses capability
-- on deploy. Guarded to run at most once (skipped once any gym exists) so a re-run of this
-- migration never creates a duplicate gym or re-stamps coaches who've since been reassigned.
do $$
declare
  v_gym_id uuid;
begin
  if not exists (select 1 from gyms) then
    insert into gyms (name) values ('Ballistic Performance') returning id into v_gym_id;
    update profiles set gym_id = v_gym_id, is_gym_admin = true where role = 'coach';
  end if;
end $$;

-- ============ Helper functions ============
-- Mirrors is_self/is_coach_of/owns_client (schema.sql:204-236) -- security definer so the
-- internal profiles lookup doesn't re-trigger profiles' own RLS policy.

-- The calling coach's own gym -- null if the caller is a client or not a coach. Deliberately
-- does NOT resolve a client's gym (see client_gym_id) -- keeping this coach-only means it can
-- be used directly as a write-scope check (gym_id = my_gym_id()) without ever accidentally
-- granting a client coach-level access to a gym-shared table.
create or replace function public.my_gym_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select gym_id from profiles where id = auth.uid() and role = 'coach';
$$;

-- Which gym a given client belongs to, via their assigned coach.
create or replace function public.client_gym_id(target_client_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coach.gym_id
  from profiles client
  join profiles coach on coach.id = client.coach_id
  where client.id = target_client_id;
$$;

-- Read-only cross-coach grant: true when the caller is a coach at the same gym as the target
-- client. Deliberately kept separate from owns_client() -- several tables use owns_client (or
-- is_coach_of directly) to gate `for all` write policies, and write access to a client's data
-- must stay assigned-coach-only. This only ever gets added as an extra SELECT policy (0053).
create or replace function public.is_same_gym_as_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.my_gym_id() is not null and public.my_gym_id() = public.client_gym_id(target_client_id);
$$;

-- ============ profiles: gym-wide visibility ============
-- profiles itself needs two more select policies beyond the existing owns_client(id) one:
-- coaches need to see each other (gym admin roster, "assigned coach" labels when viewing a
-- searched client) and coaches need to see gym-mates' clients (is_same_gym_as_client uses `id`
-- here, not `client_id` -- a client's own row id doubles as its client_id since profiles has
-- no separate client_id column).

drop policy if exists "same-gym coaches read each other" on profiles;
create policy "same-gym coaches read each other"
  on profiles for select
  using (role = 'coach' and gym_id = public.my_gym_id());

drop policy if exists "same-gym coach reads client profiles" on profiles;
create policy "same-gym coach reads client profiles"
  on profiles for select
  using (public.is_same_gym_as_client(id));

-- Callable directly via supabase.rpc() by ANY authenticated user (coach or client), unlike
-- my_gym_id()/client_gym_id() above -- those stay ungranted, RLS-internal-only helpers (same
-- shape as is_coach_of/my_coach_id), unsafe to expose broadly since client_gym_id takes an
-- arbitrary target id. This one takes no argument -- it only ever resolves auth.uid()'s own
-- scoping gym, coach or client -- so it's safe to grant. Mirrors get_my_coach_display_name's
-- exact reasoning (0042): the profiles select policies don't cover "my own coach's row" for a
-- client caller (the opposite direction from is_coach_of), so resolving this via a plain
-- embedded select from the app layer would silently come back null under RLS. This is what
-- lib/data/coach.ts's resolveScopingGymId() calls.
create or replace function public.my_scoping_gym_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select gym_id from profiles where id = auth.uid() and role = 'coach'),
    (select coach.gym_id from profiles me join profiles coach on coach.id = me.coach_id where me.id = auth.uid())
  );
$$;

grant execute on function public.my_scoping_gym_id() to authenticated;

-- ============ Gym admin RPCs ============
-- Narrow security-definer RPCs, same pattern as set_display_name/set_logo_path (0042, 0047) --
-- profiles has no general update policy since it also holds role/coach_id/gym_id.

create or replace function public.set_gym_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  update gyms set name = p_name where id = public.my_gym_id();
end;
$$;

grant execute on function public.set_gym_name(text) to authenticated;

-- Only an existing gym admin can grant/revoke admin rights, and only for a coach at their own
-- gym -- prevents a gym admin at gym A from touching gym B's roster.
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
  update profiles
  set is_gym_admin = p_is_admin
  where id = p_coach_id and role = 'coach' and gym_id = public.my_gym_id();
end;
$$;

grant execute on function public.set_gym_admin(uuid, boolean) to authenticated;

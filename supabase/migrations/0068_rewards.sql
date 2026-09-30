-- Loyalty rewards (water bottle at 18 months, hoodie at 100 sessions, ...). The gym defines
-- rewards with a threshold on sessions attended or months as a member; members see their
-- progress; a coach marks a reward as given once it has been handed over.

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  name text not null,
  description text,
  kind text not null check (kind in ('sessions', 'months')),
  threshold integer not null check (threshold > 0),
  created_at timestamptz not null default now()
);

alter table rewards enable row level security;

drop policy if exists "gym reads rewards" on rewards;
create policy "gym reads rewards"
  on rewards for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

drop policy if exists "gym coaches manage rewards" on rewards;
create policy "gym coaches manage rewards"
  on rewards for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

create table if not exists reward_grants (
  reward_id uuid not null references rewards(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id) default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (reward_id, client_id)
);

alter table reward_grants enable row level security;

drop policy if exists "read own or gym reward_grants" on reward_grants;
create policy "read own or gym reward_grants"
  on reward_grants for select
  using (public.is_self(client_id) or public.is_same_gym_as_client(client_id));

drop policy if exists "gym coaches give rewards" on reward_grants;
create policy "gym coaches give rewards"
  on reward_grants for insert
  with check (public.is_same_gym_as_client(client_id));

drop policy if exists "gym coaches undo rewards" on reward_grants;
create policy "gym coaches undo rewards"
  on reward_grants for delete
  using (public.is_same_gym_as_client(client_id));

-- Progress toward reward thresholds. A member gets their own row; a coach gets one row per
-- client in their gym. Sessions = bookings marked attended; months = whole months since their
-- first membership started. Security definer so it can count across bookings a coach can't
-- otherwise read row-by-row, while still only returning the caller's own gym.
create or replace function public.member_reward_progress()
returns table (client_id uuid, sessions bigint, months integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    (select count(*) from bookings b where b.client_id = p.id and b.attended),
    coalesce((
      select (extract(year from age(current_date, min(cm.started_at))) * 12
            + extract(month from age(current_date, min(cm.started_at))))::integer
      from client_memberships cm where cm.client_id = p.id
    ), 0)
  from profiles p
  where p.role = 'client'
    and (
      p.id = auth.uid()
      or (public.my_gym_id() is not null and public.client_gym_id(p.id) = public.my_gym_id())
    );
$$;

grant execute on function public.member_reward_progress() to authenticated;

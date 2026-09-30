-- Community features from the owner's BP app brief: gym events with member sign-up, a simple
-- feedback form, and referral codes. No payments (see CLAUDE.md) -- event sign-up is just
-- "I'm coming"; any money is handled outside the app.

-- ============ gym_events ============
create table if not exists gym_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id),
  created_by uuid references profiles(id) default auth.uid(),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  capacity integer check (capacity is null or capacity > 0), -- null = unlimited
  created_at timestamptz not null default now()
);

alter table gym_events enable row level security;

drop policy if exists "gym reads gym_events" on gym_events;
create policy "gym reads gym_events"
  on gym_events for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

drop policy if exists "gym coaches manage gym_events" on gym_events;
create policy "gym coaches manage gym_events"
  on gym_events for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ============ event_signups ============
create table if not exists event_signups (
  event_id uuid not null references gym_events(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, client_id)
);

alter table event_signups enable row level security;

-- Members see their own sign-ups; coaches in the event's gym see everyone's (the attendee list).
drop policy if exists "read own or gym event_signups" on event_signups;
create policy "read own or gym event_signups"
  on event_signups for select
  using (
    public.is_self(client_id)
    or exists (select 1 from gym_events e where e.id = event_id and e.gym_id = public.my_gym_id())
  );

drop policy if exists "member signs up for gym event" on event_signups;
create policy "member signs up for gym event"
  on event_signups for insert
  with check (
    public.is_self(client_id)
    and exists (select 1 from gym_events e where e.id = event_id and e.gym_id = public.client_gym_id(auth.uid()))
  );

drop policy if exists "member leaves event" on event_signups;
create policy "member leaves event"
  on event_signups for delete
  using (public.is_self(client_id));

-- Per-event headcount for capacity display. Members can't read other members' sign-up rows
-- (RLS above), so this security-definer function returns just the count.
create or replace function public.event_signup_counts()
returns table (event_id uuid, signups bigint)
language sql
security definer
stable
set search_path = public
as $$
  select s.event_id, count(*)
  from event_signups s
  join gym_events e on e.id = s.event_id
  where e.gym_id = public.my_gym_id() or e.gym_id = public.client_gym_id(auth.uid())
  group by s.event_id;
$$;

grant execute on function public.event_signup_counts() to authenticated;

-- ============ member_feedback ============
create table if not exists member_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table member_feedback enable row level security;

drop policy if exists "member submits feedback" on member_feedback;
create policy "member submits feedback"
  on member_feedback for insert
  with check (public.is_self(client_id));

drop policy if exists "read own or coached member_feedback" on member_feedback;
create policy "read own or coached member_feedback"
  on member_feedback for select
  using (public.owns_client(client_id));

-- Any coach in the member's gym can read feedback (manager view), same pattern as 0053.
drop policy if exists "gym coaches read member_feedback" on member_feedback;
create policy "gym coaches read member_feedback"
  on member_feedback for select
  using (public.is_same_gym_as_client(client_id));

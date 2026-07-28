-- Membership packages + weekly credit reset + class attendance.
-- Builds on the classes/bookings/credits_ledger foundation from 0001/0003.

-- ============ Membership packages (coach-defined) ============
create table membership_packages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  name text not null,
  credits_per_week integer not null check (credits_per_week >= 0),
  description text,
  created_at timestamptz default now()
);

alter table membership_packages enable row level security;

create policy "authenticated users read membership_packages"
  on membership_packages for select
  to authenticated
  using (true);

create policy "coach manages own membership_packages"
  on membership_packages for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- ============ Client membership assignment (historical, not mutable) ============
create table client_memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  package_id uuid not null references membership_packages(id),
  started_at date not null default current_date,
  ended_at date, -- null = currently active
  last_reset_week date, -- Monday of the most recent week this membership was reset for
  created_at timestamptz default now()
);

-- Only one active (ended_at is null) membership per client at a time.
create unique index client_memberships_one_active
  on client_memberships (client_id)
  where ended_at is null;

alter table client_memberships enable row level security;

create policy "select own or coached client_memberships"
  on client_memberships for select
  using (owns_client(client_id));

create policy "coach manages client_memberships"
  on client_memberships for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id));

-- ============ Attendance ============
alter table bookings add column attended boolean not null default false;
alter table bookings add column attended_at timestamptz;

-- ============ RPCs ============

-- Coach assigns (or changes) a client's membership package. Closes out any existing
-- active membership rather than mutating it, keeping the assignment history intact.
create or replace function public.assign_membership(p_client_id uuid, p_package_id uuid)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership client_memberships;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  update client_memberships
  set ended_at = current_date
  where client_id = p_client_id and ended_at is null;

  insert into client_memberships (client_id, package_id)
  values (p_client_id, p_package_id)
  returning * into v_membership;

  return v_membership;
end;
$$;

-- Coach checks a client off as attended (or un-checks) for a specific booking. Restricted
-- to the booking's class's own coach, not just any coach.
create or replace function public.mark_attendance(p_booking_id uuid, p_attended boolean)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1 from classes
    where classes.id = v_booking.class_id
    and classes.coach_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  update bookings
  set attended = p_attended, attended_at = case when p_attended then now() else null end
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Resets every active membership's credit balance to exactly its package's weekly amount,
-- for any membership not yet reset this ISO week (Monday-start, matching
-- lib/utils/dates.ts's convention). Idempotent and catch-up safe: a daily cron trigger
-- (rather than a precise once-a-week one) just means a missed day resolves itself on the
-- next run, and a membership already reset this week is skipped, never double-reset.
--
-- Known tradeoff, deliberate: credits are one fungible balance per client shared with
-- manual coach grants (see credits_ledger). Resetting to exactly the package amount wipes
-- out any manual bonus credits granted mid-week, since the reset zeroes the balance to N
-- regardless of source. Chosen over an additive top-up per explicit product decision.
create or replace function public.replenish_due_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week date := date_trunc('week', current_date)::date;
  v_membership record;
  v_balance integer;
  v_count integer := 0;
begin
  for v_membership in
    select cm.id, cm.client_id, mp.credits_per_week
    from client_memberships cm
    join membership_packages mp on mp.id = cm.package_id
    where cm.ended_at is null
    and (cm.last_reset_week is null or cm.last_reset_week < v_current_week)
  loop
    select coalesce(sum(delta), 0) into v_balance
    from credits_ledger
    where client_id = v_membership.client_id;

    insert into credits_ledger (client_id, delta, reason)
    values (
      v_membership.client_id,
      v_membership.credits_per_week - v_balance,
      'membership reset: week of ' || v_current_week
    );

    update client_memberships
    set last_reset_week = v_current_week
    where id = v_membership.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.assign_membership(uuid, uuid) to authenticated;
grant execute on function public.mark_attendance(uuid, boolean) to authenticated;
-- replenish_due_memberships is intentionally NOT granted to authenticated: it's called
-- only by the cron route via the service-role admin client (lib/supabase/admin.ts), which
-- bypasses grants entirely. No client should ever be able to trigger a reset on demand.

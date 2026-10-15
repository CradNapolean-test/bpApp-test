-- Gym scoping, part 1 (fix brief 02): red flags and owner reports.
--
--  R36  Red flags are now filed under the MEMBER's gym, not the gym the coach happens to have active.
--  RF1  Opening the Red Flags tab no longer writes anything. Only the daily job, or a gym admin asking for the latest
--       completed week, generates a list.
--  CL4  A red flag entry can only name a coach who works at its gym, and two holds for one member cannot overlap.
--  CM6  The owner statistics use each gym's own calendar (timezone) instead of the database's UTC date.
--
-- Each section starts with a read-only PRE-FLIGHT query: run them on the database you plan to migrate BEFORE applying this
-- file. A separate, reviewed clean-up script for rows already filed under the wrong gym is in
-- supabase/cleanup/0129_red_flag_entries_wrong_gym.sql (it is NOT part of this migration and is never run automatically).
--
-- Apply after 0128. Written to be re-run safely.

-- =====================================================================================================================
-- R36 + RF1. One gym per member; the report is read-only; a coach can look at their other gym without switching.
--
-- Why: red_flag_week_stats picked members with "coach.gym_id = p_gym", which is the coach's CURRENTLY ACTIVE gym. A coach who
-- works in two gyms filed their members under whichever gym they had switched to when they opened the tab. Members are now
-- selected by their own gym (client_gym_id), and red_flag_report takes an optional gym so a coach (or the owner) can look at
-- another gym they belong to.
--
-- Why the report is read-only: red_flag_report used to call generate_red_flag_week for whichever week was on screen, so
-- stepping back week by week created entries for old weeks from TODAY's plans and holds, not the history. It now only
-- reads. A new table, red_flag_week_runs, remembers which gym/week lists have been generated (a week with nobody flagged has
-- no entries, so entries alone cannot say). The report returns "generated": false for a week that has not been generated and
-- the screen says so. Generation happens in two places only: the daily job (generate_all_red_flag_weeks, unchanged) and
-- generate_latest_red_flag_week, which a gym admin or the owner may run for the latest COMPLETED week, at most once every 10
-- minutes per gym.
--
-- Weeks generated before this migration but with nobody flagged have no record and will show as "not generated". Backfill
-- below marks every gym/week that already has entries.
--
-- Rows in red_flag_entries, red_flag_settings and membership_holds were readable and writable only while the coach's ACTIVE
-- gym equalled the row's gym. They now follow the coach's gym memberships instead, otherwise a coach looking at their other
-- gym through p_gym could read the list but not save a note against it.
--
-- PRE-FLIGHT (read-only; entries filed under a gym the member does not belong to; see the clean-up script):
--   select e.gym_id, g.name, count(*) as wrong_gym_entries
--   from public.red_flag_entries e
--   join public.gyms g on g.id = e.gym_id
--   where e.gym_id is distinct from public.client_gym_id(e.client_id)
--   group by 1, 2;
-- =====================================================================================================================

-- Is the caller a coach who works at this gym (a membership row), whichever gym they have active?
create or replace function public.is_coach_in_gym(p_gym uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_gym is not null
    and auth.uid() is not null
    and exists (select 1 from coach_gym_memberships where coach_id = auth.uid() and gym_id = p_gym);
$$;

revoke execute on function public.is_coach_in_gym(uuid) from public, anon;
grant execute on function public.is_coach_in_gym(uuid) to authenticated;

-- May the caller see this gym's red flag lists: a coach who works there, or the owner of its organisation.
create or replace function public.can_view_gym(p_gym uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_gym is not null
    and auth.uid() is not null
    and (
      exists (select 1 from coach_gym_memberships where coach_id = auth.uid() and gym_id = p_gym)
      or coalesce(public.is_owner_of_gym(p_gym), false)
    );
$$;

revoke execute on function public.can_view_gym(uuid) from public, anon, authenticated;

-- The calendar date in a timezone at a moment (default now). Used wherever a rule means "today at the gym".
create or replace function public.local_date(p_tz text, p_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select (p_at at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date;
$$;

revoke execute on function public.local_date(text, timestamptz) from public, anon;
grant execute on function public.local_date(text, timestamptz) to authenticated;

-- The Monday of the last completed Monday-to-Sunday week in a timezone.
create or replace function public.latest_completed_week(p_tz text)
returns date
language sql
stable
set search_path = public
as $$
  select (date_trunc('week', public.local_date(p_tz)::timestamp) - interval '7 days')::date;
$$;

revoke execute on function public.latest_completed_week(text) from public, anon;
grant execute on function public.latest_completed_week(text) to authenticated;

-- Which gym/week lists have been generated. Written only by generate_red_flag_week; nobody reads it directly.
create table if not exists public.red_flag_week_runs (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  week_start date not null,
  generated_at timestamptz not null default now(),
  last_run_at timestamptz not null default now(),
  primary key (gym_id, week_start)
);

alter table public.red_flag_week_runs enable row level security;
revoke all on public.red_flag_week_runs from anon, authenticated;

insert into public.red_flag_week_runs (gym_id, week_start)
select distinct gym_id, week_start from public.red_flag_entries
on conflict (gym_id, week_start) do nothing;

-- Coaches follow their gym memberships, not their active gym.
drop policy if exists "gym coaches manage red_flag_entries" on public.red_flag_entries;
create policy "gym coaches manage red_flag_entries"
  on public.red_flag_entries for all
  to authenticated
  using (public.is_coach_in_gym(gym_id))
  with check (public.is_coach_in_gym(gym_id));

drop policy if exists "gym coaches manage red_flag_settings" on public.red_flag_settings;
create policy "gym coaches manage red_flag_settings"
  on public.red_flag_settings for all
  to authenticated
  using (public.is_coach_in_gym(gym_id))
  with check (public.is_coach_in_gym(gym_id));

drop policy if exists "gym coaches manage membership_holds" on public.membership_holds;
create policy "gym coaches manage membership_holds"
  on public.membership_holds for all
  to authenticated
  using (public.is_coach_in_gym(public.client_gym_id(client_id)))
  with check (public.is_coach_in_gym(public.client_gym_id(client_id)));

-- The numbers for one week (0098), with members selected by their OWN gym. Only that line changed.
create or replace function public.red_flag_week_stats(p_gym uuid, p_week_start date)
returns table (
  client_id uuid,
  name text,
  coach_id uuid,
  status text,
  attended integer,
  late_cancels integer,
  no_shows integer,
  unmarked integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  with base as (
    select
      c.id as client_id,
      c.coach_id,
      coalesce((select cp.name from client_profiles cp where cp.client_id = c.id), c.email) as name,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
      ) as has_plan,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
          and m.started_at < p_week_start and (m.ended_at is null or m.ended_at >= p_week_start)
      ) as active_all_week,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
          and m.started_at >= p_week_start
      ) as starts_in_or_after,
      exists (
        select 1 from membership_holds h
        where h.client_id = c.id and h.started_on <= p_week_start + 6 and (h.ended_on is null or h.ended_on >= p_week_start)
      ) as on_hold
    from profiles c
    where c.role = 'client'
      and p_gym is not null
      and public.client_gym_id(c.id) = p_gym
  )
  select
    b.client_id,
    b.name,
    b.coach_id,
    case
      when b.on_hold then 'hold'
      when b.active_all_week then 'covered'
      when b.starts_in_or_after then 'new'
      else 'ended'
    end as status,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'booked' and bk.attended) as attended,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'cancelled'
        and exists (select 1 from credits_ledger l where l.booking_id = bk.id and l.delta < 0)
        and not exists (select 1 from credits_ledger l where l.booking_id = bk.id and l.delta > 0)) as late_cancels,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'booked' and bk.no_show) as no_shows,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.booking_date < current_date and bk.status = 'booked' and not bk.attended and not bk.no_show) as unmarked
  from base b
  where b.has_plan;
$fn$;

revoke all on function public.red_flag_week_stats(uuid, date) from public, anon, authenticated;

-- Writes the flagged members for a completed week (0098), still never touching a row that exists. New: a signed-in caller must
-- be allowed to see the gym and may only generate the latest completed week; "the week is over" uses the gym's own calendar;
-- and the run is recorded. The daily job calls it with no signed-in user and is not restricted.
create or replace function public.generate_red_flag_week(p_gym uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_min integer;
  v_lc integer;
  v_ns integer;
  v_count integer;
  v_tz text;
begin
  if p_gym is null then
    raise exception 'Gym not found';
  end if;
  if auth.uid() is not null and not public.can_view_gym(p_gym) then
    raise exception 'Not authorized';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'A week starts on a Monday';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = p_gym;
  if v_tz is null then
    raise exception 'Gym not found';
  end if;
  if auth.uid() is not null and p_week_start is distinct from public.latest_completed_week(v_tz) then
    raise exception 'Only the most recent completed week can be generated';
  end if;
  if p_week_start + 6 >= public.local_date(v_tz) then
    return 0; -- the week is not over yet
  end if;

  select coalesce(min_attended, 2), coalesce(late_cancels, 2), coalesce(no_shows, 2)
    into v_min, v_lc, v_ns
  from (select 1) x left join red_flag_settings s on s.gym_id = p_gym;

  insert into red_flag_entries
    (gym_id, week_start, client_id, attended, late_cancels, no_shows, low_attendance, late_or_no_show, coach_id)
  select
    p_gym, p_week_start, s.client_id, s.attended, s.late_cancels, s.no_shows,
    s.attended < v_min,
    (s.late_cancels >= v_lc or s.no_shows >= v_ns),
    s.coach_id
  from public.red_flag_week_stats(p_gym, p_week_start) s
  where s.status = 'covered'
    and (s.attended < v_min or s.late_cancels >= v_lc or s.no_shows >= v_ns)
  on conflict (gym_id, week_start, client_id) do nothing;

  get diagnostics v_count = row_count;

  insert into red_flag_week_runs (gym_id, week_start) values (p_gym, p_week_start)
  on conflict (gym_id, week_start) do update set last_run_at = now();

  return v_count;
end;
$fn$;

revoke all on function public.generate_red_flag_week(uuid, date) from public, anon, authenticated;

-- What the screen loads. NEW second argument: the gym to look at (default: the caller's active gym). READ-ONLY.
-- The old one-argument version is dropped first, otherwise a call with one argument would be ambiguous.
drop function if exists public.red_flag_report(date);

create or replace function public.red_flag_report(p_week_start date, p_gym uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := coalesce(p_gym, public.my_gym_id());
  v_tz text;
  v_min integer;
  v_lc integer;
  v_ns integer;
  v_generated_at timestamptz;
  v_generated boolean;
  v_stats jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_master jsonb;
  v_weeks date[];
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can see this report';
  end if;
  -- The caller's own active gym is always allowed (as before); any other gym needs a membership there, or ownership.
  if v_gym is distinct from public.my_gym_id() and not public.can_view_gym(v_gym) then
    raise exception 'Not authorized';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'A week starts on a Monday';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_gym;

  select coalesce(min_attended, 2), coalesce(late_cancels, 2), coalesce(no_shows, 2)
    into v_min, v_lc, v_ns
  from (select 1) x left join red_flag_settings s on s.gym_id = v_gym;

  select r.generated_at into v_generated_at
  from red_flag_week_runs r where r.gym_id = v_gym and r.week_start = p_week_start;
  v_generated := v_generated_at is not null
    or exists (select 1 from red_flag_entries e where e.gym_id = v_gym and e.week_start = p_week_start);

  -- Only a generated week has a stored list; for any other week the screen says "not generated".
  if v_generated then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.status, s.name), '[]'::jsonb)
      into v_stats
    from public.red_flag_week_stats(v_gym, p_week_start) s
    where s.status <> 'covered' or s.attended < v_min or s.late_cancels >= v_lc or s.no_shows >= v_ns;

    select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
      into v_entries
    from red_flag_entries e
    where e.gym_id = v_gym and e.week_start = p_week_start;
  end if;

  -- The six weeks ending with this one, oldest first.
  select array_agg((p_week_start - 7 * g)::date order by g desc) into v_weeks from generate_series(0, 5) g;

  with weeks as (
    select unnest(v_weeks) as ws
  ),
  w as (
    select weeks.ws, s.*
    from weeks, lateral public.red_flag_week_stats(v_gym, weeks.ws) s
  ),
  flagged as (
    select distinct client_id from w where status = 'covered' and attended < v_min
  ),
  current_ok as (
    -- Active today: an ongoing plan that has not ended and no hold running now.
    select f.client_id
    from flagged f
    where exists (
      select 1 from client_memberships m join membership_packages p on p.id = m.package_id
      where m.client_id = f.client_id and p.duration_weeks is null and (m.ended_at is null or m.ended_at >= current_date)
    )
    and not exists (
      select 1 from membership_holds h
      where h.client_id = f.client_id and h.started_on <= current_date and (h.ended_on is null or h.ended_on >= current_date)
    )
  ),
  grid as (
    select
      ok.client_id,
      (select name from w where w.client_id = ok.client_id limit 1) as name,
      (select coach_id from w where w.client_id = ok.client_id limit 1) as coach_id,
      jsonb_agg(
        case when w.status = 'covered' then to_jsonb(w.attended) else 'null'::jsonb end
        order by w.ws
      ) as counts,
      coalesce(sum(case when w.status = 'covered' then w.attended end), 0) as total,
      max(case when w.ws = p_week_start and w.status = 'covered' then w.attended end) as this_week
    from current_ok ok
    join w on w.client_id = ok.client_id
    group by ok.client_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('client_id', client_id, 'name', name, 'coach_id', coach_id, 'counts', counts)
      order by coalesce(this_week, 99), total, name
    ),
    '[]'::jsonb
  )
  into v_master
  from grid;

  return jsonb_build_object(
    'gym_id', v_gym,
    'week_start', p_week_start,
    'generated', v_generated,
    'generated_at', v_generated_at,
    'latest_completed_week', public.latest_completed_week(v_tz),
    'thresholds', jsonb_build_object('min_attended', v_min, 'late_cancels', v_lc, 'no_shows', v_ns),
    'stats', v_stats,
    'entries', v_entries,
    'master', jsonb_build_object('weeks', to_jsonb(v_weeks), 'members', v_master)
  );
end;
$fn$;

revoke execute on function public.red_flag_report(date, uuid) from public, anon;
grant execute on function public.red_flag_report(date, uuid) to authenticated;

-- A gym admin (or the owner) can generate the latest completed week's list on demand, for example when the daily job has not
-- run yet. It only ever does the latest completed week, and refuses to run more than once every 10 minutes per gym.
create or replace function public.generate_latest_red_flag_week(p_gym uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := coalesce(p_gym, public.my_gym_id());
  v_tz text;
  v_week date;
  v_created integer;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Not authorized';
  end if;
  if not (coalesce(public.is_admin_of_gym(v_gym), false) or coalesce(public.is_owner_of_gym(v_gym), false)) then
    raise exception 'Only a gym admin can do this';
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_gym;
  if v_tz is null then
    raise exception 'Gym not found';
  end if;
  v_week := public.latest_completed_week(v_tz);

  if exists (
    select 1 from red_flag_week_runs r
    where r.gym_id = v_gym and r.week_start = v_week and r.last_run_at > now() - interval '10 minutes'
  ) then
    raise exception 'This list was generated a moment ago. Try again in a few minutes.';
  end if;

  v_created := public.generate_red_flag_week(v_gym, v_week);
  return jsonb_build_object('gym_id', v_gym, 'week_start', v_week, 'created', v_created);
end;
$fn$;

revoke execute on function public.generate_latest_red_flag_week(uuid) from public, anon;
grant execute on function public.generate_latest_red_flag_week(uuid) to authenticated;

-- =====================================================================================================================
-- CL4. A red flag entry could name any coach, and holds could overlap.
--  * red_flag_entries.coach_id (the "follow-up coach" the team picks) is now checked: the coach must work at the entry's
--    gym. On insert by a signed-in coach the member must also belong to that gym, and an entry's gym, member and week can
--    never be changed afterwards. The daily job (no signed-in user) is not restricted, and an existing entry whose coach
--    is no longer at the gym can still have its other fields saved (the coach is only checked when it changes).
--  * membership_holds: two holds for one member cannot overlap (an open-ended hold counts as running forever). This is a
--    trigger rather than an exclusion constraint so that existing overlapping rows, if any, do not block the migration.
--    A per-member lock stops two simultaneous inserts getting past each other.
--
-- PRE-FLIGHT (read-only; existing overlaps, which this migration leaves alone but new writes will not add to):
--   select a.client_id, a.id as hold_a, b.id as hold_b
--   from public.membership_holds a
--   join public.membership_holds b on b.client_id = a.client_id and b.id > a.id
--    and a.started_on <= coalesce(b.ended_on, 'infinity'::date) and b.started_on <= coalesce(a.ended_on, 'infinity'::date);
-- And entries that already name a coach from another gym (informational):
--   select e.id, e.gym_id, e.coach_id from public.red_flag_entries e
--   where e.coach_id is not null
--     and not exists (select 1 from public.coach_gym_memberships m where m.coach_id = e.coach_id and m.gym_id = e.gym_id);
-- =====================================================================================================================
create or replace function public.red_flag_entry_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.gym_id is distinct from old.gym_id
       or new.client_id is distinct from old.client_id
       or new.week_start is distinct from old.week_start then
      raise exception 'The gym, member and week of a red flag entry cannot be changed';
    end if;
  else
    if public.client_gym_id(new.client_id) is distinct from new.gym_id then
      raise exception 'That member belongs to a different gym.';
    end if;
  end if;

  if new.coach_id is not null and (tg_op = 'INSERT' or new.coach_id is distinct from old.coach_id) then
    if not exists (
      select 1 from coach_gym_memberships m where m.coach_id = new.coach_id and m.gym_id = new.gym_id
    ) then
      raise exception 'That coach does not work at this gym.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.red_flag_entry_rules() from public, anon, authenticated;

drop trigger if exists red_flag_entry_rules on public.red_flag_entries;
create trigger red_flag_entry_rules
  before insert or update on public.red_flag_entries
  for each row execute function public.red_flag_entry_rules();

create or replace function public.membership_hold_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('membership_holds:' || new.client_id::text));

  if exists (
    select 1 from membership_holds h
    where h.client_id = new.client_id
      and h.id is distinct from new.id
      and h.started_on <= coalesce(new.ended_on, 'infinity'::date)
      and new.started_on <= coalesce(h.ended_on, 'infinity'::date)
  ) then
    raise exception 'This member already has a hold that overlaps those dates.';
  end if;

  return new;
end;
$$;

revoke execute on function public.membership_hold_rules() from public, anon, authenticated;

drop trigger if exists membership_hold_rules on public.membership_holds;
create trigger membership_hold_rules
  before insert or update of started_on, ended_on, client_id on public.membership_holds
  for each row execute function public.membership_hold_rules();

-- =====================================================================================================================
-- CM6 (SQL part). Owner statistics used the database's UTC date.
-- owner_gym_stats used current_date for "this month", "this week", "the last 30 days" and "ending in 14 days", so near midnight
-- a gym ahead of or behind UTC (Pacific/Auckland is 12 to 13 hours ahead) counted the wrong day. Every date is now that
-- gym's own calendar date (public.local_date, above), worked out once per gym. owner_activity_report takes the timezone from
-- the gym when one gym is asked for; for "all gyms" it still uses the p_tz the caller passes (the screen sends the organisation's
-- default). Only the date handling changed; the numbers and the shape of the answer are the same.
--
-- PRE-FLIGHT (read-only; the timezones the statistics will use):
--   select name, timezone from public.gyms where organisation_id is not null;
-- =====================================================================================================================
create or replace function public.owner_gym_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;

  return coalesce((
    select jsonb_agg(q.stat order by q.name)
    from (
      select
        g.name,
        jsonb_build_object(
          'gymId', g.id,
          'members', (select count(*) from profiles m where m.role = 'client' and m.gym_id = g.id),
          'onPlan', (
            select count(*) from profiles m
            where m.role = 'client' and m.gym_id = g.id
              and exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at is null)
          ),
          'newThisMonth', (select count(*) from profiles m where m.role = 'client' and m.gym_id = g.id and (m.created_at at time zone d.tz)::date >= d.month),
          'leftLast30', (
            select count(*) from profiles m
            where m.role = 'client' and m.gym_id = g.id
              and not exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at is null)
              and exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at >= d.d30)
          ),
          'endingSoon', (
            select count(*) from client_memberships cm
            join profiles m on m.id = cm.client_id
            where m.gym_id = g.id and cm.ended_at is null and cm.scheduled_end between d.today and d.in14
          ),
          'attendedThisMonth', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.attended and b.booking_date >= d.month
          ),
          'attendedLastMonth', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.attended and b.booking_date >= d.prev and b.booking_date < d.month
          ),
          'unmarkedSessions', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.status = 'booked' and not b.attended and not b.no_show and b.booking_date < d.today
          ),
          'plans', coalesce((
            select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.c) order by x.c desc, x.name)
            from (
              select p.name, count(*) as c
              from client_memberships cm
              join membership_packages p on p.id = cm.package_id
              join profiles m on m.id = cm.client_id
              where cm.ended_at is null and m.gym_id = g.id
              group by p.name
            ) x
          ), '[]'::jsonb),
          'redFlags', (
            select jsonb_build_object('weekStart', e.week_start, 'flagged', e.flagged, 'waiting', e.waiting)
            from (
              select week_start, count(*) as flagged, count(*) filter (where contacted = 'no') as waiting
              from red_flag_entries
              where gym_id = g.id and week_start = (select max(week_start) from red_flag_entries where gym_id = g.id)
              group by week_start
            ) e
          ),
          'team', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'coachId', c.id,
                'name', coalesce(nullif(c.display_name, ''), c.email),
                'isAdmin', cgm.is_gym_admin,
                'members', t.members,
                'eligible', t.eligible,
                'checkedIn', t.checked_in,
                'quiet', t.quiet,
                'toReview', t.to_review
              )
              order by t.members desc, coalesce(nullif(c.display_name, ''), c.email)
            )
            from coach_gym_memberships cgm
            join profiles c on c.id = cgm.coach_id
            cross join lateral (
              select
                count(*) as members,
                count(*) filter (where cp.onboarding_completed_at is not null) as eligible,
                count(*) filter (where cp.onboarding_completed_at is not null and l.last_log >= d.week) as checked_in,
                count(*) filter (where cp.onboarding_completed_at is not null and (l.last_log is null or l.last_log <= d.today - 7)) as quiet,
                count(*) filter (where cp.needs_coach_review) as to_review
              from profiles m
              left join client_profiles cp on cp.client_id = m.id
              left join lateral (
                select max(dl.log_date) as last_log
                from daily_logs dl
                where dl.client_id = m.id and dl.log_date >= d.d14
                  and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.water is not null
                       or dl.bodyweight is not null or dl.steps is not null or dl.sleep is not null)
              ) l on true
              where m.role = 'client' and m.coach_id = c.id and m.gym_id = g.id
            ) t
            where cgm.gym_id = g.id
          ), '[]'::jsonb)
        ) as stat
      from gyms g
      cross join lateral (
        select coalesce(nullif(g.timezone, ''), 'UTC') as tz, public.local_date(g.timezone) as today
      ) l0
      cross join lateral (
        select
          l0.tz,
          l0.today,
          date_trunc('month', l0.today::timestamp)::date as month,
          (date_trunc('month', l0.today::timestamp) - interval '1 month')::date as prev,
          date_trunc('week', l0.today::timestamp)::date as week,
          l0.today - 30 as d30,
          l0.today - 14 as d14,
          l0.today + 14 as in14
      ) d
      where g.organisation_id = public.my_org_id()
    ) q
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.owner_activity_report(p_gym uuid default null, p_weeks integer default 12, p_tz text default 'Europe/London')
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tz text := coalesce(nullif(p_tz, ''), 'Europe/London');
  v_today date;
  v_weeks integer := greatest(1, least(coalesce(p_weeks, 12), 52));
  v_this_week date;
  v_from date;
  v_from_all date;
  v_eligible integer;
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;
  if p_gym is not null and not public.is_owner_of_gym(p_gym) then
    raise exception 'Not authorized';
  end if;

  -- One gym: that gym's own calendar. All gyms: the timezone the caller passes.
  if p_gym is not null then
    v_tz := coalesce(nullif((select timezone from gyms where id = p_gym), ''), v_tz);
  end if;
  perform now() at time zone v_tz; -- raises for a name that is not a real timezone

  v_today := public.local_date(v_tz);
  v_this_week := date_trunc('week', v_today::timestamp)::date;
  v_from := v_this_week - (v_weeks - 1) * 7;
  -- the weekday averages always look at the last 8 complete weeks, whatever p_weeks is
  v_from_all := least(v_from, v_this_week - 56, v_today - 27);

  drop table if exists _members;
  drop table if exists _checkins;
  drop table if exists _msgs;

  create temporary table _members on commit drop as
    select m.id as client_id, m.coach_id
    from profiles m
    join client_profiles cp on cp.client_id = m.id
    where m.role = 'client'
      and cp.onboarding_completed_at is not null
      and m.gym_id in (
        select g.id from gyms g
        where g.organisation_id = public.my_org_id() and (p_gym is null or g.id = p_gym)
      );

  select count(*) into v_eligible from _members;

  create temporary table _checkins on commit drop as
    select distinct d.client_id, d.log_date
    from daily_logs d
    join _members m on m.client_id = d.client_id
    where d.log_date >= v_from_all and d.log_date <= v_today
      and (d.protein is not null or d.carbs is not null or d.fat is not null or d.water is not null
           or d.bodyweight is not null or d.steps is not null or d.sleep is not null);

  create temporary table _msgs on commit drop as
    select
      (cm.created_at at time zone v_tz)::date as day,
      cm.client_id,
      cm.sender_id,
      (cm.sender_id = cm.client_id) as from_member
    from chat_messages cm
    join _members m on m.client_id = cm.client_id
    where cm.created_at >= (v_from_all::timestamp at time zone v_tz);

  select jsonb_build_object(
    'members', v_eligible,
    'perDay', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', s.d,
        'checkIns', coalesce(c.n, 0),
        'pct', case when v_eligible = 0 then 0 else round(100.0 * coalesce(c.n, 0) / v_eligible)::int end
      ) order by s.d)
      from generate_series(v_today - 27, v_today, interval '1 day') as g(ts)
      cross join lateral (select g.ts::date as d) s
      left join (select log_date, count(*) as n from _checkins group by log_date) c on c.log_date = s.d
    ), '[]'::jsonb),
    'perWeek', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekStart', w.d,
        'checkIns', coalesce(x.days, 0),
        'activeMembers', coalesce(x.members, 0),
        'pct', case when v_eligible = 0 then 0 else round(100.0 * coalesce(x.members, 0) / v_eligible)::int end,
        'coachMessages', coalesce(mm.coach_msgs, 0),
        'memberMessages', coalesce(mm.member_msgs, 0)
      ) order by w.d)
      from generate_series(v_from, v_this_week, interval '7 days') as g(ts)
      cross join lateral (select g.ts::date as d) w
      left join lateral (
        select count(*) as days, count(distinct client_id) as members
        from _checkins where log_date >= w.d and log_date < w.d + 7
      ) x on true
      left join lateral (
        select count(*) filter (where not from_member) as coach_msgs, count(*) filter (where from_member) as member_msgs
        from _msgs where day >= w.d and day < w.d + 7
      ) mm on true
    ), '[]'::jsonb),
    'byWeekday', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dow', dw.dow,
        'avgPct', case when v_eligible = 0 then 0 else round(100.0 * coalesce(x.n, 0) / (8 * v_eligible))::int end
      ) order by dw.dow)
      from generate_series(1, 7) as dw(dow)
      left join lateral (
        select count(*) as n from _checkins
        where log_date >= v_this_week - 56 and log_date < v_this_week and extract(isodow from log_date)::int = dw.dow
      ) x on true
    ), '[]'::jsonb),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', c.id,
        'name', coalesce(nullif(c.display_name, ''), c.email),
        'members', t.members,
        'sent30', coalesce(ms.sent, 0),
        'membersMessaged30', coalesce(ms.people, 0),
        'checkedInThisWeek', t.checked_in
      ) order by t.members desc, coalesce(nullif(c.display_name, ''), c.email))
      from profiles c
      cross join lateral (
        select count(*) as members,
               count(*) filter (where exists (select 1 from _checkins k where k.client_id = m.client_id and k.log_date >= v_this_week)) as checked_in
        from _members m where m.coach_id = c.id
      ) t
      left join lateral (
        select count(*) as sent, count(distinct client_id) as people
        from _msgs where sender_id = c.id and not from_member and day > v_today - 30
      ) ms on true
      where c.role = 'coach' and (t.members > 0 or coalesce(ms.sent, 0) > 0)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

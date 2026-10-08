-- Red Flag report (SOP "At Risk Reporting" / "Weekly Red Flag Tracker"), replacing the Google Sheet.
--
-- For a completed Monday-to-Sunday week it lists the gym's full members who
--   * attended fewer than 2 classes (low attendance), or
--   * had 2 or more late cancels, or 2 or more no-shows,
-- leaving out new starters (joined during or after the week), members on hold at any point that week, and members
-- whose membership had already ended. "Full member" means an ongoing plan, not a fixed-length challenge.
-- The team then records Contact made, Reason, Red flag tier and Coach against each name; those notes are saved per
-- week and never overwritten. A six-week grid ("MASTER") shows members flagged for low attendance recently.
--
-- A late cancel is a booking that was cancelled and whose credit was NOT given back (a cancel inside the cut-off,
-- or a coach removal without a refund). Thresholds (2, 2, 2) are editable per gym.

-- ---- membership holds ------------------------------------------------------------------------------------
create table if not exists membership_holds (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  started_on date not null,
  ended_on date,
  note text,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

create index if not exists membership_holds_client_idx on membership_holds (client_id);

alter table membership_holds enable row level security;

drop policy if exists "gym coaches manage membership_holds" on membership_holds;
create policy "gym coaches manage membership_holds"
  on membership_holds for all
  using (public.client_gym_id(client_id) = public.my_gym_id())
  with check (public.client_gym_id(client_id) = public.my_gym_id());

-- ---- thresholds ------------------------------------------------------------------------------------------
create table if not exists red_flag_settings (
  gym_id uuid primary key references gyms(id) on delete cascade,
  min_attended integer not null default 2 check (min_attended >= 1),
  late_cancels integer not null default 2 check (late_cancels >= 1),
  no_shows integer not null default 2 check (no_shows >= 1)
);

alter table red_flag_settings enable row level security;

drop policy if exists "gym coaches manage red_flag_settings" on red_flag_settings;
create policy "gym coaches manage red_flag_settings"
  on red_flag_settings for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ---- one row per flagged member per week, plus the team's notes --------------------------------------------
create table if not exists red_flag_entries (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id) on delete cascade,
  week_start date not null,
  client_id uuid not null references profiles(id) on delete cascade,
  attended integer not null default 0,
  late_cancels integer not null default 0,
  no_shows integer not null default 0,
  low_attendance boolean not null default false,
  late_or_no_show boolean not null default false,
  contacted text not null default 'no' check (contacted in ('no', 'yes', 'na')),
  reason text,
  tier text check (tier in ('red', 'amber', 'green')),
  coach_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, week_start, client_id)
);

create index if not exists red_flag_entries_week_idx on red_flag_entries (gym_id, week_start);

alter table red_flag_entries enable row level security;

drop policy if exists "gym coaches manage red_flag_entries" on red_flag_entries;
create policy "gym coaches manage red_flag_entries"
  on red_flag_entries for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ---- the numbers for one week ------------------------------------------------------------------------------
-- status: 'covered' (counts), 'new' (joined during or after the week), 'hold', 'ended'. Clients with no ongoing
-- plan at all are not returned.
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
      and exists (select 1 from profiles coach where coach.id = c.coach_id and coach.gym_id = p_gym)
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

-- Writes the flagged members for a completed week. Never touches a row that already exists, so the team's notes
-- are safe, and running it again changes nothing.
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
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'A week starts on a Monday';
  end if;
  if p_week_start + 6 >= current_date then
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
  return v_count;
end;
$fn$;

revoke all on function public.generate_red_flag_week(uuid, date) from public, anon, authenticated;

-- ---- what the screen loads -----------------------------------------------------------------------------------
create or replace function public.red_flag_report(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_min integer;
  v_lc integer;
  v_ns integer;
  v_stats jsonb;
  v_entries jsonb;
  v_master jsonb;
  v_weeks date[];
begin
  if v_gym is null or auth.uid() is null then
    raise exception 'Only a coach can see this report';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'A week starts on a Monday';
  end if;

  perform public.generate_red_flag_week(v_gym, p_week_start);

  select coalesce(min_attended, 2), coalesce(late_cancels, 2), coalesce(no_shows, 2)
    into v_min, v_lc, v_ns
  from (select 1) x left join red_flag_settings s on s.gym_id = v_gym;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.status, s.name), '[]'::jsonb)
    into v_stats
  from public.red_flag_week_stats(v_gym, p_week_start) s
  where s.status <> 'covered' or s.attended < v_min or s.late_cancels >= v_lc or s.no_shows >= v_ns;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    into v_entries
  from red_flag_entries e
  where e.gym_id = v_gym and e.week_start = p_week_start;

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
    'week_start', p_week_start,
    'thresholds', jsonb_build_object('min_attended', v_min, 'late_cancels', v_lc, 'no_shows', v_ns),
    'stats', v_stats,
    'entries', v_entries,
    'master', jsonb_build_object('weeks', to_jsonb(v_weeks), 'members', v_master)
  );
end;
$fn$;

grant execute on function public.red_flag_report(date) to authenticated;

-- Used by the daily job: writes last week's list for every gym (the gym's own Monday-to-Sunday week).
create or replace function public.generate_all_red_flag_weeks()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym record;
  v_total integer := 0;
  v_last_monday date;
begin
  if auth.uid() is not null then
    raise exception 'Not authorized';
  end if;
  for v_gym in select id, coalesce(timezone, 'UTC') as tz from gyms loop
    -- The Monday of the last completed week, in the gym's own timezone.
    v_last_monday := (date_trunc('week', (now() at time zone v_gym.tz)::date::timestamp) - interval '7 days')::date;
    v_total := v_total + public.generate_red_flag_week(v_gym.id, v_last_monday);
  end loop;
  return v_total;
end;
$fn$;

revoke all on function public.generate_all_red_flag_weeks() from public, anon, authenticated;

-- Red flags (live review decisions of 11 Nov 2026): D12 low attendance against each member's own weekly credits, and D5 challenge members
-- on the list (CS26, RO6, RO3).
--
-- Three functions change. Nothing else (no table, column, policy or grant) changes, and lists already written are never touched.
--
-- 1. red_flag_week_stats (last defined in migration 0132): one row per member of the gym with a plan, for one week.
--    Before: only ongoing plans counted (membership_packages.duration_weeks is null), so the 6 Week Challenge members were never on the list.
--    After (D5): every plan counts, challenges included. NEW last column weekly_credits: credits_per_week of the plan the member was on at
--      the start of the week (the same plan that makes them 'covered'; empty when they were not covered). Adding a column changes the
--      function's return type, so it is dropped and created again; it was never callable by signed-in users (revoked in 0129 and 0132) and
--      is re-revoked below. Its callers, generate_red_flag_week and red_flag_report, are redefined below in the same run.
-- 2. generate_red_flag_week (last defined in migration 0129): writes a finished week's list (the Monday cron, or a gym admin's "Write the
--    list now"; opening the Red flags tab only reads, as since 0129).
--    Before: low attendance = attended fewer than one gym-wide number (red_flag_settings.min_attended, 2 when unset). A 1-a-week member was
--      flagged every week, and a 4-a-week member who dropped to 2 never was.
--    After (D12): low attendance = attended under half the member's weekly credits (attended * 2 < weekly_credits): 0 of 1, 0-1 of 3,
--      0-1 of 4, 0-2 of 6, 0-3 of 8. A plan with 0 weekly credits is never low. Late cancels and no-shows keep the gym's numbers.
--      red_flag_settings.min_attended is no longer read by anything; the column stays.
-- 3. red_flag_report (last defined in migration 0129): what the Red flags tab loads. Same rule for "who is listed" and for the six-week
--    grid, which now includes challenge members too. NEW: each stats row carries weekly_credits; each grid member carries "lows" (true
--    for a week they were under half) and weekly_credits (their latest covered week's); and low_rule
--   ('half_weekly_credits') tells the screen which rule to describe. Everything else it returns is unchanged.
--
-- Guard: before changing anything, the migration checks the three live functions are the ones from 0132 and 0129 (or already this file's),
-- comparing their bodies with spaces and line breaks squeezed out. If any has been changed some other way since, nothing is changed and it
-- stops with "... is not the one from migration ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('red_flag_week_stats', 'generate_red_flag_week', 'red_flag_report') order by 1;
-- Expected before: generate_red_flag_week 3975a1fee329cd672c7a28f9334be1ee (0129), red_flag_report eec2f286154b7bd63eb770a933b7c3ad (0129),
-- red_flag_week_stats 7551470e1e68f1a21d52dd9b0df7f3cd (0132).
--
--   -- Who was flagged for low attendance in the last finished week at each gym under the old rule (one row per member):
--   select g.name as gym, s.name as member, s.attended, coalesce(r.min_attended, 2) as old_min
--   from gyms g
--   left join red_flag_settings r on r.gym_id = g.id
--   cross join lateral public.red_flag_week_stats(g.id, public.latest_completed_week(coalesce(nullif(g.timezone, ''), 'UTC'))) s
--   where s.status = 'covered' and s.attended < coalesce(r.min_attended, 2)
--   order by 1, 2;
--   -- And the challenge members it leaves out today (expected on 12 Nov: the 3 on "6 Week Challenge"):
--   select p.name as plan, count(*) from client_memberships m join membership_packages p on p.id = m.package_id
--   where m.ended_at is null and p.duration_weeks is not null group by 1;
--
-- AFTER (read-only):
--   The md5 query above. Expected after: generate_red_flag_week 265948142eece1d3827b7474ff663037, red_flag_report
--   27e273e877e48c261308901a8678e7de, red_flag_week_stats 600f3b9310cf77e4b903e7d6b38cbf1b.
--   -- The same week under the new rule (challenge members included, each against their own plan):
--   select g.name as gym, s.name as member, s.attended, s.weekly_credits, s.attended * 2 < s.weekly_credits as low_now
--   from gyms g
--   cross join lateral public.red_flag_week_stats(g.id, public.latest_completed_week(coalesce(nullif(g.timezone, ''), 'UTC'))) s
--   where s.status = 'covered'
--   order by 1, 5 desc, 2;
--   -- Nobody can call the stats function from the app (it was revoked before and is again):
--   select has_function_privilege('authenticated', 'public.red_flag_week_stats(uuid, date)', 'execute') as members_can_run;
-- Expected: false.
--   The list already written for that week is not changed. The first list written with the new rule is the week of 9 Nov, by the cron on
--   Monday 16 Nov (or "Write the list now" by a gym admin after that Monday). Then Classes → Red flags: "Low attendance" reads "Attended
--   under half their weekly credits", and each row says "1 of 6 a week".
--
-- REVERSE: drop function public.red_flag_week_stats(uuid, date); then run red_flag_week_stats' definition and its revoke from migration
-- 0132 again, and generate_red_flag_week's and red_flag_report's definitions from migration 0129 again (each from its "create or replace
-- function" line to its closing delimiter). The screen reads both shapes.
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_stats text;
  v_generate text;
  v_report text;
begin
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_stats
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'red_flag_week_stats';
  if v_stats is null or v_stats not in ('7551470e1e68f1a21d52dd9b0df7f3cd', '600f3b9310cf77e4b903e7d6b38cbf1b') then
    raise exception 'red_flag_week_stats is not the one from migration 0132 (body md5 %), so nothing was changed.', coalesce(v_stats, 'missing');
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_generate
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'generate_red_flag_week';
  if v_generate is null or v_generate not in ('3975a1fee329cd672c7a28f9334be1ee', '265948142eece1d3827b7474ff663037') then
    raise exception 'generate_red_flag_week is not the one from migration 0129 (body md5 %), so nothing was changed.', coalesce(v_generate, 'missing');
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_report
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'red_flag_report';
  if v_report is null or v_report not in ('eec2f286154b7bd63eb770a933b7c3ad', '27e273e877e48c261308901a8678e7de') then
    raise exception 'red_flag_report is not the one from migration 0129 (body md5 %), so nothing was changed.', coalesce(v_report, 'missing');
  end if;
end
$guard$;

-- ---- 1. red_flag_week_stats: every plan, plus the member's weekly credits ----

drop function if exists public.red_flag_week_stats(uuid, date);

create function public.red_flag_week_stats(p_gym uuid, p_week_start date)
returns table (
  client_id uuid,
  name text,
  coach_id uuid,
  status text,
  attended integer,
  late_cancels integer,
  no_shows integer,
  unmarked integer,
  weekly_credits integer
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
        where m.client_id = c.id
      ) as has_plan,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id
          and m.started_at < p_week_start and (m.ended_at is null or m.ended_at >= p_week_start)
      ) as active_all_week,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id
          and m.started_at >= p_week_start
      ) as starts_in_or_after,
      exists (
        select 1 from membership_holds h
        where h.client_id = c.id and h.started_on <= p_week_start + 6 and (h.ended_on is null or h.ended_on >= p_week_start)
      ) as on_hold,
      (
        select p.credits_per_week from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id
          and m.started_at < p_week_start and (m.ended_at is null or m.ended_at >= p_week_start)
        order by m.started_at desc
        limit 1
      ) as weekly_credits
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
        and not exists (select 1 from credits_ledger l where l.booking_id = bk.id and l.delta >= 0)) as late_cancels,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'booked' and bk.no_show) as no_shows,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.booking_date < current_date and bk.status = 'booked' and not bk.attended and not bk.no_show) as unmarked,
    b.weekly_credits
  from base b
  where b.has_plan;
$fn$;

revoke all on function public.red_flag_week_stats(uuid, date) from public, anon, authenticated;

-- ---- 2. generate_red_flag_week: low attendance = under half the member's weekly credits ----

create or replace function public.generate_red_flag_week(p_gym uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
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

  select coalesce(late_cancels, 2), coalesce(no_shows, 2)
    into v_lc, v_ns
  from (select 1) x left join red_flag_settings s on s.gym_id = p_gym;

  -- Low attendance: attended under half the weekly credits of the plan the member was on (D12). A 0-credit plan is never low.
  insert into red_flag_entries
    (gym_id, week_start, client_id, attended, late_cancels, no_shows, low_attendance, late_or_no_show, coach_id)
  select
    p_gym, p_week_start, s.client_id, s.attended, s.late_cancels, s.no_shows,
    coalesce(s.attended * 2 < s.weekly_credits, false),
    (s.late_cancels >= v_lc or s.no_shows >= v_ns),
    s.coach_id
  from public.red_flag_week_stats(p_gym, p_week_start) s
  where s.status = 'covered'
    and (coalesce(s.attended * 2 < s.weekly_credits, false) or s.late_cancels >= v_lc or s.no_shows >= v_ns)
  on conflict (gym_id, week_start, client_id) do nothing;

  get diagnostics v_count = row_count;

  insert into red_flag_week_runs (gym_id, week_start) values (p_gym, p_week_start)
  on conflict (gym_id, week_start) do update set last_run_at = now();

  return v_count;
end;
$fn$;

revoke all on function public.generate_red_flag_week(uuid, date) from public, anon, authenticated;

-- ---- 3. red_flag_report: the same rule on screen and in the six-week grid; challenge members included ----

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

  -- min_attended is no longer used to flag anyone (0159); it is still returned so older screens keep working.
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
    where s.status <> 'covered' or coalesce(s.attended * 2 < s.weekly_credits, false) or s.late_cancels >= v_lc or s.no_shows >= v_ns;

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
    select weeks.ws, s.*, (s.status = 'covered' and coalesce(s.attended * 2 < s.weekly_credits, false)) as low
    from weeks, lateral public.red_flag_week_stats(v_gym, weeks.ws) s
  ),
  flagged as (
    select distinct client_id from w where low
  ),
  current_ok as (
    -- Active today: a plan (ongoing or challenge) that has not ended and no hold running now.
    select f.client_id
    from flagged f
    where exists (
      select 1 from client_memberships m join membership_packages p on p.id = m.package_id
      where m.client_id = f.client_id and (m.ended_at is null or m.ended_at >= current_date)
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
      (select w2.weekly_credits from w w2 where w2.client_id = ok.client_id and w2.status = 'covered' order by w2.ws desc limit 1) as weekly_credits,
      jsonb_agg(
        case when w.status = 'covered' then to_jsonb(w.attended) else 'null'::jsonb end
        order by w.ws
      ) as counts,
      jsonb_agg(w.low order by w.ws) as lows,
      coalesce(sum(case when w.status = 'covered' then w.attended end), 0) as total,
      max(case when w.ws = p_week_start and w.status = 'covered' then w.attended end) as this_week
    from current_ok ok
    join w on w.client_id = ok.client_id
    group by ok.client_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'client_id', client_id, 'name', name, 'coach_id', coach_id, 'counts', counts, 'lows', lows, 'weekly_credits', weekly_credits
      )
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
    'low_rule', 'half_weekly_credits',
    'stats', v_stats,
    'entries', v_entries,
    'master', jsonb_build_object('weeks', to_jsonb(v_weeks), 'members', v_master)
  );
end;
$fn$;

revoke execute on function public.red_flag_report(date, uuid) from public, anon;
grant execute on function public.red_flag_report(date, uuid) to authenticated;

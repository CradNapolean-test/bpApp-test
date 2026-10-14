-- Owner reports: check-ins and coach messages over time, for one gym or all of the owner's gyms.
-- Aggregates only (counts), no message text and no member names beyond the coach table. Owners only.
-- Needs 0103.
--
-- A "check-in" is a day on which a member logged anything on their daily check-in (food, water, weight,
-- steps or sleep), the same measure the Overview's "Logged this week" uses. "Members" are the people who
-- finished onboarding in the chosen gym(s) today, so percentages are check-ins / those members.
-- Days and weeks are in p_tz (the gyms' timezone), weeks start on Monday.

create or replace function public.owner_activity_report(
  p_gym uuid default null,
  p_weeks integer default 12,
  p_tz text default 'Europe/London'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_weeks integer := greatest(1, least(coalesce(p_weeks, 12), 52));
  v_this_week date := date_trunc('week', (now() at time zone p_tz))::date;
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
      (cm.created_at at time zone p_tz)::date as day,
      cm.client_id,
      cm.sender_id,
      (cm.sender_id = cm.client_id) as from_member
    from chat_messages cm
    join _members m on m.client_id = cm.client_id
    where cm.created_at >= (v_from_all::timestamp at time zone p_tz);

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

revoke execute on function public.owner_activity_report(uuid, integer, text) from public, anon;
grant execute on function public.owner_activity_report(uuid, integer, text) to authenticated;

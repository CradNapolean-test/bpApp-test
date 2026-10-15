-- Owner report numbers and the gym referral link setting (fix brief 08, R30, R16). Apply after 0129 and 0138 (and after 0142 if you are
-- applying that one too).
--
-- Both report functions below are the 0129 versions with extra fields; everything they returned before is unchanged, so the owner
-- screens that do not know the new fields keep working.
--
--  owner_gym_stats  adds   attendedLastMonthToDate  last month's attended bookings up to the same day of the month as today
--                                                    (so 'this month so far' is compared with the same days last month)
--                          dayOfMonth               today's day of the month in the gym's own calendar
--                          onboarded                members who finished onboarding (the Overview's 'Members' counts every client row)
--  owner_activity_report  adds  allMembers          every member of the gym(s), to show beside the onboarded count the report uses
--                         today                     the gym's calendar date (the screen labels 'so far this week' from it)
--                         weekdayWeeks              how many complete weeks the weekday averages cover (1 to 8)
--                         and changes byWeekday.avgPct: it was divided by 8 complete weeks whatever the history, so a gym that began
--                         logging three weeks ago looked quiet. It is now divided by the complete weeks since each gym's first
--                         check-in (never more than 8). A gym with no check-in yet contributes nothing.
--
-- R16 (admin field): gyms.referral_url (0138) had no way to be set from the app, and nobody can update the gyms table directly. Three new
-- functions: set_gym_referral_url(url) for a gym admin of their own gym, owner_set_gym_referral_url(gym, url) for the owner of the gym's
-- organisation, and the internal _set_gym_referral_url they share. An empty value clears it; anything else must be an https address of at
-- most 500 characters (the column's own check says the same).
--
-- PRE-FLIGHT (read-only; nothing is rejected, this only shows what changes):
--   select g.name, min(d.log_date) as first_checkin
--   from public.gyms g
--   join public.profiles m on m.gym_id = g.id and m.role = 'client'
--   join public.daily_logs d on d.client_id = m.id
--   where g.organisation_id is not null group by g.name;
-- Re-runnable.

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
          'attendedLastMonthToDate', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.attended and b.booking_date >= d.prev
              and b.booking_date <= least(d.prev + (extract(day from d.today)::int - 1), d.month - 1)
          ),
          'dayOfMonth', extract(day from d.today)::int,
          'onboarded', (
            select count(*) from profiles m join client_profiles cp on cp.client_id = m.id
            where m.role = 'client' and m.gym_id = g.id and cp.onboarding_completed_at is not null
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
  drop table if exists _gym_start;

  create temporary table _members on commit drop as
    select m.id as client_id, m.coach_id, m.gym_id
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

  -- Where each gym's weekday averages start: the Monday of its first check-in, but never more than 8 weeks back. A gym that began
  -- logging three weeks ago is averaged over 3 weeks, not 8 (the five weeks before anyone logged anything are not 'quiet' weeks).
  create temporary table _gym_start on commit drop as
    select m.gym_id,
           count(distinct m.client_id) as members,
           greatest(v_this_week - 56, date_trunc('week', min(d.log_date)::timestamp)::date) as start_week
    from _members m
    join daily_logs d on d.client_id = m.client_id
    where d.log_date <= v_today
      and (d.protein is not null or d.carbs is not null or d.fat is not null or d.water is not null
           or d.bodyweight is not null or d.steps is not null or d.sleep is not null)
    group by m.gym_id;

  select jsonb_build_object(
    'members', v_eligible,
    'allMembers', (
      select count(*) from profiles m
      where m.role = 'client'
        and m.gym_id in (select g.id from gyms g where g.organisation_id = public.my_org_id() and (p_gym is null or g.id = p_gym))
    ),
    'today', v_today,
    'weekdayWeeks', coalesce((select max((v_this_week - start_week) / 7) from _gym_start), 0),
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
        'avgPct', case
          when coalesce((select sum(members * ((v_this_week - start_week) / 7)) from _gym_start), 0) = 0 then 0
          else round(100.0 * coalesce(x.n, 0) / (select sum(members * ((v_this_week - start_week) / 7)) from _gym_start))::int
        end
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

revoke execute on function public.owner_gym_stats() from public, anon;
revoke execute on function public.owner_activity_report(uuid, integer, text) from public, anon;
grant execute on function public.owner_gym_stats() to authenticated;
grant execute on function public.owner_activity_report(uuid, integer, text) to authenticated;

-- ---- R16: the referral link setting ----
create or replace function public._set_gym_referral_url(p_gym uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_url is not null and v_url !~* '^https://[^[:space:]]+$' then
    raise exception 'The referral link must start with https:// and have no spaces';
  end if;
  if v_url is not null and char_length(v_url) > 500 then
    raise exception 'The referral link can be at most 500 characters';
  end if;
  update gyms set referral_url = v_url where id = p_gym;
  if not found then
    raise exception 'Gym not found';
  end if;
end;
$$;

revoke execute on function public._set_gym_referral_url(uuid, text) from public, anon, authenticated;

create or replace function public.set_gym_referral_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_gym_id() is null
     or not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_referral_url(public.my_gym_id(), p_url);
end;
$$;

create or replace function public.owner_set_gym_referral_url(p_gym uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_referral_url(p_gym, p_url);
end;
$$;

revoke execute on function public.set_gym_referral_url(text) from public, anon;
revoke execute on function public.owner_set_gym_referral_url(uuid, text) from public, anon;
grant execute on function public.set_gym_referral_url(text) to authenticated;
grant execute on function public.owner_set_gym_referral_url(uuid, text) to authenticated;

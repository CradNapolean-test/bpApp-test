-- Owner side, phase 2: the numbers behind the owner's Overview, one row of figures per gym in the owner's
-- organisation. Read-only, security definer, owners only. Mirrors the gym admin's Business overview
-- (getBusinessOverview) so both screens agree, plus unmarked sessions and the latest red flag week.
-- Needs 0103.

create or replace function public.owner_gym_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_today date := current_date;
  v_month date := date_trunc('month', current_date)::date;
  v_prev date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_week date := date_trunc('week', current_date)::date;
  v_30 date := current_date - 30;
  v_14 date := current_date - 14;
  v_in14 date := current_date + 14;
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
          'newThisMonth', (select count(*) from profiles m where m.role = 'client' and m.gym_id = g.id and m.created_at::date >= v_month),
          'leftLast30', (
            select count(*) from profiles m
            where m.role = 'client' and m.gym_id = g.id
              and not exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at is null)
              and exists (select 1 from client_memberships cm where cm.client_id = m.id and cm.ended_at >= v_30)
          ),
          'endingSoon', (
            select count(*) from client_memberships cm
            join profiles m on m.id = cm.client_id
            where m.gym_id = g.id and cm.ended_at is null and cm.scheduled_end between v_today and v_in14
          ),
          'attendedThisMonth', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.attended and b.booking_date >= v_month
          ),
          'attendedLastMonth', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.attended and b.booking_date >= v_prev and b.booking_date < v_month
          ),
          'unmarkedSessions', (
            select count(*) from bookings b join profiles m on m.id = b.client_id
            where m.gym_id = g.id and b.status = 'booked' and not b.attended and not b.no_show and b.booking_date < v_today
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
                count(*) filter (where cp.onboarding_completed_at is not null and l.last_log >= v_week) as checked_in,
                count(*) filter (where cp.onboarding_completed_at is not null and (l.last_log is null or l.last_log <= v_today - 7)) as quiet,
                count(*) filter (where cp.needs_coach_review) as to_review
              from profiles m
              left join client_profiles cp on cp.client_id = m.id
              left join lateral (
                select max(d.log_date) as last_log
                from daily_logs d
                where d.client_id = m.id and d.log_date >= v_14
                  and (d.protein is not null or d.carbs is not null or d.fat is not null or d.water is not null
                       or d.bodyweight is not null or d.steps is not null or d.sleep is not null)
              ) l on true
              where m.role = 'client' and m.coach_id = c.id and m.gym_id = g.id
            ) t
            where cgm.gym_id = g.id
          ), '[]'::jsonb)
        ) as stat
      from gyms g
      where g.organisation_id = public.my_org_id()
    ) q
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.owner_gym_stats() to authenticated;

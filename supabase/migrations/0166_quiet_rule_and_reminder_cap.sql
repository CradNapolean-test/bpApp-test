-- Coach follow-up lists (live review decisions of 11 Nov 2026): one "gone quiet" rule for the owner's screen too (D11).
--
-- owner_gym_stats (last defined in migration 0142) gives the owner's Team table its "Quiet" column.
-- Before: quiet = finished setting up and nothing logged for 7 days or more, where only food, water, weight, steps and sleep counted; a
--   member who had never logged was quiet from their first day.
-- After (D11, CL17, CW7, RO8): quiet = 5 days or more without logging anything at all (any part of the daily check-in, or food), counted
--   from sign-up for a member who has never logged, and members still setting up, on hold today, or with check-in reminders switched off (0)
--   are left out. That is the rule the coach's dashboard, the Clients page and the coach Business tab now use (lib/followUp.ts). Everything
--   else the function returns is unchanged, "checkedIn" included (it still counts food, water, weight, steps and sleep only).
--
-- Guard: before changing anything, the migration checks the live owner_gym_stats is the one from 0142 (or already this one), comparing its
-- body with spaces and line breaks squeezed out. If it has been changed some other way since, nothing is changed and it stops with
-- "owner_gym_stats is not the one from migration 0142". Then send the PRE-FLIGHT's result to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'owner_gym_stats';
-- Expected before: owner_gym_stats d40da6dc0c3e9e27592191791378b935 (0142's body).
--
--   -- Each coach's quiet count on the owner's screen today, and what it becomes (read-only):
--   with t as (
--     select m.gym_id, m.coach_id, cp.onboarding_completed_at is not null as onboarded,
--            coalesce(cp.checkin_reminder_days, 3) <> 0 as watched, x.today,
--            (m.created_at at time zone coalesce(nullif(g.timezone, ''), 'UTC'))::date as joined,
--            exists (select 1 from membership_holds h where h.client_id = m.id and h.started_on <= x.today
--                    and (h.ended_on is null or h.ended_on >= x.today)) as on_hold,
--            (select max(dl.log_date) from daily_logs dl where dl.client_id = m.id and dl.log_date >= x.today - 14
--               and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.water is not null
--                    or dl.bodyweight is not null or dl.steps is not null or dl.sleep is not null)) as last_before,
--            (select max(dl.log_date) from daily_logs dl where dl.client_id = m.id and dl.log_date >= x.today - 14
--               and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.calories is not null
--                    or dl.fibre is not null or dl.water is not null or dl.bodyweight is not null or dl.steps is not null
--                    or dl.sleep is not null or dl.gym_session or dl.hunger is not null or dl.energy is not null
--                    or dl.motivation is not null or dl.stress is not null or dl.period_started or dl.notes is not null)) as last_any
--     from profiles m
--     join gyms g on g.id = m.gym_id
--     cross join lateral (select public.local_date(g.timezone) as today) x
--     left join client_profiles cp on cp.client_id = m.id
--     where m.role = 'client' and m.coach_id is not null and g.organisation_id is not null
--   )
--   select g.name as gym, coalesce(nullif(c.display_name, ''), c.email) as coach,
--          count(*) filter (where onboarded and (last_before is null or last_before <= today - 7)) as quiet_before,
--          count(*) filter (where onboarded and watched and not on_hold and coalesce(last_any, joined) <= today - 5) as quiet_after
--   from t join gyms g on g.id = t.gym_id join profiles c on c.id = t.coach_id
--   group by 1, 2 order by 1, 2;
--
-- CHECK (read-only, after running):
--   (the PRE-FLIGHT's first query again)
-- Expected after: owner_gym_stats 8ed6d10db4e851597a3d2d4780042b99 (this file's body).
-- Then /owner (Overview, Coaches table): the column reads "Quiet 5+ days" and each coach's number is the quiet_after above. The function
-- itself cannot be run from the SQL editor (it checks the signed-in owner).
--
-- REVERSE: run owner_gym_stats' definition from migration 0142 again (from "create or replace function public.owner_gym_stats()" to its
-- closing "$fn$;"). The return type is the same, so no drop is needed.
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_owner text;
begin
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_owner
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'owner_gym_stats';
  if v_owner is null or v_owner not in ('d40da6dc0c3e9e27592191791378b935', '8ed6d10db4e851597a3d2d4780042b99') then
    raise exception 'owner_gym_stats is not the one from migration 0142 (body md5 %), so it was not changed. Nothing else ran.', coalesce(v_owner, 'missing');
  end if;
end
$guard$;

-- ---- D11: the owner's quiet count ----

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
                -- D11 (0166): gone quiet = 5 days or more without logging anything, counted from sign-up for a member who never has;
                -- members still setting up, on hold today, or with check-in reminders switched off (0) are not counted. The app's rule
                -- (lib/followUp.ts, QUIET_DAYS) says the same. It was 7 days, and only food, water, weight, steps and sleep counted.
                count(*) filter (
                  where cp.onboarding_completed_at is not null
                    and coalesce(cp.checkin_reminder_days, 3) <> 0
                    and not exists (
                      select 1 from membership_holds h
                      where h.client_id = m.id and h.started_on <= d.today and (h.ended_on is null or h.ended_on >= d.today)
                    )
                    and coalesce(l.last_any, (m.created_at at time zone d.tz)::date) <= d.today - 5
                ) as quiet,
                count(*) filter (where cp.needs_coach_review) as to_review
              from profiles m
              left join client_profiles cp on cp.client_id = m.id
              left join lateral (
                -- last_log: food, water, weight, steps or sleep, as before (checkedIn). last_any: anything logged at all (quiet).
                select
                  max(dl.log_date) filter (
                    where dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.water is not null
                       or dl.bodyweight is not null or dl.steps is not null or dl.sleep is not null
                  ) as last_log,
                  max(dl.log_date) as last_any
                from daily_logs dl
                where dl.client_id = m.id and dl.log_date >= d.d14
                  and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.calories is not null
                       or dl.fibre is not null or dl.water is not null or dl.bodyweight is not null or dl.steps is not null
                       or dl.sleep is not null or dl.gym_session or dl.hunger is not null or dl.energy is not null
                       or dl.motivation is not null or dl.stress is not null or dl.period_started or dl.notes is not null)
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

-- "create or replace" keeps the function's grants; re-stated anyway, as in 0142.
revoke execute on function public.owner_gym_stats() from public, anon;
grant execute on function public.owner_gym_stats() to authenticated;

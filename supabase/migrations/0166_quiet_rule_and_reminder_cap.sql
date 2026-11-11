-- Coach follow-up lists (live review decisions of 11 Nov 2026). Two changes, each with its own before/after below:
--   1. D11: one "gone quiet" rule, 5 days without logging, on the owner's screen too (owner_gym_stats).
--   2. D19: check-in reminders stop after 3 unanswered, and the member goes on their coach's To do (send_checkin_reminders).
--
-- 1. owner_gym_stats (last defined in migration 0142) gives the owner's Coaches table its "Quiet" column.
-- Before: quiet = finished setting up and nothing logged for 7 days or more, where only food, water, weight, steps and sleep counted; a
--   member who had never logged was quiet from their first day.
-- After (D11, CL17, CW7, RO8): quiet = 5 days or more without logging anything at all (any part of the daily check-in, or food), counted
--   from sign-up for a member who has never logged, and members still setting up, on hold today, or with check-in reminders switched off (0)
--   are left out. That is the rule the coach's dashboard, the Clients page and the coach Business tab now use (lib/followUp.ts). Everything
--   else the function returns is unchanged, "checkedIn" included (it still counts food, water, weight, steps and sleep only).
--
-- 2. send_checkin_reminders (last defined in migration 0162) is run once a day by the checkin-reminders cron (about 04:16 UTC) and reminds a
--   member every <their reminder days> days for as long as they do not log. Live on 6 Nov, 9 members had had the same notice 2 to 20 times
--   (MX3).
-- After (D19): it counts the reminders sent since the member's last logged day (notices starting "Haven't seen a check-in from you", by the
--   member's own calendar). When a reminder is due and 3 have already gone unanswered, it sends nothing (no notice, no push) and sets the new
--   column client_profiles.checkin_reminders_stopped_at, once; the coach's dashboard then lists the member under To do, "Check-in reminders
--   unanswered". When the member logs, the count starts again from 0: the next run clears the column, and reminders start again if they go
--   quiet again. Who is reminded and when is otherwise unchanged, except that a day with only calories on it (a Quick Add with no macros)
--   now counts as logged, as it does everywhere else in the app.
--   New: client_profiles.checkin_reminders_stopped_at (timestamptz, empty by default). Only this function sets it. A member could change it
--     on their own row, as with last_checkin_reminder_at: that would only hide them from their coach's To do, and they can switch reminders
--     off themselves anyway, so the profile protection trigger is not changed.
--   New: coach_reviews.kind 'checkin_reminders', for the coach's "Reviewed" on that To do (ref = the day the reminders stopped).
--   The cron route pushes only to the members the function returns, so the push stops with the notice. The route is unchanged.
--
-- Guard: before changing anything, the migration checks both live functions are the ones from 0142 and 0162 (or already this file's),
-- comparing their bodies with spaces and line breaks squeezed out. If either has been changed some other way since, nothing is changed
-- and it stops with "... is not the one from migration ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('owner_gym_stats', 'send_checkin_reminders') order by 1;
-- Expected before: owner_gym_stats d40da6dc0c3e9e27592191791378b935 (0142's body), send_checkin_reminders bd841519e6d83a0bd42f7e867718732f
-- (0162's body).
--
--   select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'coach_reviews_kind_check';
-- Expected before: CHECK ((kind = ANY (ARRAY['week'::text, 'diary_day'::text, 'form'::text, 'challenge_week3'::text,
-- 'challenge_final'::text]))) (0122).
--
--   -- 1. Each coach's quiet count on the owner's screen today, and what it becomes:
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
--   -- 2. Unanswered reminders per member reminded today. 3 or more = no further reminder, and on the coach's To do from when the next one
--   -- would have been due (within their reminder days):
--   select x.unanswered, count(*) as members
--   from client_profiles cp
--   cross join lateral (
--     select coalesce(
--       (select max(d.log_date) from daily_logs d where d.client_id = cp.client_id
--          and (d.protein is not null or d.carbs is not null or d.fat is not null or d.calories is not null or d.bodyweight is not null
--               or d.steps is not null or d.sleep is not null or d.fibre is not null or d.water is not null or d.gym_session
--               or d.hunger is not null or d.energy is not null or d.motivation is not null or d.stress is not null
--               or d.period_started or d.notes is not null)),
--       (select p.created_at::date from profiles p where p.id = cp.client_id)) as last_active
--   ) l
--   cross join lateral (
--     select count(*) as unanswered from notifications n
--     where n.client_id = cp.client_id and n.message like 'Haven''t seen a check-in from you%'
--       and (n.created_at at time zone coalesce(cp.timezone, 'UTC'))::date > l.last_active
--   ) x
--   where cp.checkin_reminder_days > 0 and cp.notifications_enabled
--   group by 1 order by 1;
-- Live on 11 Nov 2026 (counted read-only from the app): 18 members reminded; 9 at 0, 1 at 1, 2 at 2, and 6 at 3 or more (5, 5, 6, 8, 8
-- and 11).
--
-- CHECK (read-only, after running):
--   (the PRE-FLIGHT's first query again)
-- Expected after: owner_gym_stats 8ed6d10db4e851597a3d2d4780042b99, send_checkin_reminders 5edfb0d26b500268dcfe3fbe1743b349 (this file's bodies).
--   (the PRE-FLIGHT's constraint query again)
-- Expected after: the same list ending with 'checkin_reminders'::text.
--   select data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'client_profiles' and column_name = 'checkin_reminders_stopped_at';
-- Expected: one row, "timestamp with time zone".
--   select has_function_privilege('authenticated', 'public.send_checkin_reminders()', 'execute') as members_can_run,
--          has_function_privilege('anon', 'public.send_checkin_reminders()', 'execute') as anyone_can_run;
-- Expected: false, false (only the cron's service role runs it, as since 0032).
-- Then /owner (Overview, Coaches table): the column reads "Quiet 5+ days" and each coach's number is quiet_after above (the function
-- itself checks the signed-in owner, so it cannot be run from the SQL editor).
-- A few days later (each member is checked when their next reminder falls due):
--   select count(*) from client_profiles where checkin_reminders_stopped_at is not null;
-- Expected: the members at 3 or more above, less any who have logged since.
--   select count(*) from notifications n join client_profiles cp on cp.client_id = n.client_id
--   where cp.checkin_reminders_stopped_at is not null and n.created_at > cp.checkin_reminders_stopped_at
--     and n.message like 'Haven''t seen a check-in from you%';
-- Expected: 0 (no reminder after the stop).
--
-- REVERSE: run owner_gym_stats' definition from migration 0142 again and send_checkin_reminders' definition from migration 0162 again
-- (each from its "create or replace function" line to its closing delimiter; the return types are the same, so no drop is needed). The new
-- column and review kind can stay (nothing else writes them); to remove them too: delete from public.coach_reviews where kind =
-- 'checkin_reminders'; put back 0122's coach_reviews_kind_check; alter table public.client_profiles drop column checkin_reminders_stopped_at
-- (the dashboard loads without it).
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_owner text;
  v_reminders text;
begin
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_owner
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'owner_gym_stats';
  if v_owner is null or v_owner not in ('d40da6dc0c3e9e27592191791378b935', '8ed6d10db4e851597a3d2d4780042b99') then
    raise exception 'owner_gym_stats is not the one from migration 0142 (body md5 %), so nothing was changed.', coalesce(v_owner, 'missing');
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_reminders
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'send_checkin_reminders';
  if v_reminders is null or v_reminders not in ('bd841519e6d83a0bd42f7e867718732f', '5edfb0d26b500268dcfe3fbe1743b349') then
    raise exception 'send_checkin_reminders is not the one from migration 0162 (body md5 %), so nothing was changed.', coalesce(v_reminders, 'missing');
  end if;
end
$guard$;

-- ---- 1. D11: the owner's quiet count ----

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

-- ---- 2. D19: check-in reminders stop after 3 unanswered ----

alter table public.client_profiles add column if not exists checkin_reminders_stopped_at timestamptz;
comment on column public.client_profiles.checkin_reminders_stopped_at is
  'Set by send_checkin_reminders when it stops after 3 unanswered check-in reminders (D19, migration 0166); cleared once the member logs again.';

alter table public.coach_reviews drop constraint if exists coach_reviews_kind_check;
alter table public.coach_reviews
  add constraint coach_reviews_kind_check
  check (kind in ('week', 'diary_day', 'form', 'challenge_week3', 'challenge_final', 'checkin_reminders'));

create or replace function public.send_checkin_reminders()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_last_active date;
  v_today date;
  v_days_since integer;
  v_unanswered integer;
begin
  for v_client in
    select cp.client_id, cp.checkin_reminder_days, cp.last_checkin_reminder_at, cp.timezone, cp.checkin_reminders_stopped_at
    from client_profiles cp
    where cp.checkin_reminder_days > 0
    and cp.notifications_enabled
  loop
    v_today := (now() at time zone coalesce(v_client.timezone, 'UTC'))::date;

    select max(log_date) into v_last_active
    from daily_logs
    where client_id = v_client.client_id
    and (
      protein is not null or carbs is not null or fat is not null or calories is not null or
      bodyweight is not null or steps is not null or sleep is not null or
      fibre is not null or water is not null or gym_session or
      hunger is not null or energy is not null or motivation is not null or
      stress is not null or period_started or notes is not null
    );

    if v_last_active is null then
      select created_at::date into v_last_active from profiles where id = v_client.client_id;
    end if;

    v_days_since := v_today - v_last_active;

    -- D19: reminders sent since their last logged day, by their own calendar. Logging again starts the count from 0.
    select count(*) into v_unanswered
    from notifications n
    where n.client_id = v_client.client_id
    and n.message like 'Haven''t seen a check-in from you%'
    and (n.created_at at time zone coalesce(v_client.timezone, 'UTC'))::date > v_last_active;

    -- They logged since the reminders stopped: off their coach's To do, and reminders can start again.
    if v_unanswered < 3 and v_client.checkin_reminders_stopped_at is not null then
      update client_profiles
      set checkin_reminders_stopped_at = null
      where client_id = v_client.client_id;
    end if;

    if v_days_since >= v_client.checkin_reminder_days
      and (
        v_client.last_checkin_reminder_at is null
        or now() - v_client.last_checkin_reminder_at >= make_interval(days => v_client.checkin_reminder_days)
      )
    then
      -- 3 already unanswered: no fourth. The member goes on their coach's To do instead (the day it stops is kept).
      if v_unanswered >= 3 then
        if v_client.checkin_reminders_stopped_at is null then
          update client_profiles
          set checkin_reminders_stopped_at = now()
          where client_id = v_client.client_id;
        end if;
        continue;
      end if;

      insert into notifications (client_id, message)
      values (
        v_client.client_id,
        'Haven''t seen a check-in from you in a few days — how''s it going? Fill in your Daily check-in to stay on track.'
      );

      update client_profiles
      set last_checkin_reminder_at = now()
      where client_id = v_client.client_id;

      return next v_client.client_id;
    end if;
  end loop;
end;
$$;

-- "create or replace" keeps the function's grants; re-stated anyway, as in 0060 and 0162 (only the cron's service role may run it).
revoke all on function public.send_checkin_reminders() from public, anon, authenticated;

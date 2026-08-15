-- Per-client timezone -- fixes a real bug, not just a display issue: every "what day is it"
-- computation in the app (lib/data/dashboardBundle.ts's todayIso, getClientHealthStatuses'
-- daysSinceActive, send_checkin_reminders' current_date) was UTC-anchored with zero timezone
-- awareness anywhere in the codebase. For a client meaningfully ahead of UTC (e.g. NZ,
-- UTC+12/13), their calendar day rolls over hours before UTC's does, so for a chunk of every
-- real day, anything logged got silently attributed to what is, for them, "yesterday". This
-- column plus todayIsoInTz() (lib/utils/dates.ts) fixes that at the source.
alter table client_profiles
  add column timezone text not null default 'Pacific/Auckland';

-- No RLS change needed -- client_profiles' existing "client updates own client_profiles"
-- policy (is_self-scoped) already covers this new column exactly like every other Setup
-- field (name, gender, age, ...).

-- Redefine send_checkin_reminders (0007 -> 0010 -> 0023) to compute "today" per-client using
-- their own stored timezone instead of current_date (the DB session's timezone, effectively
-- UTC) -- the cron-side half of the same fix.
create or replace function public.send_checkin_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_last_active date;
  v_today date;
  v_days_since integer;
  v_count integer := 0;
begin
  for v_client in
    select cp.client_id, cp.checkin_reminder_days, cp.last_checkin_reminder_at, cp.timezone
    from client_profiles cp
    where cp.checkin_reminder_days > 0
    and cp.notifications_enabled
  loop
    v_today := (now() at time zone coalesce(v_client.timezone, 'UTC'))::date;

    select max(log_date) into v_last_active
    from daily_logs
    where client_id = v_client.client_id
    and (
      protein is not null or carbs is not null or fat is not null or
      bodyweight is not null or steps is not null or sleep is not null or
      fibre is not null or water is not null or gym_session or
      hunger is not null or energy is not null or motivation is not null or
      stress is not null or period_started or notes is not null
    );

    if v_last_active is null then
      select created_at::date into v_last_active from profiles where id = v_client.client_id;
    end if;

    v_days_since := v_today - v_last_active;

    if v_days_since >= v_client.checkin_reminder_days
      and (
        v_client.last_checkin_reminder_at is null
        or now() - v_client.last_checkin_reminder_at >= make_interval(days => v_client.checkin_reminder_days)
      )
    then
      insert into notifications (client_id, message)
      values (
        v_client.client_id,
        'Haven''t seen a check-in from you in a few days — how''s it going? Log your Weekly Log to stay on track.'
      );

      update client_profiles
      set last_checkin_reminder_at = now()
      where client_id = v_client.client_id;

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
-- No grant needed -- 0032 already locked this down to the cron route's service-role admin
-- client only, and create-or-replace doesn't reset that.

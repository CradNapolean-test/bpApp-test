-- Automated inactivity check-in reminders. A daily cron (app/api/cron/checkin-reminders)
-- calls send_checkin_reminders(), which notifies any client who's gone quiet for longer
-- than their coach-configured threshold. Reuses the notifications table and
-- NotificationBanner UI already built for waitlist promotion -- no new delivery mechanism.

alter table client_profiles add column checkin_reminder_days integer not null default 3; -- 0 = disabled
alter table client_profiles add column last_checkin_reminder_at timestamptz;

create or replace function public.send_checkin_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_last_active date;
  v_days_since integer;
  v_count integer := 0;
begin
  for v_client in
    select cp.client_id, cp.checkin_reminder_days, cp.last_checkin_reminder_at
    from client_profiles cp
    where cp.checkin_reminder_days > 0
  loop
    -- Most recent daily_logs date that actually has real data -- mirrors the
    -- "blank row doesn't count" rule lib/utils/dailyLog.ts's hasLoggedData already
    -- applies client-side (a blank row is auto-created for Food Tracking's benefit).
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
      -- Never logged anything -- anchor to account creation so a brand-new client
      -- isn't immediately flagged, but still eventually gets a first nudge.
      select created_at::date into v_last_active from profiles where id = v_client.client_id;
    end if;

    v_days_since := current_date - v_last_active;

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

-- Intentionally NOT granted to authenticated -- only the cron route's service-role admin
-- client calls this, same reasoning as replenish_due_memberships in 0005.

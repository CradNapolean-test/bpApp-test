-- The check-in reminder names the screen by its current name (live review MX3, 6 Nov 2026).
--
-- Before: the daily checkin-reminders cron (vercel.json -> app/api/cron/checkin-reminders) calls send_checkin_reminders(), last
-- defined in migration 0060, which writes this notice:
--   "Haven't seen a check-in from you in a few days — how's it going? Log your Weekly Log to stay on track."
-- The screen has been called "Daily check-in" for a while, so members were told to open a screen they cannot find.
--
-- After: the same function, word for word, except the notice ends "Fill in your Daily check-in to stay on track." Who gets a reminder,
-- when, and how often are unchanged: capping repeats (MX3's other half, decision D19) waits on the owner. The push message the cron
-- route sends does not name the screen and is unchanged. Notices already sent keep their old wording.
--
-- Guard: before changing anything, the migration checks the live function is the one from 0060 (or already this one), comparing its
-- body with spaces and line breaks squeezed out. If it has been changed some other way since, nothing is changed and it stops with
-- "send_checkin_reminders is not the one from migration 0060". Then send the PRE-FLIGHT's result to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select pg_get_function_result(p.oid) as returns,
--          position('Log your Weekly Log' in p.prosrc) > 0 as old_wording,
--          md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'send_checkin_reminders';
-- Expected before: one row: returns "SETOF uuid", old_wording true, body_md5 75b7e350f2c5b1fbeff821e361b6b097 (0060's body).
--
--   -- The wording members have been getting (read-only):
--   select message, count(*) from public.notifications where message like 'Haven''t seen a check-in from you%' group by 1;
--
-- CHECK (read-only, after running):
--   (the PRE-FLIGHT's first query again)
-- Expected after: returns "SETOF uuid", old_wording false, body_md5 bd841519e6d83a0bd42f7e867718732f (this file's body).
--
--   select has_function_privilege('authenticated', 'public.send_checkin_reminders()', 'execute') as members_can_run,
--          has_function_privilege('anon', 'public.send_checkin_reminders()', 'execute') as anyone_can_run;
-- Expected: false, false (only the cron's service role runs it, as since 0032).
--
-- The next reminder a member gets (the cron runs once a day at about 04:16 UTC) ends "Fill in your Daily check-in to stay on track."
--
-- REVERSE: run send_checkin_reminders' definition from migration 0060 again, starting it with "create or replace" instead of
-- "create" (the return type is the same, so no drop is needed).
--
-- Safe to run again.

do $guard$
declare
  v_body text;
begin
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_body
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'send_checkin_reminders';
  if v_body is null or v_body not in ('75b7e350f2c5b1fbeff821e361b6b097', 'bd841519e6d83a0bd42f7e867718732f') then
    raise exception 'send_checkin_reminders is not the one from migration 0060 (body md5 %), so it was not changed. Nothing else ran.', coalesce(v_body, 'missing');
  end if;
end
$guard$;

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

-- "create or replace" keeps the function's grants; re-stated anyway, as in 0060 (only the cron's service role may run it).
revoke all on function public.send_checkin_reminders() from public, anon, authenticated;

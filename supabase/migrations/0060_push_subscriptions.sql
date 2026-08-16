-- Web Push notifications, foundation + first wired trigger (check-in reminders).
--
-- Architecture note: every other outbound-side-effect problem in this codebase (email, see
-- 0039's comment) is solved from TypeScript, not plpgsql -- pg_net isn't set up here, and
-- 0039 explicitly chose "call it from TS at the same call site" over a DB-level webhook. This
-- follows that same precedent rather than introducing pg_net: push is triggered from the
-- calling TypeScript code right after each notification-worthy write, not from a trigger on
-- the notifications table itself. That also sidesteps a real platform constraint -- this
-- project's Vercel cron jobs are once-daily (Hobby plan), so a "sweep unpushed notifications"
-- cron would mean up to a 24h delay for anything that isn't already inherently daily.
--
-- Scope for this migration: the subscriptions table (client-owned, one row per browser/device)
-- and the one RPC being wired to push in this pass -- send_checkin_reminders, since it's
-- already an appropriate once-daily cadence with no latency expectation. Every other
-- notification-triggering RPC (booking cancellation, form assignment, etc.) still only writes
-- to `notifications`; wiring those to push is follow-up work, tracked in GAP_ROADMAP.md, not
-- done here.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique (client_id, endpoint)
);

alter table push_subscriptions enable row level security;

-- is_self only, not owns_client -- a subscription is an artifact of one specific browser
-- being logged in as this client; a coach's own browser can't meaningfully manage it on the
-- client's behalf the way meal_sections' coach-editable pattern makes sense for organizational
-- data.
create policy "client manages own push_subscriptions"
  on push_subscriptions for all
  using (is_self(client_id))
  with check (is_self(client_id));

-- Redefine send_checkin_reminders (0007 -> 0010 -> 0023 -> 0044) to return the client_ids it
-- actually notified instead of just a count, so the cron route can loop through them and
-- trigger a push send per client. Return type changes (integer -> setof uuid), so this must
-- drop first -- create or replace can't change a function's return type.
drop function if exists public.send_checkin_reminders();

create function public.send_checkin_reminders()
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
        'Haven''t seen a check-in from you in a few days — how''s it going? Log your Weekly Log to stay on track.'
      );

      update client_profiles
      set last_checkin_reminder_at = now()
      where client_id = v_client.client_id;

      return next v_client.client_id;
    end if;
  end loop;
end;
$$;
-- No grant needed -- 0032 already locked this down to the cron route's service-role admin
-- client only, and dropping + recreating with the same name doesn't reset that; re-stated
-- explicitly below anyway since drop function removes any prior grants outright.
revoke all on function public.send_checkin_reminders() from public, anon, authenticated;

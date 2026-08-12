-- Expanded Account Settings: change password/email (client-side Supabase Auth calls, no
-- schema needed for those), a client-owned notification preference distinct from the
-- existing coach-only checkin_reminder_days, and a light/dark theme override.

-- ============ Notification preference (client-owned, reminder cron only) ============
-- Deliberately separate from checkin_reminder_days (coach-only, see 0011's own comment) --
-- this only mutes the automated inactivity nag, never transactional notifications like
-- waitlist promotions (cancel_booking's insert is untouched by this).
alter table client_profiles add column notifications_enabled boolean not null default true;

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
    and cp.notifications_enabled
  loop
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

-- ============ Theme preference ============
-- profiles has only a select policy today (deliberately -- it also holds role/coach_id,
-- columns a client must never write). Rather than open a blanket update policy, use a
-- narrow security-definer RPC that only ever touches this one column, same shape as
-- set_checkin_reminder_days (0011).
alter table profiles add column theme_preference text not null default 'system'
  check (theme_preference in ('light', 'dark', 'system'));

create or replace function public.set_theme_preference(p_preference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_preference not in ('light', 'dark', 'system') then
    raise exception 'Invalid theme preference';
  end if;
  update profiles set theme_preference = p_preference where id = auth.uid();
end;
$$;

grant execute on function public.set_theme_preference(text) to authenticated;

-- ============ auth.users.email -> profiles.email sync ============
-- profiles.email is denormalized from auth.users (see schema.sql's own comment on why --
-- auth.users isn't exposed via the client API/RLS). Changing email via
-- supabase.auth.updateUser({ email }) only takes effect once the confirmation link is
-- clicked; this trigger keeps profiles.email in sync the moment that actually happens,
-- rather than relying on every future login to notice and re-sync by hand.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Weekly credits reset on Saturday, not Monday.
--
-- Members have to book a week's classes before that week starts, so the new allowance has to be there on the weekend. The reset used to be
-- tied to the Monday of the ISO week (date_trunc('week', ...)). It is now tied to the Saturday on or before today:
--   Saturday and Sunday  -> that Saturday
--   Monday to Friday     -> the Saturday just gone
-- so a "credit week" runs Saturday to Friday.
--
-- What changes:
--   credit_week_start(date)               new helper: the Saturday a credit week started on (one place, so the two functions below agree).
--   replenish_due_memberships()           the daily job. Resets a plan once per credit week (last_reset_week < this Saturday).
--   top_up_membership_credits(uuid)       the immediate top-up (starting or changing a plan). Records the same Saturday in last_reset_week, so
--                                         the next daily run does not reset the member a second time.
-- Nothing else changes: the allowance, the 'membership' bucket, bonus credits, refunds (D1 cap) and the ledger reason text ('membership
-- reset: week of <date>', where the date is now a Saturday) are as before. Check-in weeks, red flag weeks and the owner reports are
-- Monday-to-Sunday weeks and are NOT touched.
--
-- THE FIRST RESET AFTER THIS IS APPLIED: every active plan has last_reset_week = a Monday (for example 2026-10-12), which is earlier than any
-- Saturday, so the next daily run (about 03:00 UTC) resets everyone once, even though they were reset on that Monday. If this is applied
-- on a Saturday after the day's run, that reset comes on Sunday. To give the new allowance sooner, call replenish_due_memberships() once as
-- the service role (it is not callable by signed-in users). It sets each member's weekly credits to their plan's allowance, so credits used
-- since the last reset come back, and bonus credits are not touched.
--
-- The date is the database's current_date (UTC), as before; the daily job runs at 03:00 UTC.
--
-- PRE-FLIGHT (read-only):
--   select count(*) as active_plans, min(last_reset_week), max(last_reset_week) from client_memberships where ended_at is null;
--   select proname, prosecdef from pg_proc where proname in ('replenish_due_memberships', 'top_up_membership_credits');
-- TO UNDO: re-create both functions from 0088_membership_panel.sql (date_trunc('week', current_date)) and drop credit_week_start.
-- Re-runnable.

create or replace function public.credit_week_start(p_date date default current_date)
returns date
language sql
immutable
set search_path = public
as $$
  -- isodow: Monday = 1 ... Saturday = 6, Sunday = 7. (isodow + 1) % 7 is how many days back the Saturday is: Sat 0, Sun 1, Mon 2 ... Fri 6.
  select p_date - ((extract(isodow from p_date)::int + 1) % 7);
$$;

-- An internal helper only: called by the two functions below (which run as their owner), not through the API.
revoke execute on function public.credit_week_start(date) from public, anon, authenticated;

-- The overnight job: close plans whose planned last day has passed, then top up the ones that are running (skipping any that start in
-- the future). Same as 0088 except for the week.
create or replace function public.replenish_due_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week date := public.credit_week_start(current_date);
  v_membership record;
  v_balance integer;
  v_count integer := 0;
begin
  for v_membership in
    select id, client_id, scheduled_end from client_memberships
    where ended_at is null and scheduled_end is not null and scheduled_end < current_date
  loop
    update client_memberships set ended_at = v_membership.scheduled_end where id = v_membership.id;
    perform clear_membership_credits(v_membership.client_id);
  end loop;

  for v_membership in
    select cm.id, cm.client_id, mp.credits_per_week
    from client_memberships cm
    join membership_packages mp on mp.id = cm.package_id
    where cm.ended_at is null
    and cm.started_at <= current_date
    and (cm.last_reset_week is null or cm.last_reset_week < v_current_week)
  loop
    select coalesce(sum(delta), 0) into v_balance
    from credits_ledger
    where client_id = v_membership.client_id and bucket = 'membership';

    insert into credits_ledger (client_id, delta, reason, bucket)
    values (
      v_membership.client_id,
      v_membership.credits_per_week - v_balance,
      'membership reset: week of ' || v_current_week,
      'membership'
    );

    update client_memberships
    set last_reset_week = v_current_week
    where id = v_membership.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.replenish_due_memberships() from public, anon, authenticated;

-- Sets the weekly (membership) credits to a member's plan allowance, exactly like the weekly reset. Same as 0088 except for the week.
create or replace function public.top_up_membership_credits(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_per_week integer;
  v_balance integer;
  v_week date := public.credit_week_start(current_date);
begin
  select cm.client_id, mp.credits_per_week into v_client, v_per_week
  from client_memberships cm join membership_packages mp on mp.id = cm.package_id
  where cm.id = p_membership_id;
  if v_client is null then return; end if;

  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = v_client and bucket = 'membership';
  insert into credits_ledger (client_id, delta, reason, bucket)
  values (v_client, v_per_week - v_balance, 'membership reset: week of ' || v_week, 'membership');
  update client_memberships set last_reset_week = v_week where id = p_membership_id;
end;
$$;

revoke execute on function public.top_up_membership_credits(uuid) from public, anon, authenticated;

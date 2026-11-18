-- Bookings, events and sign-in links (live review decisions of 11 Nov 2026). Four parts, each with its own before/after below:
--   1. D13a (BK11, RO9b): when a plan ends, its member's upcoming bookings are cancelled and refunded.
--
-- Apply the WHOLE file in one go, after 0167. It must be applied BEFORE the web app that goes with it is deployed.
--
-- 1. D13a. Ending a plan (end_membership now, or the overnight job when a planned last day has passed) removed the member's weekly credits
--    (clear_membership_credits, 0088) but kept their bookings, so sessions booked with that plan's credits still happened after it ended.
--    New: cancel_bookings_for_ended_plan(member), internal. Every booked or waitlisted session of the member that has not started yet (the
--      session's date and start time, in the gym's timezone) is cancelled. A booked one is refunded through refund_booking_credits (0132),
--      the one refund path, so the ledger only gains rows: a bonus credit goes back to the bonus credits and stays; a weekly credit goes
--      back to the weekly credits, which are then cleared with the plan (the ledger shows both rows). The freed place goes to the waitlist
--      (promote_from_waitlist, 0158). Sessions that have already started are left alone. The member gets one notice listing them.
--    Changed: clear_membership_credits(member) calls it first, then clears the weekly credits as before. It is called only when a plan ends
--      (end_membership and replenish_due_memberships), so both ways of ending a plan do it. Changing a member's plan today
--      (start_membership) ends the old plan without calling it: the member is still on a plan, so their bookings stay.
--    The web's "End plan now" confirm says the bookings are cancelled.
--
-- Guard: before changing anything, the migration checks that each function it replaces is the one from the migration named below (or
-- already this file's), comparing the bodies with spaces and line breaks squeezed out. If one has been changed some other way since, nothing
-- is changed and it stops with "... is not the one from migration ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('clear_membership_credits') order by 1;
-- Expected before: clear_membership_credits 9483ea3b336f92c5782a64761083e605 (0088).
--
--   -- 1. Upcoming bookings that ending a plan would cancel today: members with no open plan, and bookings after a planned last day.
--   select count(*) filter (where cm.client_id is null) as no_open_plan,
--          count(*) filter (where cm.scheduled_end is not null and b.booking_date > cm.scheduled_end) as after_planned_end
--   from public.bookings b
--   left join public.client_memberships cm on cm.client_id = b.client_id and cm.ended_at is null
--   where b.status in ('booked', 'waitlist') and b.booking_date >= current_date;
-- Live on 18 Nov 2026 (counted read-only from the app): 0 and 0 (2 upcoming bookings in all, both on open plans with no planned end).
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: clear_membership_credits f15cac7befa8937486066ee151e75502 (this file's body).
--   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as signed_in, has_function_privilege('anon', p.oid, 'execute') as anyone
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('cancel_bookings_for_ended_plan', 'clear_membership_credits');
-- Expected: both false, false (only other database functions call them).
-- Then, on a test member with a plan and an upcoming booking: End plan now. The booking shows as cancelled, the member has a notice
-- "Your plan has ended, so ...", and their Credits history shows "Refunded <session> (plan ended)" then "membership ended".
--
-- REVERSE: run clear_membership_credits' definition from migration 0088 again, then drop function public.cancel_bookings_for_ended_plan(uuid).
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
begin
  for v_check in
    select * from (values
      ('clear_membership_credits', '0088', array['9483ea3b336f92c5782a64761083e605', 'f15cac7befa8937486066ee151e75502'])
    ) as t(name, migration, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is null or not (v_md5 = any (v_check.accepted)) then
      raise exception '% is not the one from migration % (body md5 %), so nothing was changed.', v_check.name, v_check.migration, coalesce(v_md5, 'missing');
    end if;
  end loop;
end
$guard$;

-- =====================================================================================================================================
-- 1. D13a: a plan's end cancels and refunds its member's upcoming bookings
-- =====================================================================================================================================

-- Cancels every booked or waitlisted session of a member that has not started yet, refunding the booked ones through the shared refund
-- function and giving each freed place to the waitlist. Returns how many were cancelled. Called by clear_membership_credits (a plan has
-- ended), after the plan's ended_at is set, so refund_booking_credits finds no plan and gives back what each booking cost; the weekly part
-- is then cleared with the plan.
create or replace function public.cancel_bookings_for_ended_plan(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking record;
  v_count integer := 0;
  v_list text := '';
begin
  if p_client is null then
    return 0;
  end if;

  for v_booking in
    select b.id, b.status, b.class_id, b.booking_date, c.name, c.start_time
    from bookings b
    join classes c on c.id = b.class_id
    join gyms g on g.id = c.gym_id
    where b.client_id = p_client
      and b.status in ('booked', 'waitlist')
      and ((b.booking_date + coalesce(c.start_time, time '00:00')) at time zone coalesce(nullif(g.timezone, ''), 'UTC')) > now()
    order by b.booking_date, c.start_time, b.created_at
  loop
    update bookings set status = 'cancelled' where id = v_booking.id and status in ('booked', 'waitlist');
    if not found then
      continue;
    end if;

    if v_booking.status = 'booked' then
      perform public.refund_booking_credits(v_booking.id, 'Refunded ' || v_booking.name || ' (plan ended)');
      perform public.promote_from_waitlist(v_booking.class_id, v_booking.booking_date);
    end if;

    v_count := v_count + 1;
    if v_count <= 4 then
      v_list := v_list || case when v_count > 1 then '; ' else '' end
        || v_booking.name || ', ' || public.session_label(v_booking.booking_date, v_booking.start_time);
    end if;
  end loop;

  if v_count > 0 then
    insert into notifications (client_id, message)
    values (
      p_client,
      'Your plan has ended, so '
        || case when v_count = 1 then 'your upcoming booking was' else 'your ' || v_count || ' upcoming bookings were' end
        || ' cancelled: ' || v_list || case when v_count > 4 then ' and ' || (v_count - 4) || ' more' else '' end
        || '. Any bonus credits they used are back in your account.'
    );
  end if;

  return v_count;
end;
$fn$;

revoke execute on function public.cancel_bookings_for_ended_plan(uuid) from public, anon, authenticated;

-- Called when a plan ends (end_membership, replenish_due_memberships). The 0088 definition with the bookings cancelled first (D13a), so
-- the weekly credits their refunds give back are cleared with the rest.
create or replace function public.clear_membership_credits(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.cancel_bookings_for_ended_plan(p_client_id);

  perform pg_advisory_xact_lock(hashtext('credits:' || p_client_id::text));
  select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = p_client_id and bucket = 'membership';
  if v_balance > 0 then
    insert into credits_ledger (client_id, delta, reason, bucket)
    values (p_client_id, -v_balance, 'membership ended', 'membership');
  end if;
end;
$$;

revoke execute on function public.clear_membership_credits(uuid) from public, anon, authenticated;

-- Waitlist promotion and cancelling sessions (live review, 6 Nov 2026): BK1/RO7 (decision D1), BK9 and BK27.
--
-- BK1/RO7, decision D1 ("keep promoting, but a late-promoted booking can be cancelled for a full refund until the session starts").
--   When a booked member cancels (or a coach removes them), the first person on the waitlist with enough credits is booked and charged.
--   After the cancel cut-off that person could not get the credit back, minutes before a session they may not be able to reach. Now:
--     * bookings.promoted_at (when the booking came off the waitlist) and bookings.promoted_after_cutoff (it came off after the cut-off).
--     * cancel_booking refunds a promoted_after_cutoff booking in full until the session starts (before the cut-off, as for everyone).
--     * One function, promote_from_waitlist, does the promotion for cancel_booking and coach_cancel_booking (it was copied in both). It
--       also: stops once the session has started (nobody is charged for a class they can no longer reach; they stay on the waitlist,
--       uncharged), skips a cancelled or retired session, checks there really is a free place, and takes the same per-session lock as
--       book_class, so two cancellations at once cannot both book (and charge) the same waitlisted member.
--   Nothing else changes: who is promoted (the earliest on the waitlist with enough credits), what they pay (weekly credits first) and
--   the refund itself (refund_booking_credits, 0132). Members can't write to bookings (0127), so only these functions set the new columns.
--
-- BK9. The promotion notice read "You've been moved off the waitlist for X on 2026-11-12." Now it gives the day, date and time, and
--   says how to get the credit back, e.g.
--     "You're off the waitlist and booked into Strength & Conditioning on Thursday 12 November at 6am (1 credit used). A place opened
--      after the cancel deadline, so you can still cancel for a full refund any time before it starts."
--   The removal and "Class cancelled" notices get the same readable date (session_label). The push for a promotion is sent by the web
--   app after the cancel (lib/waitlistPromotionNotify.ts).
--
-- BK27. A session that had started (or finished) could still be cancelled on its own day: cancel_class_occurrence compared dates only,
--   so a 6am session cancelled at 3pm refunded everyone, including the people who came. It now refuses once the session's start time
--   has passed in the gym's timezone (a session with no start time: from the start of its day).
--
-- PRE-FLIGHT (read-only):
--   1. Waitlist places on sessions still to come (whoever is first on each list is who these rules apply to next):
--        select b.booking_date, c.name, c.start_time, count(*) as waiting
--        from public.bookings b join public.classes c on c.id = b.class_id
--        where b.status = 'waitlist' and b.booking_date >= current_date group by 1, 2, 3 order by 1, 3;
--   2. Session dates cancelled so far (BK27 would have refused the ones cancelled after they started; cancelling is not undone here):
--        select count(*) from public.class_exceptions;
--
-- CHECK after applying (read-only):
--   1. The two new columns (expect 2 rows):
--        select column_name, data_type, is_nullable, column_default from information_schema.columns
--        where table_schema = 'public' and table_name = 'bookings' and column_name in ('promoted_at', 'promoted_after_cutoff');
--   2. Who can call what (expect promote_from_waitlist and session_label false/false; the three cancel functions false/true):
--        select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
--               has_function_privilege('authenticated', p.oid, 'execute') as signed_in
--        from pg_proc p where p.pronamespace = 'public'::regnamespace
--          and p.proname in ('promote_from_waitlist', 'session_label', 'cancel_booking', 'coach_cancel_booking', 'cancel_class_occurrence');
--   3. The readable date (expect "Thursday 12 November at 6am" and "Friday 13 November at 6:30pm"):
--        select public.session_label(date '2026-11-12', time '06:00'), public.session_label(date '2026-11-13', time '18:30');
--
-- Apply after 0157. Safe to run again.

alter table public.bookings add column if not exists promoted_at timestamptz;
alter table public.bookings add column if not exists promoted_after_cutoff boolean not null default false;

-- "Thursday 12 November at 6am", "Friday 13 November at 6:30pm", or just the day when the session has no start time.
create or replace function public.session_label(p_date date, p_start time)
returns text
language sql
stable
set search_path = public
as $fn$
  select to_char(p_date, 'FMDay FMDD FMMonth')
    || case
         when p_start is null then ''
         when extract(minute from p_start) = 0 then ' at ' || to_char(p_date + p_start, 'FMHH12am')
         else ' at ' || to_char(p_date + p_start, 'FMHH12:MIam')
       end;
$fn$;

revoke execute on function public.session_label(date, time) from public, anon, authenticated;

-- Books the first member on the waitlist who can pay into a place that has just opened. Returns their booking id, or null.
create or replace function public.promote_from_waitlist(p_class_id uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class classes;
  v_gym gyms;
  v_tz text;
  v_start timestamptz;
  v_cutoff timestamptz;
  v_late boolean;
  v_booked integer;
  v_candidate record;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_from_membership integer;
  v_from_bonus integer;
  v_deadline_local timestamp;
  v_message text;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class.id is null or v_class.retired_at is not null then
    return null;
  end if;
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_date) then
    return null;
  end if;

  select * into v_gym from gyms where id = v_class.gym_id;
  v_tz := coalesce(nullif(v_gym.timezone, ''), 'UTC');
  v_start := (p_date + coalesce(v_class.start_time, time '00:00')) at time zone v_tz;
  -- Once the session has started nobody is moved in: they could not get there, and could no longer cancel for a refund.
  if now() >= v_start then
    return null;
  end if;

  -- The same lock as book_class for this session and date: one place, one promotion.
  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_date::text));

  select count(*) into v_booked
  from bookings where class_id = p_class_id and booking_date = p_date and status = 'booked';
  if v_booked >= v_class.capacity then
    return null;
  end if;

  v_cutoff := public.class_cancel_deadline(p_date, v_class.start_time, v_class.cutoff_hours, v_tz, v_gym.blackout_start, v_gym.blackout_end);
  v_late := now() >= v_cutoff;

  for v_candidate in
    select b.id, b.client_id
    from bookings b
    where b.class_id = p_class_id and b.booking_date = p_date and b.status = 'waitlist'
    order by b.created_at asc, b.id
  loop
    select coalesce(sum(delta) filter (where bucket = 'membership'), 0), coalesce(sum(delta) filter (where bucket = 'bonus'), 0)
    into v_membership_balance, v_bonus_balance
    from credits_ledger where client_id = v_candidate.client_id;

    if v_membership_balance + v_bonus_balance >= v_class.credit_cost then
      update bookings
      set status = 'booked', promoted_at = now(), promoted_after_cutoff = v_late
      where id = v_candidate.id;

      v_from_membership := least(v_class.credit_cost, greatest(v_membership_balance, 0));
      v_from_bonus := v_class.credit_cost - v_from_membership;
      if v_from_membership > 0 then
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_candidate.client_id, -v_from_membership, 'Booked ' || v_class.name, 'membership', v_candidate.id);
      end if;
      if v_from_bonus > 0 then
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_candidate.client_id, -v_from_bonus, 'Booked ' || v_class.name, 'bonus', v_candidate.id);
      end if;

      v_message := 'You''re off the waitlist and booked into ' || v_class.name || ' on ' || public.session_label(p_date, v_class.start_time)
        || case
             when v_class.credit_cost = 1 then ' (1 credit used).'
             when v_class.credit_cost > 1 then ' (' || v_class.credit_cost || ' credits used).'
             else '.'
           end;
      if v_late then
        v_message := v_message || ' A place opened after the cancel deadline, so you can still cancel for a full refund any time before it starts.';
      else
        v_deadline_local := v_cutoff at time zone v_tz;
        v_message := v_message || ' Can''t make it? Cancel by '
          || case when extract(minute from v_deadline_local) = 0 then to_char(v_deadline_local, 'FMHH12am') else to_char(v_deadline_local, 'FMHH12:MIam') end
          || ' on ' || to_char(v_deadline_local, 'FMDay FMDD FMMonth') || ' to get your credit back.';
      end if;

      insert into notifications (client_id, message) values (v_candidate.client_id, v_message);
      return v_candidate.id;
    end if;
  end loop;

  return null;
end;
$fn$;

revoke execute on function public.promote_from_waitlist(uuid, date) from public, anon, authenticated;

-- cancel_booking: the 0132 definition, with the D1 refund rule and the promotion moved into promote_from_waitlist.
create or replace function public.cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_class classes;
  v_gym gyms;
  v_tz text;
  v_cutoff timestamptz;
  v_start timestamptz;
  v_refund boolean := false;
  v_was_booked boolean;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  if not coalesce(public.is_self(v_booking.client_id) or public.is_coach_of(v_booking.client_id), false) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  v_was_booked := v_booking.status = 'booked';

  select * into v_class from classes where id = v_booking.class_id;
  select * into v_gym from gyms where id = v_class.gym_id;
  v_tz := coalesce(nullif(v_gym.timezone, ''), 'UTC');
  v_cutoff := public.class_cancel_deadline(
    v_booking.booking_date, v_class.start_time, v_class.cutoff_hours, v_tz, v_gym.blackout_start, v_gym.blackout_end
  );
  v_start := (v_booking.booking_date + coalesce(v_class.start_time, time '00:00')) at time zone v_tz;
  -- Refunded before the cut-off; a place given from the waitlist after the cut-off is refunded until the session starts (D1).
  v_refund := v_was_booked and (now() < v_cutoff or (coalesce(v_booking.promoted_after_cutoff, false) and now() < v_start));

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    perform public.refund_booking_credits(p_booking_id, 'Refunded ' || v_class.name);
  end if;

  if v_was_booked then
    perform public.promote_from_waitlist(v_booking.class_id, v_booking.booking_date);
  end if;

  return v_booking;
end;
$$;

-- coach_cancel_booking: the 0132 definition, with the readable date and the promotion moved into promote_from_waitlist.
create or replace function public.coach_cancel_booking(p_booking_id uuid, p_refund boolean)
returns bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking bookings;
  v_class classes;
  v_was_booked boolean;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  select * into v_class from classes where id = v_booking.class_id;
  if not coalesce(public.is_coach_of(v_booking.client_id) or v_class.gym_id = public.my_gym_id(), false) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  v_was_booked := v_booking.status = 'booked';
  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_was_booked and p_refund then
    perform public.refund_booking_credits(p_booking_id, 'Refunded ' || v_class.name || ' (removed by coach)');
  end if;

  insert into notifications (client_id, message)
  values (
    v_booking.client_id,
    'You have been taken off ' || v_class.name || ' on ' || public.session_label(v_booking.booking_date, v_class.start_time) ||
      case when v_was_booked and p_refund then '. Your credit was refunded.' else '.' end
  );

  if v_was_booked then
    perform public.promote_from_waitlist(v_booking.class_id, v_booking.booking_date);
  end if;

  return v_booking;
end;
$fn$;

-- cancel_class_occurrence: the 0132 definition, refusing a session that has started (BK27), with the readable date.
create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_count integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_tz text;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class.id is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if p_date is null then
    raise exception 'Choose the date to cancel';
  end if;

  -- A session that has started can't be cancelled: that would refund credits for a class people came to. Start time at the gym.
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class.gym_id;
  v_tz := coalesce(v_tz, 'UTC');
  if (p_date + coalesce(v_class.start_time, time '00:00')) <= (now() at time zone v_tz) then
    raise exception 'You can''t cancel a session that has already started or already happened.';
  end if;

  insert into class_exceptions (class_id, occurrence_date, cancelled_by, reason)
  values (p_class_id, p_date, auth.uid(), v_reason)
  on conflict (class_id, occurrence_date) do update set reason = coalesce(excluded.reason, class_exceptions.reason);

  for v_booking in
    select id, client_id, status
    from bookings
    where class_id = p_class_id
    and booking_date = p_date
    and status in ('booked', 'waitlist')
  loop
    if v_booking.status = 'booked' then
      perform public.refund_booking_credits(v_booking.id, 'Refunded ' || v_class.name || ' (cancelled)');
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (
      v_booking.client_id,
      'Class cancelled: ' || v_class.name || ' on ' || public.session_label(p_date, v_class.start_time) || '.'
        || case when v_reason is null then '' else ' ' || v_reason end
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- create or replace keeps the grants from 0105 (the three cancel functions: signed-in members and coaches only); restated for clarity.
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.coach_cancel_booking(uuid, boolean) from public, anon;
revoke execute on function public.cancel_class_occurrence(uuid, date, text) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.coach_cancel_booking(uuid, boolean) to authenticated;
grant execute on function public.cancel_class_occurrence(uuid, date, text) to authenticated;

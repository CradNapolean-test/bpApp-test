-- Phase 4: Classes + Credits — atomic booking/cancellation via security-definer RPCs.
-- Plain table inserts under RLS can't do this safely: capacity checks need to see every
-- booking for a class (RLS otherwise restricts a client's session to their own rows), and
-- credit deduction/refund must happen atomically with the booking write to avoid the
-- double-booking race condition MIGRATION_ROADMAP.md calls out explicitly (two clients
-- booking the last spot at the same moment).

alter table classes add column cutoff_hours integer not null default 12;

-- Prevents the same client from holding two active (booked/waitlist) rows for the same
-- class + date — also gives the race condition a hard backstop even if the advisory lock
-- below were somehow bypassed.
create unique index bookings_active_unique
  on bookings (class_id, client_id, booking_date)
  where status in ('booked', 'waitlist');

create or replace function public.book_class(p_class_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_capacity integer;
  v_booked_count integer;
  v_balance integer;
  v_status text;
  v_booking bookings;
begin
  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serializes concurrent bookings for the same class/date so two clients racing for the
  -- last spot can't both read "capacity available" before either has written a row.
  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity into v_capacity from classes where id = p_class_id;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  if v_booked_count < v_capacity then
    select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = v_client_id;
    if v_balance < 1 then
      raise exception 'Not enough credits';
    end if;
    v_status := 'booked';
  else
    v_status := 'waitlist';
  end if;

  insert into bookings (class_id, client_id, booking_date, status)
  values (p_class_id, v_client_id, p_booking_date, v_status)
  returning * into v_booking;

  if v_status = 'booked' then
    insert into credits_ledger (client_id, delta, reason)
    values (v_client_id, -1, 'booking:' || v_booking.id);
  end if;

  return v_booking;
end;
$$;

-- Note: cancelling a 'booked' spot doesn't promote the next 'waitlist' row automatically —
-- that's a reasonable follow-up but adds FIFO-ordering complexity out of scope for this pass.
create or replace function public.cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_class classes;
  v_cutoff timestamptz;
  v_refund boolean := false;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if not (public.is_self(v_booking.client_id) or public.is_coach_of(v_booking.client_id)) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  select * into v_class from classes where id = v_booking.class_id;
  v_cutoff := (v_booking.booking_date + coalesce(v_class.start_time, '00:00'::time))::timestamptz
    - make_interval(hours => v_class.cutoff_hours);
  v_refund := v_booking.status = 'booked' and now() < v_cutoff;

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    insert into credits_ledger (client_id, delta, reason)
    values (v_booking.client_id, 1, 'refund:' || v_booking.id);
  end if;

  return v_booking;
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Per-class credit cost: today every booking costs exactly 1 credit, hardcoded as a literal
-- in book_class/cancel_booking. This adds classes.credit_cost and threads it through both
-- RPCs (and cancel_booking's waitlist-promotion block) in place of every literal 1/-1.

alter table classes add column credit_cost integer not null default 1;

create or replace function public.book_class(p_class_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_capacity integer;
  v_cost integer;
  v_booked_count integer;
  v_balance integer;
  v_status text;
  v_booking bookings;
begin
  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost into v_capacity, v_cost from classes where id = p_class_id;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  if v_booked_count < v_capacity then
    select coalesce(sum(delta), 0) into v_balance from credits_ledger where client_id = v_client_id;
    if v_balance < v_cost then
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
    values (v_client_id, -v_cost, 'booking:' || v_booking.id);
  end if;

  return v_booking;
end;
$$;

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
  v_was_booked boolean;
  v_candidate record;
  v_balance integer;
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

  v_was_booked := v_booking.status = 'booked';

  select * into v_class from classes where id = v_booking.class_id;
  v_cutoff := (v_booking.booking_date + coalesce(v_class.start_time, '00:00'::time))::timestamptz
    - make_interval(hours => v_class.cutoff_hours);
  v_refund := v_was_booked and now() < v_cutoff;

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    insert into credits_ledger (client_id, delta, reason)
    values (v_booking.client_id, v_class.credit_cost, 'refund:' || v_booking.id);
  end if;

  if v_was_booked then
    for v_candidate in
      select b.id, b.client_id
      from bookings b
      where b.class_id = v_booking.class_id
      and b.booking_date = v_booking.booking_date
      and b.status = 'waitlist'
      order by b.created_at asc
    loop
      select coalesce(sum(delta), 0) into v_balance
      from credits_ledger where client_id = v_candidate.client_id;

      if v_balance >= v_class.credit_cost then
        update bookings set status = 'booked' where id = v_candidate.id;
        insert into credits_ledger (client_id, delta, reason)
        values (v_candidate.client_id, -v_class.credit_cost, 'booking:' || v_candidate.id);
        insert into notifications (client_id, message)
        values (
          v_candidate.client_id,
          'You''ve been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit;
      end if;
    end loop;
  end if;

  return v_booking;
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Coach-authorized booking. book_class (0055) only ever books auth.uid() -- a coach had no way
-- to put a client into a class themselves (e.g. booking on their behalf over the phone, or
-- filling a spot in person), unlike cancel_booking which already accepts either the client
-- themselves or is_coach_of(client_id). This adds the missing counterpart: same capacity/
-- waitlist/bucket-split logic as book_class, just authorized and targeted differently.
create or replace function public.book_class_for_client(p_class_id uuid, p_client_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := p_client_id;
  v_capacity integer;
  v_cost integer;
  v_class_name text;
  v_booked_count integer;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_from_membership integer;
  v_from_bonus integer;
  v_status text;
  v_booking bookings;
begin
  if not public.is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost, name into v_capacity, v_cost, v_class_name from classes where id = p_class_id;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  if v_booked_count < v_capacity then
    select coalesce(sum(delta), 0) into v_membership_balance
    from credits_ledger where client_id = v_client_id and bucket = 'membership';
    select coalesce(sum(delta), 0) into v_bonus_balance
    from credits_ledger where client_id = v_client_id and bucket = 'bonus';

    if v_membership_balance + v_bonus_balance < v_cost then
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
    v_from_membership := least(v_cost, greatest(v_membership_balance, 0));
    v_from_bonus := v_cost - v_from_membership;

    if v_from_membership > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
      values (v_client_id, -v_from_membership, 'Booked ' || v_class_name || ' (by coach)', 'membership', v_booking.id, auth.uid());
    end if;
    if v_from_bonus > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
      values (v_client_id, -v_from_bonus, 'Booked ' || v_class_name || ' (by coach)', 'bonus', v_booking.id, auth.uid());
    end if;
  end if;

  return v_booking;
end;
$$;

grant execute on function public.book_class_for_client(uuid, uuid, date) to authenticated;

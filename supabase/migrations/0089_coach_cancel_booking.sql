-- A coach removes one member from a session and chooses whether the credit is refunded.
-- (A member's own cancel_booking refunds only before the cutoff; this lets the coach decide, e.g.
-- refund for an illness, no refund for a no-notice absence.) Moves the next waitlisted member up.
-- Allowed for the member's own coach, or any coach at the gym the class belongs to.

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
  v_deduction record;
  v_candidate record;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_cost integer;
  v_from_membership integer;
  v_from_bonus integer;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;
  select * into v_class from classes where id = v_booking.class_id;
  if not (public.is_coach_of(v_booking.client_id) or v_class.gym_id = public.my_gym_id()) then
    raise exception 'Not authorized';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;

  v_was_booked := v_booking.status = 'booked';
  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_was_booked and p_refund then
    for v_deduction in
      select bucket, -delta as amount from credits_ledger where booking_id = p_booking_id and delta < 0
    loop
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (removed by coach)', v_deduction.bucket, p_booking_id);
    end loop;
  end if;

  insert into notifications (client_id, message)
  values (
    v_booking.client_id,
    'You have been taken off ' || v_class.name || ' on ' || v_booking.booking_date ||
      case when v_was_booked and p_refund then '. Your credit was refunded.' else '.' end
  );

  if v_was_booked then
    for v_candidate in
      select b.id, b.client_id
      from bookings b
      where b.class_id = v_booking.class_id
      and b.booking_date = v_booking.booking_date
      and b.status = 'waitlist'
      order by b.created_at asc
    loop
      v_cost := v_class.credit_cost;
      select coalesce(sum(delta), 0) into v_membership_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'membership';
      select coalesce(sum(delta), 0) into v_bonus_balance
      from credits_ledger where client_id = v_candidate.client_id and bucket = 'bonus';

      if v_membership_balance + v_bonus_balance >= v_cost then
        update bookings set status = 'booked' where id = v_candidate.id;

        v_from_membership := least(v_cost, greatest(v_membership_balance, 0));
        v_from_bonus := v_cost - v_from_membership;
        if v_from_membership > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_membership, 'Booked ' || v_class.name, 'membership', v_candidate.id);
        end if;
        if v_from_bonus > 0 then
          insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
          values (v_candidate.client_id, -v_from_bonus, 'Booked ' || v_class.name, 'bonus', v_candidate.id);
        end if;

        insert into notifications (client_id, message)
        values (
          v_candidate.client_id,
          'You have been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit;
      end if;
    end loop;
  end if;

  return v_booking;
end;
$fn$;

grant execute on function public.coach_cancel_booking(uuid, boolean) to authenticated;

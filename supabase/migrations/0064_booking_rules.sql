-- Booking rules from the owner's brief (BP app export):
--   * Cancel 3+ hours before a session to keep the credit; a blackout window (11pm-5am) means
--     a deadline that would land inside it moves back to the START of the blackout, i.e. an
--     early-morning session must be cancelled by 11pm the night before (this is what the
--     approved booking mockup shows).
--   * Advance booking limit per membership package (e.g. 14 days for Challenge, 19 for Full).
--
-- gyms.timezone: class start times are wall-clock times at the gym. cancel_booking previously
-- cast them with the DB session timezone (UTC), which is wrong for any gym not on UTC. The
-- default matches the app's existing DEFAULT_TIMEZONE so current behaviour is preserved --
-- SET IT to the real value per gym, e.g.:
--   update gyms set timezone = 'Europe/London' where name = 'Ballistic Performance';

alter table gyms add column if not exists timezone text not null default 'Pacific/Auckland';
alter table gyms add column if not exists blackout_start time default '23:00';
alter table gyms add column if not exists blackout_end time default '05:00';

alter table classes alter column cutoff_hours set default 3;

alter table membership_packages add column if not exists advance_booking_days integer
  check (advance_booking_days is null or advance_booking_days > 0); -- null = no limit

-- Deadline to cancel for a refund: session start minus the cutoff, pulled back to the start of
-- the blackout window if it would fall inside it. Wall-clock arithmetic (timestamp without tz)
-- first so DST changes can't shift the result, then interpreted in the gym's timezone.
create or replace function public.class_cancel_deadline(
  p_date date, p_start time, p_cutoff_hours integer, p_tz text,
  p_blackout_start time, p_blackout_end time
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_deadline timestamp := (p_date + coalesce(p_start, '00:00'::time)) - make_interval(hours => p_cutoff_hours);
  v_tod time := v_deadline::time;
  v_in_blackout boolean := false;
begin
  if p_blackout_start is not null and p_blackout_end is not null then
    if p_blackout_start > p_blackout_end then -- window wraps midnight (e.g. 23:00-05:00)
      v_in_blackout := v_tod >= p_blackout_start or v_tod < p_blackout_end;
    else
      v_in_blackout := v_tod >= p_blackout_start and v_tod < p_blackout_end;
    end if;
    if v_in_blackout then
      if v_tod >= p_blackout_start then
        v_deadline := v_deadline::date + p_blackout_start;
      else
        v_deadline := (v_deadline::date - 1) + p_blackout_start;
      end if;
    end if;
  end if;
  return v_deadline at time zone p_tz;
end;
$$;

-- ============ cancel_booking: blackout-aware deadline (rest unchanged from 0055) ============
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
  v_cutoff timestamptz;
  v_refund boolean := false;
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
  select * into v_gym from gyms where id = v_class.gym_id;
  v_cutoff := public.class_cancel_deadline(
    v_booking.booking_date, v_class.start_time, v_class.cutoff_hours,
    coalesce(v_gym.timezone, 'UTC'), v_gym.blackout_start, v_gym.blackout_end
  );
  v_refund := v_was_booked and now() < v_cutoff;

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    for v_deduction in
      select bucket, -delta as amount from credits_ledger where booking_id = p_booking_id and delta < 0
    loop
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name, v_deduction.bucket, p_booking_id);
    end loop;
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
          'You''ve been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit;
      end if;
    end loop;
  end if;

  return v_booking;
end;
$$;

-- ============ Advance-booking limit ============
-- A trigger rather than editing book_class / book_class_for_client, so both paths are covered
-- by one rule. Coach bookings on a client's behalf (auth.uid() != client) are exempt.
create or replace function public.enforce_advance_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_tz text;
begin
  if new.status not in ('booked', 'waitlist') or auth.uid() is distinct from new.client_id then
    return new;
  end if;

  select mp.advance_booking_days into v_days
  from client_memberships cm
  join membership_packages mp on mp.id = cm.package_id
  where cm.client_id = new.client_id and cm.ended_at is null;

  if v_days is null then
    return new;
  end if;

  select coalesce(g.timezone, 'UTC') into v_tz
  from classes c join gyms g on g.id = c.gym_id
  where c.id = new.class_id;

  if new.booking_date > ((now() at time zone coalesce(v_tz, 'UTC'))::date + v_days) then
    raise exception 'You can only book up to % days ahead', v_days;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_enforce_advance_window on bookings;
create trigger bookings_enforce_advance_window
  before insert on bookings
  for each row execute function public.enforce_advance_booking_window();

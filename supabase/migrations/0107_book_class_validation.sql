-- book_class accepted ANY date and ANY class id (found while building the mobile booking screen; reproduced on the
-- sandbox): a past date, a weekday the class does not run, a session the coach had cancelled, a date years away, and a
-- class belonging to a different gym. This function runs with the owner's rights (SECURITY DEFINER), so RLS does not
-- protect it. The credit maths below is an exact copy of 0055; only the four validation checks are new.
--
-- Not changed: book_class_for_client (the coach books on a member's behalf) keeps its own rules.

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
  v_class_name text;
  v_class_gym uuid;
  v_dow integer;
  v_specific date;
  v_tz text;
  v_booked_count integer;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_from_membership integer;
  v_from_bonus integer;
  v_status text;
  v_booking bookings;
begin
  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific
  from classes where id = p_class_id;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- Validation added in 0107 (the app only ever offers valid dates; the database must not trust that).
  -- 1. The class must be at the member's own gym (this function bypasses RLS, so check it explicitly).
  if v_class_gym is distinct from public.client_gym_id(v_client_id) then
    raise exception 'Class not found';
  end if;
  -- 2. Not in the past (the gym's own calendar day).
  select coalesce(timezone, 'UTC') into v_tz from gyms where id = v_class_gym;
  if p_booking_date < (now() at time zone coalesce(v_tz, 'UTC'))::date then
    raise exception 'You can''t book a session in the past';
  end if;
  -- 3. The session must actually run on that date: its one-off date, or its weekday (0 = Sunday).
  if not (
    (v_specific is not null and p_booking_date = v_specific)
    or (v_specific is null and v_dow is not null and extract(dow from p_booking_date)::integer = v_dow)
  ) then
    raise exception 'That session doesn''t run on that date';
  end if;
  -- 4. And it must not have been cancelled by the coach.
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_booking_date) then
    raise exception 'That session has been cancelled';
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
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_client_id, -v_from_membership, 'Booked ' || v_class_name, 'membership', v_booking.id);
    end if;
    if v_from_bonus > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
      values (v_client_id, -v_from_bonus, 'Booked ' || v_class_name, 'bonus', v_booking.id);
    end if;
  end if;

  return v_booking;
end;
$$;

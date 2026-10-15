-- Credits, bookings and integrity, part 1 (fix brief 03): refunds, retiring sessions, editing booked sessions, attendance and check-in.
--
--  CH4  A refund can no longer push a member above their plan's weekly allowance (D1: cap the refund). One shared function,
--       refund_booking_credits, now does every refund (cancel by member, cancel by coach, cancel a whole session, retire a session).
--  CH2  A session is retired, never deleted (D15): retire_class refunds and tells the members booked on its future dates; the
--       database refuses to delete a session that has any booking.
--  R26  A booked session can no longer be edited silently (capacity below the number booked, a changed day) and a changed start
--       time notifies the members booked on it.
--  SV1  Attendance cannot be marked for a session that has not happened yet.
--  L6   Check-in only works from 30 minutes before the class starts until 60 minutes after (D5), in the gym's timezone.
--
-- The brief reserved this file for classes and bookings and 0133 for credits, but retire_class has to refund, and a function in
-- 0132 cannot rely on one created in 0133, so the shared refund function (and the three cancel functions that use it) live here.
--
-- Each section starts with a read-only PRE-FLIGHT / measuring query: run them BEFORE applying this file. Apply after 0131.
-- Written to be re-run safely. Later migrations should start from the latest definition of each function named here.

-- =====================================================================================================================
-- CH4 (DECISION D1, recommended default: cap the refund). Refunds could push a member above their plan's allowance.
--
-- The weekly reset sets the "membership" bucket to exactly the plan's credits_per_week. A booking made before the reset was paid
-- from last week's credits, which the reset then wiped; cancelling it AFTER the reset refunded another credit on top:
-- 3 credits a week, book on Friday (3 to 2), Monday's reset (back to 3), cancel on Tuesday (+1 = 4 on a 3-credit plan), every week.
--
-- refund_booking_credits(booking, reason) returns the credits given back. It refunds what the booking cost, bucket by bucket
-- (so a booking paid partly from each bucket is returned the same way), but into the membership bucket only up to the plan's
-- allowance: least(cost, allowance - current membership balance), never below zero. Bonus credits always refund in full. A
-- member with no active plan is refunded in full (nothing to compare against). It nets off refunds already made, so calling it
-- twice for one booking never refunds twice. When the cap leaves nothing to give back it writes a ZERO row for the booking
-- ("cancelled in time, nothing to add") so the red flag report does not mistake it for a late cancel (a late cancel is a cancelled
-- booking with no refund row at all; red_flag_week_stats is redefined below to say exactly that).
-- If the owner chooses another rule (D1 options), only this function changes.
--
-- MEASURING QUERY (read-only; members over their allowance today. The brief measured 0 rows on 14 Oct, so this is latent):
--   select b.client_id, b.balance, p.credits_per_week
--   from credits_balance_by_bucket b
--   join client_memberships m on m.client_id = b.client_id and m.ended_at is null
--   join membership_packages p on p.id = m.package_id
--   where b.bucket = 'membership' and b.balance > p.credits_per_week;
-- PRE-FLIGHT (read-only; cancelled bookings that were refunded, which this migration does not touch):
--   select count(*) from public.bookings b where b.status = 'cancelled'
--     and exists (select 1 from public.credits_ledger l where l.booking_id = b.id and l.delta > 0);
-- =====================================================================================================================
create or replace function public.refund_booking_credits(p_booking uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_row record;
  v_allowance integer;
  v_membership_balance integer;
  v_amount integer;
  v_total integer := 0;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Refunded booking');
begin
  select client_id into v_client from bookings where id = p_booking;
  if v_client is null then
    return 0;
  end if;

  -- One member's credit movements one at a time, so the balance read below is the balance the refund lands on.
  perform pg_advisory_xact_lock(hashtext('credits:' || v_client::text));

  select mp.credits_per_week into v_allowance
  from client_memberships cm
  join membership_packages mp on mp.id = cm.package_id
  where cm.client_id = v_client and cm.ended_at is null
  limit 1;

  for v_row in
    -- What this booking still has charged against it, per bucket (deductions less refunds already made).
    select bucket, -sum(delta) as net
    from credits_ledger
    where booking_id = p_booking
    group by bucket
    having -sum(delta) > 0
    order by bucket
  loop
    v_amount := v_row.net;
    if v_row.bucket = 'membership' and v_allowance is not null then
      select coalesce(sum(delta), 0) into v_membership_balance
      from credits_ledger where client_id = v_client and bucket = 'membership';
      v_amount := least(v_amount, greatest(v_allowance - v_membership_balance, 0));
    end if;

    insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
    values (
      v_client,
      v_amount,
      case
        when v_amount = 0 then v_reason || ' (nothing to add: already at the weekly allowance)'
        when v_amount < v_row.net then v_reason || ' (limited to the weekly allowance)'
        else v_reason
      end,
      v_row.bucket,
      p_booking
    );
    v_total := v_total + v_amount;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.refund_booking_credits(uuid, text) from public, anon, authenticated;

-- A late cancel is a cancelled booking that was paid for and has NO refund row at all (0129 definition, one condition changed:
-- "delta > 0" became "delta >= 0", so the zero row refund_booking_credits writes when the cap leaves nothing to give back counts
-- as a refund decision, not a late cancel).
create or replace function public.red_flag_week_stats(p_gym uuid, p_week_start date)
returns table (
  client_id uuid,
  name text,
  coach_id uuid,
  status text,
  attended integer,
  late_cancels integer,
  no_shows integer,
  unmarked integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  with base as (
    select
      c.id as client_id,
      c.coach_id,
      coalesce((select cp.name from client_profiles cp where cp.client_id = c.id), c.email) as name,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
      ) as has_plan,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
          and m.started_at < p_week_start and (m.ended_at is null or m.ended_at >= p_week_start)
      ) as active_all_week,
      exists (
        select 1 from client_memberships m join membership_packages p on p.id = m.package_id
        where m.client_id = c.id and p.duration_weeks is null
          and m.started_at >= p_week_start
      ) as starts_in_or_after,
      exists (
        select 1 from membership_holds h
        where h.client_id = c.id and h.started_on <= p_week_start + 6 and (h.ended_on is null or h.ended_on >= p_week_start)
      ) as on_hold
    from profiles c
    where c.role = 'client'
      and p_gym is not null
      and public.client_gym_id(c.id) = p_gym
  )
  select
    b.client_id,
    b.name,
    b.coach_id,
    case
      when b.on_hold then 'hold'
      when b.active_all_week then 'covered'
      when b.starts_in_or_after then 'new'
      else 'ended'
    end as status,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'booked' and bk.attended) as attended,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'cancelled'
        and exists (select 1 from credits_ledger l where l.booking_id = bk.id and l.delta < 0)
        and not exists (select 1 from credits_ledger l where l.booking_id = bk.id and l.delta >= 0)) as late_cancels,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.status = 'booked' and bk.no_show) as no_shows,
    (select count(*)::int from bookings bk
      where bk.client_id = b.client_id and bk.booking_date between p_week_start and p_week_start + 6
        and bk.booking_date < current_date and bk.status = 'booked' and not bk.attended and not bk.no_show) as unmarked
  from base b
  where b.has_plan;
$fn$;

revoke all on function public.red_flag_week_stats(uuid, date) from public, anon, authenticated;

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
  if not coalesce(public.is_self(v_booking.client_id) or public.is_coach_of(v_booking.client_id), false) then
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
    perform public.refund_booking_credits(p_booking_id, 'Refunded ' || v_class.name);
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

-- cancel_class_occurrence: the 0130 definition (past dates refused, null-safe gym check) with the refund moved into the shared function.
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
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if p_date is null then
    raise exception 'Choose the date to cancel';
  end if;

  -- A session that has already happened can't be cancelled: that would refund credits for classes people attended.
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class.gym_id;
  if p_date < public.local_date(v_tz) then
    raise exception 'You can''t cancel a session that has already happened.';
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
      'Class cancelled: ' || v_class.name || ' on ' || p_date || '.' || case when v_reason is null then '' else ' ' || v_reason end
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

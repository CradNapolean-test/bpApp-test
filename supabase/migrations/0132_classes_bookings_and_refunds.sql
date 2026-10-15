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

-- =====================================================================================================================
-- CH2 (DECISION D15, recommended default: retire, never delete). Deleting a session destroyed its booking history.
--
-- bookings.class_id was ON DELETE CASCADE, so one click deleted the session and every booking ever made for it (upcoming, past,
-- attended), refunded nothing, told nobody, and lowered "sessions done" and the club progress. Now:
--   * classes.retired_at: a retired session keeps all its history but cannot be booked or edited into use. Listing screens must
--     filter on "retired_at is null" (brief 04); history keeps showing retired sessions by name.
--   * bookings.class_id is ON DELETE RESTRICT, and a readable trigger refuses a delete when ANY booking exists. A session with no
--     bookings at all (a mistaken new slot) can still be deleted.
--   * retire_class(p_class_id) cancels every booked or waitlisted booking on a FUTURE date (a date today counts only if the class
--     has not started yet), refunds the booked ones through refund_booking_credits, tells each member, then sets retired_at. Past
--     bookings and attendance are untouched. It answers {"cancelled": n, "refunded_credits": n, "already_retired": bool}.
--   * book_class and book_class_for_client refuse a retired session ('That session is no longer running'). Both now read the class
--     row FOR SHARE, and retire_class takes it FOR UPDATE, so a booking cannot slip in while a session is being retired.
--
-- PRE-FLIGHT (read-only; what retiring would touch, per session, and the foreign keys on bookings that will be replaced):
--   select c.id, c.name, c.day_of_week, count(*) filter (where b.booking_date >= current_date and b.status in ('booked','waitlist')) as future_bookings,
--          count(*) as all_bookings
--   from public.classes c left join public.bookings b on b.class_id = c.id group by 1, 2, 3 order by 4 desc;
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'f';
-- =====================================================================================================================
alter table public.classes add column if not exists retired_at timestamptz;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.bookings'::regclass and contype = 'f' and confrelid = 'public.classes'::regclass
  loop
    execute format('alter table public.bookings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.bookings
  add constraint bookings_class_id_fkey foreign key (class_id) references public.classes(id) on delete restrict;

create or replace function public.classes_refuse_delete_with_bookings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from bookings where class_id = old.id) then
    raise exception 'This session has bookings, so it can''t be deleted. Retire it instead: members booked on it will be refunded and told.';
  end if;
  return old;
end;
$$;

revoke execute on function public.classes_refuse_delete_with_bookings() from public, anon, authenticated;

drop trigger if exists classes_refuse_delete_with_bookings on public.classes;
create trigger classes_refuse_delete_with_bookings
  before delete on public.classes
  for each row execute function public.classes_refuse_delete_with_bookings();

create or replace function public.retire_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class classes;
  v_tz text;
  v_now_local timestamp;
  v_booking record;
  v_cancelled integer := 0;
  v_refunded integer := 0;
begin
  select * into v_class from classes where id = p_class_id for update;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if v_class.retired_at is not null then
    return jsonb_build_object('cancelled', 0, 'refunded_credits', 0, 'already_retired', true);
  end if;

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class.gym_id;
  v_now_local := now() at time zone v_tz;

  for v_booking in
    select b.id, b.client_id, b.status, b.booking_date
    from bookings b
    where b.class_id = p_class_id
      and b.status in ('booked', 'waitlist')
      and (b.booking_date + coalesce(v_class.start_time, time '00:00')) > v_now_local
    order by b.booking_date, b.created_at
  loop
    if v_booking.status = 'booked' then
      v_refunded := v_refunded + public.refund_booking_credits(v_booking.id, 'Refunded ' || v_class.name || ' (session retired)');
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (
      v_booking.client_id,
      'Class cancelled: ' || v_class.name || ' on ' || v_booking.booking_date || '. This session is no longer running.'
    );

    v_cancelled := v_cancelled + 1;
  end loop;

  update classes set retired_at = now() where id = p_class_id;

  return jsonb_build_object('cancelled', v_cancelled, 'refunded_credits', v_refunded, 'already_retired', false);
end;
$fn$;

revoke execute on function public.retire_class(uuid) from public, anon;
grant execute on function public.retire_class(uuid) to authenticated;

-- book_class [0107] and book_class_for_client [0130]: refuse a retired session; read the class row FOR SHARE (see above).
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
  v_retired timestamptz;
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

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date, retired_at
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific, v_retired
  from classes where id = p_class_id for share;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- 1. The class must be at the member's own gym (this function bypasses RLS, so check it explicitly).
  if v_class_gym is distinct from public.client_gym_id(v_client_id) then
    raise exception 'Class not found';
  end if;
  if v_retired is not null then
    raise exception 'That session is no longer running';
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

create or replace function public.book_class_for_client(p_class_id uuid, p_client_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client_id uuid := p_client_id;
  v_capacity integer;
  v_cost integer;
  v_class_name text;
  v_class_gym uuid;
  v_dow integer;
  v_specific date;
  v_retired timestamptz;
  v_tz text;
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

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date, retired_at
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific, v_retired
  from classes where id = p_class_id for share;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- 1. The class must be at the member's gym.
  if not public.same_gym_as_client(v_class_gym, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;
  if v_retired is not null then
    raise exception 'That session is no longer running';
  end if;
  -- 2. Not in the past (the gym's own calendar day).
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class_gym;
  if p_booking_date < public.local_date(v_tz) then
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
$fn$;

-- =====================================================================================================================
-- R26. Editing a booked session changed it silently.
-- Moving a 6 am class to 7 am, changing its weekday, or lowering its capacity below the number booked all saved with no check and no notice.
--   * before update (classes_guard_changes): capacity cannot go below the largest number of "booked" bookings on any upcoming date;
--     the weekday (or the one-off date) cannot change while anyone is booked or waitlisted on an upcoming date. The coach is told to
--     retire the slot and create a new one: the existing bookings are for specific dates, so moving the weekday would leave
--     them pointing at a day the class no longer runs. A signed-out system change (no signed-in user) is not held to these rules.
--   * after update (classes_notify_changes): when start_time changes, every member booked or waitlisted on an upcoming date gets
--     one in-app notification with the old and new time.
--
-- PRE-FLIGHT (read-only; sessions where a capacity or weekday change would be refused right now):
--   select c.id, c.name, c.capacity, max(x.booked) as most_booked_on_one_date
--   from public.classes c
--   join (select class_id, booking_date, count(*) filter (where status = 'booked') as booked
--         from public.bookings where booking_date >= current_date group by 1, 2) x on x.class_id = c.id
--   group by 1, 2, 3 order by 4 desc;
-- =====================================================================================================================
create or replace function public.classes_guard_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_most_booked integer;
begin
  if auth.uid() is null or new.retired_at is distinct from old.retired_at then
    return new;
  end if;

  select public.local_date(timezone) into v_today from gyms where id = new.gym_id;
  v_today := coalesce(v_today, current_date);

  if new.capacity < old.capacity then
    select coalesce(max(n), 0) into v_most_booked
    from (
      select count(*) as n from bookings
      where class_id = new.id and status = 'booked' and booking_date >= v_today
      group by booking_date
    ) x;
    if new.capacity < v_most_booked then
      raise exception '% members are already booked on one of the upcoming sessions, so the capacity can''t go below that.', v_most_booked;
    end if;
  end if;

  if (new.day_of_week is distinct from old.day_of_week or new.specific_date is distinct from old.specific_date)
     and exists (
       select 1 from bookings
       where class_id = new.id and status in ('booked', 'waitlist') and booking_date >= v_today
     ) then
    raise exception 'Members are already booked on upcoming sessions. Retire this slot and create a new one instead.';
  end if;

  return new;
end;
$$;

revoke execute on function public.classes_guard_changes() from public, anon, authenticated;

drop trigger if exists classes_guard_changes on public.classes;
create trigger classes_guard_changes
  before update on public.classes
  for each row execute function public.classes_guard_changes();

create or replace function public.classes_notify_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
begin
  select public.local_date(timezone) into v_today from gyms where id = new.gym_id;
  v_today := coalesce(v_today, current_date);

  insert into notifications (client_id, message)
  select distinct b.client_id,
    'Class time changed: ' || new.name || ' now starts at ' || coalesce(to_char(new.start_time, 'HH24:MI'), 'a time to be confirmed')
      || ' (it was ' || coalesce(to_char(old.start_time, 'HH24:MI'), 'a time to be confirmed') || ').'
  from bookings b
  where b.class_id = new.id and b.status in ('booked', 'waitlist') and b.booking_date >= v_today;

  return new;
end;
$$;

revoke execute on function public.classes_notify_changes() from public, anon, authenticated;

drop trigger if exists classes_notify_changes on public.classes;
create trigger classes_notify_changes
  after update on public.classes
  for each row
  when (old.start_time is distinct from new.start_time)
  execute function public.classes_notify_changes();

-- =====================================================================================================================
-- SV1. Attendance could be marked for sessions that had not happened yet.
-- A future "attended" counts toward sessions done, the 100/250/500 clubs and rewards. mark_attendance and mark_attendance_status
-- [0054] now refuse to mark a booking as attended (or a no-show) when its date is later than today at the gym (the gym's timezone).
-- Clearing a mark (unmarked / not attended) is still allowed on any date. The run-class screen has no date guard of its own;
-- brief 04 shows the message: "You can't mark attendance for a session that hasn't happened yet."
--
-- PRE-FLIGHT (read-only; attendance already marked for a date that has not happened, which this migration leaves alone):
--   select count(*) from public.bookings b join public.classes c on c.id = b.class_id join public.gyms g on g.id = c.gym_id
--   where (b.attended or b.no_show) and b.booking_date > (now() at time zone coalesce(g.timezone, 'UTC'))::date;
-- =====================================================================================================================
create or replace function public.mark_attendance(p_booking_id uuid, p_attended boolean)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_tz text;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1 from classes
    where classes.id = v_booking.class_id
    and classes.gym_id = public.my_gym_id()
  ) then
    raise exception 'Not authorized';
  end if;

  if p_attended then
    select coalesce(nullif(g.timezone, ''), 'UTC') into v_tz
    from classes c join gyms g on g.id = c.gym_id where c.id = v_booking.class_id;
    if v_booking.booking_date > public.local_date(v_tz) then
      raise exception 'You can''t mark attendance for a session that hasn''t happened yet.';
    end if;
  end if;

  update bookings
  set attended = p_attended, attended_at = case when p_attended then now() else null end
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.mark_attendance_status(p_booking_id uuid, p_status text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_tz text;
begin
  if p_status not in ('unmarked', 'attended', 'no_show') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1 from classes
    where classes.id = v_booking.class_id
    and classes.gym_id = public.my_gym_id()
  ) then
    raise exception 'Not authorized';
  end if;

  if p_status in ('attended', 'no_show') then
    select coalesce(nullif(g.timezone, ''), 'UTC') into v_tz
    from classes c join gyms g on g.id = c.gym_id where c.id = v_booking.class_id;
    if v_booking.booking_date > public.local_date(v_tz) then
      raise exception 'You can''t mark attendance for a session that hasn''t happened yet.';
    end if;
  end if;

  update bookings
  set
    attended = (p_status = 'attended'),
    no_show = (p_status = 'no_show'),
    attended_at = case when p_status = 'attended' then now() else null end
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- =====================================================================================================================
-- L6 (DECISION D5, recommended default). Check-in had no time window.
-- check_in_booking [0071] only required today's date, while the screen allowed 2 minutes before to 15 after the class start, so
-- the two disagreed. The server now allows check-in from 30 minutes BEFORE the class starts until 60 minutes AFTER, using the
-- gym's timezone and the class's start time:
--   CHECK_IN_OPENS_MINUTES_BEFORE = 30    -> 'Check-in opens 30 minutes before the class.'
--   CHECK_IN_CLOSES_MINUTES_AFTER = 60    -> 'Check-in has closed.'
-- These two numbers live in this function only; brief 07 (R17) makes the button follow the same numbers (and should export them as
-- constants in one place in the app). A class with no start time keeps the old rule: any time on the day.
--
-- PRE-FLIGHT (read-only; classes with no start time, which keep the day-long window):
--   select id, name from public.classes where start_time is null;
-- =====================================================================================================================
create or replace function public.check_in_booking(p_class_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_tz text;
  v_start time;
  v_start_at timestamptz;
begin
  select coalesce(nullif(g.timezone, ''), 'UTC'), c.start_time into v_tz, v_start
  from classes c
  join gyms g on g.id = c.gym_id
  where c.id = p_class_id;

  if v_tz is null then
    raise exception 'Class not found';
  end if;

  if p_booking_date <> public.local_date(v_tz) then
    raise exception 'You can only check in on the day of the session';
  end if;

  if v_start is not null then
    v_start_at := (p_booking_date + v_start) at time zone v_tz;
    if now() < v_start_at - interval '30 minutes' then
      raise exception 'Check-in opens 30 minutes before the class.';
    end if;
    if now() > v_start_at + interval '60 minutes' then
      raise exception 'Check-in has closed.';
    end if;
  end if;

  update public.bookings
  set
    attended = true,
    no_show = false,
    attended_at = coalesce(attended_at, now())
  where client_id = auth.uid()
    and class_id = p_class_id
    and booking_date = p_booking_date
    and status = 'booked'
  returning * into v_booking;

  if v_booking is null then
    raise exception 'No booking found to check in to';
  end if;

  return v_booking;
end;
$$;

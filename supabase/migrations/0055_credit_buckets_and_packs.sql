-- Deeper credit system: today every credit (membership top-up, manual bonus grant, booking
-- deduction, refund) lives in one undifferentiated sum(delta) pool. That means the weekly
-- membership reset (0005's replenish_due_memberships) wipes out manual bonus grants along
-- with the membership top-up, since it can't tell them apart. This migration splits the
-- ledger into two buckets -- 'membership' (reset-managed, never granted directly by a coach)
-- and 'bonus' (manual grants + credit packs, untouched by the weekly reset, can carry an
-- expiry) -- and adds a credit_packs catalog for one-off, optionally-expiring bundles
-- alongside the existing recurring membership_packages.

-- ============ credits_ledger: bucket + expiry + FK provenance ============
alter table credits_ledger add column bucket text not null default 'bonus' check (bucket in ('membership', 'bonus'));
alter table credits_ledger add column expires_at timestamptz;
alter table credits_ledger add column expired_at timestamptz; -- set once a sweep has clawed back (or found nothing left of) an expired grant, so it isn't reprocessed
alter table credits_ledger add column booking_id uuid references bookings(id) on delete set null;

-- Backfill: everything that was ever spent or replenished against the fused pool is
-- attributed to 'membership' (the reset-managed bucket, matching how the pool has actually
-- behaved historically) -- free-form manual grants (the column default) stay 'bonus'. This
-- can't be exact for historical data (there was only ever one pool), but it's the split that
-- keeps both buckets non-negative and matches intent going forward.
update credits_ledger
set bucket = 'membership'
where reason like 'membership reset:%'
   or reason like 'Booked %'
   or reason like 'Refunded %'
   or reason like 'booking:%'
   or reason like 'refund:%';

-- Bucketed counterpart to schema.sql's credits_balance view -- same "computed, never stored"
-- shape, just grouped one level finer so the app can show membership vs. bonus separately
-- without pulling a client's whole ledger history client-side to sum it.
create view credits_balance_by_bucket
  with (security_invoker = true) as
  select client_id, bucket, coalesce(sum(delta), 0)::integer as balance
  from credits_ledger
  group by client_id, bucket;

-- ============ credit_packs (coach-defined, gym-shared catalog) ============
-- One-off bundles for drop-in clients who aren't on a recurring membership -- unlike
-- membership_packages, granting one doesn't recur or reset; it's a single ledger grant that
-- optionally expires. Gym-scoped from the start (membership_packages only got there via
-- 0052/0054's later migration; gyms already exist by this point).
create table credit_packs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  gym_id uuid not null references gyms(id),
  name text not null,
  credits integer not null check (credits > 0),
  expires_after_days integer check (expires_after_days is null or expires_after_days > 0), -- null = never expires
  description text,
  created_at timestamptz default now()
);

alter table credit_packs enable row level security;

create policy "gym reads credit_packs"
  on credit_packs for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage credit_packs"
  on credit_packs for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

alter table credits_ledger add column pack_id uuid references credit_packs(id) on delete set null;

-- ============ book_class: split deduction across buckets ============
-- Draws membership-bucket credits first (they reset to zero weekly regardless, so spending
-- them ahead of bonus credits wastes nothing), falling back to bonus for any remainder. A
-- booking that spans both buckets gets two ledger rows, both tagged with the same booking_id
-- so cancel_booking can reverse exactly what was drawn, from the same buckets.
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

-- ============ cancel_booking: refund exactly what was deducted, bucket for bucket ============
-- Rather than recomputing a flat refund from the class's *current* credit_cost (which could
-- have changed since the booking was made, or been split across buckets), this looks up the
-- actual deduction row(s) for this booking_id and reverses each one in its own bucket.
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
  v_cutoff := (v_booking.booking_date + coalesce(v_class.start_time, '00:00'::time))::timestamptz
    - make_interval(hours => v_class.cutoff_hours);
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

-- ============ cancel_class_occurrence: same booking_id-matched refund as cancel_booking ============
create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_deduction record;
  v_count integer := 0;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if v_class.gym_id != public.my_gym_id() then
    raise exception 'Not authorized';
  end if;

  insert into class_exceptions (class_id, occurrence_date, cancelled_by)
  values (p_class_id, p_date, auth.uid())
  on conflict (class_id, occurrence_date) do nothing;

  for v_booking in
    select id, client_id, status
    from bookings
    where class_id = p_class_id
    and booking_date = p_date
    and status in ('booked', 'waitlist')
  loop
    if v_booking.status = 'booked' then
      for v_deduction in
        select bucket, -delta as amount from credits_ledger where booking_id = v_booking.id and delta < 0
      loop
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (cancelled)', v_deduction.bucket, v_booking.id);
      end loop;
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (v_booking.client_id, 'Class cancelled: ' || v_class.name || ' on ' || p_date || '.');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============ replenish_due_memberships: only ever touches the membership bucket ============
-- Same weekly top-up-to-exact-balance behaviour as before, just scoped to bucket='membership'
-- now -- a client's bonus credits (manual grants, credit packs) are never part of this sum and
-- so are never wiped out by a reset, additive per-source instead of one shared pool.
create or replace function public.replenish_due_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_week date := date_trunc('week', current_date)::date;
  v_membership record;
  v_balance integer;
  v_count integer := 0;
begin
  for v_membership in
    select cm.id, cm.client_id, mp.credits_per_week
    from client_memberships cm
    join membership_packages mp on mp.id = cm.package_id
    where cm.ended_at is null
    and (cm.last_reset_week is null or cm.last_reset_week < v_current_week)
  loop
    select coalesce(sum(delta), 0) into v_balance
    from credits_ledger
    where client_id = v_membership.client_id and bucket = 'membership';

    insert into credits_ledger (client_id, delta, reason, bucket)
    values (
      v_membership.client_id,
      v_membership.credits_per_week - v_balance,
      'membership reset: week of ' || v_current_week,
      'membership'
    );

    update client_memberships
    set last_reset_week = v_current_week
    where id = v_membership.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============ expire_bonus_credits: sweep due grants, clawing back only what's unspent ============
-- Mirrors replenish_due_memberships' idempotent-catch-up-safe shape: a daily cron trigger
-- rather than a precise per-grant timer means a missed day just resolves on the next run.
-- Since bonus credits are fungible within the bucket, "was *this* grant spent" is inherently
-- ambiguous once other bonus credits exist alongside it -- this processes due grants oldest-
-- expiry-first and claws back min(grant amount, current bonus balance), so the total clawed
-- back across a client's expiring grants never exceeds what they actually still have. Every
-- due grant gets expired_at stamped regardless of how much (if anything) was left to claw
-- back, so it's never reprocessed.
create or replace function public.expire_bonus_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant record;
  v_bonus_balance integer;
  v_clawback integer;
  v_count integer := 0;
begin
  for v_grant in
    select id, client_id, delta, reason
    from credits_ledger
    where bucket = 'bonus' and expires_at is not null and expires_at <= now() and expired_at is null and delta > 0
    order by expires_at asc
  loop
    select coalesce(sum(delta), 0) into v_bonus_balance
    from credits_ledger where client_id = v_grant.client_id and bucket = 'bonus';

    v_clawback := least(v_grant.delta, greatest(v_bonus_balance, 0));
    if v_clawback > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket)
      values (v_grant.client_id, -v_clawback, 'Expired: ' || v_grant.reason, 'bonus');
    end if;

    update credits_ledger set expired_at = now() where id = v_grant.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.book_class(uuid, date) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
-- cancel_class_occurrence, replenish_due_memberships already granted/withheld correctly by
-- earlier migrations (0041/0054, 0005) -- create or replace doesn't reset grants, and
-- expire_bonus_credits intentionally follows replenish_due_memberships' pattern: NOT granted
-- to authenticated, called only via the cron route's service-role admin client.

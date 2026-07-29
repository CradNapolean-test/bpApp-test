-- Progress photos (Storage) + chronological measurements, habit tracking, in-app
-- notifications, and waitlist auto-promotion on cancellation.

-- ============ Progress photos: Storage bucket + RLS ============
-- Private bucket -- these are body photos. Display goes through short-lived signed URLs
-- generated server-side (lib/data/progress.ts), never a public URL.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Objects are uploaded at path "{client_id}/{filename}" — storage.foldername(name) splits
-- the object path into folder segments, so element 1 is the client_id the photo belongs to.
create policy "select own or coached progress photos"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and public.owns_client(((storage.foldername(name))[1])::uuid)
  );

create policy "client uploads own progress photos"
  on storage.objects for insert
  with check (
    bucket_id = 'progress-photos'
    and public.is_self(((storage.foldername(name))[1])::uuid)
  );

create policy "client deletes own progress photos"
  on storage.objects for delete
  using (
    bucket_id = 'progress-photos'
    and public.is_self(((storage.foldername(name))[1])::uuid)
  );

-- ============ Chronological body measurements ============
-- Complements client_profiles' fixed start/goal fields the same way daily_logs.bodyweight
-- complements start_weight/goal_weight: a periodic actual-measurement log, not a target.
create table measurement_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  arm numeric,
  chest numeric,
  waist numeric,
  hips numeric,
  quad numeric,
  created_at timestamptz default now(),
  unique (client_id, log_date)
);

alter table measurement_logs enable row level security;

create policy "select own or coached measurement_logs"
  on measurement_logs for select
  using (owns_client(client_id));

create policy "client logs own measurements"
  on measurement_logs for insert
  with check (is_self(client_id));

create policy "client updates own measurements"
  on measurement_logs for update
  using (is_self(client_id));

-- ============ Habit tracking ============
create table habits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table habits enable row level security;

create policy "select own or coached habits"
  on habits for select
  using (owns_client(client_id));

create policy "coach manages habits"
  on habits for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id));

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  created_at timestamptz default now(),
  unique (habit_id, log_date)
);

alter table habit_logs enable row level security;

create policy "select own or coached habit_logs"
  on habit_logs for select
  using (
    exists (
      select 1 from habits
      where habits.id = habit_logs.habit_id
      and owns_client(habits.client_id)
    )
  );

create policy "client logs own habit_logs"
  on habit_logs for insert
  with check (
    exists (
      select 1 from habits
      where habits.id = habit_logs.habit_id
      and is_self(habits.client_id)
    )
  );

create policy "client updates own habit_logs"
  on habit_logs for update
  using (
    exists (
      select 1 from habits
      where habits.id = habit_logs.habit_id
      and is_self(habits.client_id)
    )
  );

-- ============ In-app notifications ============
-- Deliberately no insert policy for authenticated users -- only security-definer RPCs
-- (cancel_booking below) write these, the same reasoning replenish_due_memberships is
-- never granted to authenticated in 0005.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

alter table notifications enable row level security;

create policy "client reads own notifications"
  on notifications for select
  using (is_self(client_id));

create policy "client marks own notifications read"
  on notifications for update
  using (is_self(client_id));

-- ============ Waitlist auto-promotion on cancellation ============
-- Replaces the 0003 version: after cancelling a booked spot, promote the earliest
-- waitlisted booking for that class+date whose client has enough credit balance, and
-- notify them. Skips (doesn't cascade further) if nobody waitlisted can afford it.
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

  v_was_booked := v_booking.status = 'booked'; -- capture before we overwrite v_booking below

  select * into v_class from classes where id = v_booking.class_id;
  v_cutoff := (v_booking.booking_date + coalesce(v_class.start_time, '00:00'::time))::timestamptz
    - make_interval(hours => v_class.cutoff_hours);
  v_refund := v_was_booked and now() < v_cutoff;

  update bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;

  if v_refund then
    insert into credits_ledger (client_id, delta, reason)
    values (v_booking.client_id, 1, 'refund:' || v_booking.id);
  end if;

  -- Only a cancelled *booked* spot frees room for someone on the waitlist; cancelling an
  -- already-waitlisted entry doesn't change capacity.
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

      if v_balance >= 1 then
        update bookings set status = 'booked' where id = v_candidate.id;
        insert into credits_ledger (client_id, delta, reason)
        values (v_candidate.client_id, -1, 'booking:' || v_candidate.id);
        insert into notifications (client_id, message)
        values (
          v_candidate.client_id,
          'You''ve been moved off the waitlist for ' || v_class.name || ' on ' || v_booking.booking_date || '.'
        );
        exit; -- promote exactly one person per cancellation
      end if;
    end loop;
  end if;

  return v_booking;
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;

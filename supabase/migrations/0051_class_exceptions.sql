-- Single-occurrence class cancellation. getScheduleOccurrences (lib/data/classes.ts) generates
-- occurrences purely virtually from classes.day_of_week -- no per-occurrence row exists
-- anywhere, so today a coach can only edit/delete the whole recurring class, never just one
-- date. This table is what getScheduleOccurrences filters against to skip a cancelled date;
-- the RPC below is the bulk refund+notify path, reusing cancel_booking's exact refund-reason
-- format (0043) but as one bulk pass instead of per-booking, and explicitly skipping
-- cancel_booking's waitlist-promotion step -- there's no seat to promote into once the whole
-- occurrence is gone.
create table class_exceptions (
  class_id uuid not null references classes(id) on delete cascade,
  occurrence_date date not null,
  cancelled_at timestamptz not null default now(),
  cancelled_by uuid references profiles(id),
  primary key (class_id, occurrence_date)
);

alter table class_exceptions enable row level security;

-- Readable by any authenticated user (clients need to know a date is cancelled before they
-- try to book it) -- same "authenticated users read classes" shape classes itself already uses.
create policy "authenticated users read class_exceptions"
  on class_exceptions for select
  to authenticated
  using (true);

create policy "coach manages own class_exceptions"
  on class_exceptions for all
  using (exists (select 1 from classes where classes.id = class_exceptions.class_id and classes.coach_id = auth.uid()))
  with check (exists (select 1 from classes where classes.id = class_exceptions.class_id and classes.coach_id = auth.uid()));

create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_count integer := 0;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if v_class.coach_id != auth.uid() then
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
      insert into credits_ledger (client_id, delta, reason)
      values (v_booking.client_id, v_class.credit_cost, 'Refunded ' || v_class.name || ' (cancelled)');
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (v_booking.client_id, 'Class cancelled: ' || v_class.name || ' on ' || p_date || '.');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.cancel_class_occurrence(uuid, date) to authenticated;

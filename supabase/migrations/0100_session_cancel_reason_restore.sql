-- Cancelling one date of a session can carry a reason (sent to the members who were booked), and a cancelled
-- date can be put back. Restoring only re-opens the date: bookings that were cancelled (and refunded) stay
-- cancelled, so members book again themselves.

alter table class_exceptions add column if not exists reason text;

-- Replaces the two-argument version from 0055 (same refund logic, plus the reason).
drop function if exists public.cancel_class_occurrence(uuid, date);

create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date, p_reason text default null)
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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if v_class.gym_id != public.my_gym_id() then
    raise exception 'Not authorized';
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
      for v_deduction in
        select bucket, -delta as amount from credits_ledger where booking_id = v_booking.id and delta < 0
      loop
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (cancelled)', v_deduction.bucket, v_booking.id);
      end loop;
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

grant execute on function public.cancel_class_occurrence(uuid, date, text) to authenticated;

create or replace function public.restore_class_occurrence(p_class_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if v_class.gym_id != public.my_gym_id() then
    raise exception 'Not authorized';
  end if;

  delete from class_exceptions where class_id = p_class_id and occurrence_date = p_date;
end;
$$;

grant execute on function public.restore_class_occurrence(uuid, date) to authenticated;

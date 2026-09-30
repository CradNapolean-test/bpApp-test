-- A member checking in to a session they've booked counts as attending it. Only the member's own
-- booking, only on the day of the session (gym's local date), only while it's a live booking.
-- A coach can still change it to No-show / Unmarked afterwards with mark_attendance_status.

create or replace function public.check_in_booking(p_class_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_tz text;
begin
  select g.timezone into v_tz
  from classes c
  join gyms g on g.id = c.gym_id
  where c.id = p_class_id;

  if v_tz is null then
    raise exception 'Class not found';
  end if;

  if p_booking_date <> (now() at time zone v_tz)::date then
    raise exception 'You can only check in on the day of the session';
  end if;

  update bookings
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

revoke all on function public.check_in_booking(uuid, date) from public;
grant execute on function public.check_in_booking(uuid, date) to authenticated;

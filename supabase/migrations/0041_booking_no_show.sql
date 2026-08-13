-- Attendance was a 2-state boolean (attended / not-attended), but the redesign's Take
-- Attendance screen wants a real 3-state cycle: Unmarked -> Attended -> No-show -> Unmarked.
-- Collapsing "unmarked" and "no-show" into a single `!attended` was also a real reporting
-- bug: lib/data/reports.ts's no-show count treated every not-yet-marked past booking as a
-- no-show, inflating the number for classes the coach simply hadn't gotten to yet.
alter table bookings add column no_show boolean not null default false;

-- Supersedes mark_attendance (kept, unused by the new UI, not dropped -- no call site should
-- ever need a 2-state write again, but nothing forces that migration atomically).
create or replace function public.mark_attendance_status(p_booking_id uuid, p_status text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
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
    and classes.coach_id = auth.uid()
  ) then
    raise exception 'Not authorized';
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

grant execute on function public.mark_attendance_status(uuid, text) to authenticated;

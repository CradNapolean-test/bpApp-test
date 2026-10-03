-- How many people are booked into each session, for everyone in the gym to see.
--
-- Members can only read their own bookings (a privacy rule), so counting bookings from the
-- member's side only ever saw their own and "spots left" was too high. This returns just the
-- counts, never who is booked, for sessions at the caller's own gym.

create or replace function public.class_booking_counts(p_class_ids uuid[], p_dates date[])
returns table (class_id uuid, booking_date date, booked_count integer)
language sql
security definer
stable
set search_path = public
as $fn$
  select b.class_id, b.booking_date, count(*)::integer
  from bookings b
  join classes c on c.id = b.class_id
  where b.class_id = any(p_class_ids)
    and b.booking_date = any(p_dates)
    and b.status = 'booked'
    and (c.gym_id = public.my_gym_id() or c.gym_id = public.client_gym_id(auth.uid()))
  group by b.class_id, b.booking_date;
$fn$;

grant execute on function public.class_booking_counts(uuid[], date[]) to authenticated;

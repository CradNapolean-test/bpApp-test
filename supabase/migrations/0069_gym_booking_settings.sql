-- Lets a gym admin change the gym's timezone and cancellation blackout window from the app
-- (previously only settable with SQL). Same pattern as set_gym_name (0052): gyms has no update
-- policy, so writes go through a narrow security-definer function that checks is_gym_admin.
--
-- A null blackout (both p_blackout_start and p_blackout_end null) means "no blackout": the
-- cancellation deadline is then plain start-minus-cutoff (see class_cancel_deadline, 0064).

create or replace function public.set_gym_booking_settings(
  p_timezone text,
  p_blackout_start time,
  p_blackout_end time
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;

  -- Reject anything that isn't a real IANA timezone name (raises invalid_parameter_value).
  perform now() at time zone p_timezone;

  if (p_blackout_start is null) <> (p_blackout_end is null) then
    raise exception 'Set both the blackout start and end, or neither';
  end if;

  update gyms
  set timezone = p_timezone,
      blackout_start = p_blackout_start,
      blackout_end = p_blackout_end
  where id = public.my_gym_id();
end;
$$;

grant execute on function public.set_gym_booking_settings(text, time, time) to authenticated;

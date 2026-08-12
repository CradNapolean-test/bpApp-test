-- Three nutrition-tracking modes a coach can set per client: full granular Food Tracking
-- (default, unchanged behaviour), manual macro entry via Weekly Log only (no diary UI), or a
-- photo-based diary (0035). Lives on client_profiles, same table as every other Setup/calc-
-- engine field (age, gender, activity_level, etc.) -- not `profiles`, which only holds
-- auth/role data.
alter table client_profiles add column nutrition_tracking_mode text not null default 'full_tracking'
  check (nutrition_tracking_mode in ('full_tracking', 'manual_import', 'photo_diary'));

-- client_profiles' only UPDATE policy is is_self(client_id) (the client's own Setup-tab
-- save) -- a coach-configured field needs the same narrow security-definer RPC pattern
-- already used for checkin_reminder_days (0011), not a raw update from the coach's session
-- (which would silently match zero rows under RLS, no error).
create or replace function public.set_nutrition_tracking_mode(p_client_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;
  if p_mode not in ('full_tracking', 'manual_import', 'photo_diary') then
    raise exception 'Invalid nutrition tracking mode';
  end if;

  update client_profiles
  set nutrition_tracking_mode = p_mode
  where client_id = p_client_id;
end;
$$;

grant execute on function public.set_nutrition_tracking_mode(uuid, text) to authenticated;

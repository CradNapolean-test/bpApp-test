-- A coach can now edit the Personal details & goals form (including the calorie-engine inputs:
-- activity level, diet approach, tier, cycling) for their own clients. Until now client_profiles
-- only had an update policy for the member themselves, so a coach's save silently matched zero
-- rows. Members keep editing their own row as before.
drop policy if exists "coach updates coached client_profiles" on public.client_profiles;
create policy "coach updates coached client_profiles"
  on public.client_profiles for update
  using (public.is_coach_of(client_id))
  with check (public.is_coach_of(client_id));

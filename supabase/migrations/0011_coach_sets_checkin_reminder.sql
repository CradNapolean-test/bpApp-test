-- Bug fix: client_profiles only has an RLS update policy for is_self(client_id) (the
-- client's own Setup-tab save). The coach-only "Days of inactivity" control in
-- CreditsTab.tsx has been silently failing since it shipped -- the raw update from
-- lib/data/clientProfile.ts's updateCheckinReminderDays matches zero rows when called by
-- the coach (no error, no write). Fixed with a narrow security-definer RPC, same pattern
-- already used for assign_membership/mark_attendance/assign_form: the coach gets exactly
-- this one field, not a blanket client_profiles update grant.
create or replace function public.set_checkin_reminder_days(p_client_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  update client_profiles
  set checkin_reminder_days = p_days
  where client_id = p_client_id;
end;
$$;

grant execute on function public.set_checkin_reminder_days(uuid, integer) to authenticated;

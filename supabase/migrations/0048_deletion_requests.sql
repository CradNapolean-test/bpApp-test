-- Account deletion: request-based, not self-service hard-delete. A client can flag that they
-- want their account gone; the coach sees it and handles the actual delete (already cascades
-- via this schema's existing on-delete-cascade FKs) once they've dealt with anything offline
-- (refunds, records) -- no new destructive code path.
alter table client_profiles
  add column deletion_requested_at timestamptz;

-- Client-owned (request AND un-request, in case they change their mind) -- already covered by
-- the existing "client updates own client_profiles" policy, same as every other Setup field.
-- No RPC needed for the write itself.

-- Mirrors get_my_coach_display_name (0042) exactly -- a client can't read their coach's own
-- profiles row directly (owns_client only covers the coach-reads-client direction, not the
-- reverse), so this is the narrow read-only exception needed to email the coach a deletion
-- notice from application code (Postgres can't send email directly, see 0039's comment).
create or replace function public.get_my_coach_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coach.email
  from profiles me
  join profiles coach on coach.id = me.coach_id
  where me.id = auth.uid();
$$;

grant execute on function public.get_my_coach_email() to authenticated;

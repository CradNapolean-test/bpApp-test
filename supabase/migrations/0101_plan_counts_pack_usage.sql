-- Numbers the Business screen needs for every coach at the gym (not only admins), without opening up the member rows:
--   * how many members are on each plan right now (so editing or deleting a plan can warn about them)
--   * how often each credit pack has been granted, and when last

create or replace function public.plan_member_counts()
returns table (package_id uuid, member_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select cm.package_id, count(*)::integer
  from client_memberships cm
  join profiles p on p.id = cm.client_id
  where cm.ended_at is null
    and p.gym_id = public.my_gym_id()
  group by cm.package_id;
$$;

grant execute on function public.plan_member_counts() to authenticated;

create or replace function public.credit_pack_usage()
returns table (pack_id uuid, times_granted integer, last_granted timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.pack_id, count(*)::integer, max(l.created_at)
  from credits_ledger l
  join profiles p on p.id = l.client_id
  where l.pack_id is not null
    and p.gym_id = public.my_gym_id()
  group by l.pack_id;
$$;

grant execute on function public.credit_pack_usage() to authenticated;

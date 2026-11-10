-- Plans, credit packs and rewards are changed by a gym admin or the owner only (decision D3, chosen by the owner on 6 Nov 2026;
-- live review BO13, DB18, CV24, RO21).
--
-- Before: one "for all" rule per table let every coach whose ACTIVE gym is the row's gym add, change and delete it
-- (gym_id = my_gym_id()). A floor coach could change the plan that sets every member's weekly credits and booking window, add or
-- delete credit packs, and delete a reward (which also deletes the record of who received it). The owner could not even read them.
--
-- After:
--   * can_manage_gym_business(gym): true for a coach with the Admin switch on for THAT gym (coach_gym_memberships.is_gym_admin, the
--     switch on the owner's Team tab), and for the owner of the gym's organisation.
--   * membership_packages, credit_packs, rewards: the "for all" rule is replaced by separate add / change / remove rules that need
--     can_manage_gym_business(gym_id). The read rules are unchanged (every coach and member of the gym still reads them), and the
--     owner gets a read rule for the gyms in their organisation.
--   * owner_plan_member_counts(gym): members on each plan at one gym, for the owner's Plans screen (plan_member_counts() only knows
--     the caller's active gym, which an owner does not have).
--
-- Not changed: handing out a reward (reward_grants, any coach at the member's gym), granting a pack or starting a plan for a member
-- (grant_credit_pack, start_membership: the member's own coach, decision RO12 still open), events and feedback.
--
-- After this, a coach who is not an admin at a gym gets "Only a gym admin can change ..." there. Check the admins first (the
-- PRE-FLIGHT's second query): on 6 Nov Brad was not an admin at Salford Quays (BO16), so the owner needs to switch him on in
-- Owner -> Salford Quays -> Team before he can change plans there.
--
-- PRE-FLIGHT (read-only):
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename in ('membership_packages', 'credit_packs', 'rewards') order by 1, 2;
-- Expected before: on each table "gym reads <table>" (SELECT) and "gym coaches manage <table>" (ALL); membership_packages also has
-- "coach reads plans of own clients" (SELECT).
--
--   -- Who will be able to change plans, packs and rewards at each gym (besides the owner):
--   select g.name as gym, p.email, coalesce(p.display_name, '') as name, m.is_gym_admin
--   from coach_gym_memberships m join gyms g on g.id = m.gym_id join profiles p on p.id = m.coach_id
--   where p.role = 'coach' and p.deactivated_at is null
--   order by g.name, m.is_gym_admin desc, p.email;
--
-- CHECK (read-only, after running):
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in ('membership_packages', 'credit_packs', 'rewards') order by 1, 2;
-- Expected after, on each table: "gym admins add <table>" (INSERT), "gym admins change <table>" (UPDATE), "gym admins remove <table>"
-- (DELETE), "gym reads <table>" (SELECT), "owner reads <table>" (SELECT); membership_packages also "coach reads plans of own clients".
-- No "gym coaches manage ..." rule is left.
--
--   select proname, prosecdef from pg_proc
--   where pronamespace = 'public'::regnamespace and proname in ('can_manage_gym_business', 'owner_plan_member_counts');
-- Expected: two rows, prosecdef = true.
--
-- REVERSE (puts the old rules back):
--   drop policy if exists "gym admins add membership_packages" on public.membership_packages;
--   drop policy if exists "gym admins change membership_packages" on public.membership_packages;
--   drop policy if exists "gym admins remove membership_packages" on public.membership_packages;
--   drop policy if exists "owner reads membership_packages" on public.membership_packages;
--   create policy "gym coaches manage membership_packages" on public.membership_packages for all to authenticated
--     using (gym_id = public.my_gym_id()) with check (gym_id = public.my_gym_id());
--   (the same four drops and one create for credit_packs and rewards)
--   drop function if exists public.owner_plan_member_counts(uuid);
--   drop function if exists public.can_manage_gym_business(uuid);
--
-- Safe to run again.

-- ============ who may change a gym's plans, packs and rewards ============
create or replace function public.can_manage_gym_business(p_gym uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_gym is not null and (
    exists (
      select 1
      from coach_gym_memberships m
      join profiles p on p.id = m.coach_id
      where m.coach_id = auth.uid()
        and m.gym_id = p_gym
        and m.is_gym_admin
        and p.role = 'coach'
        and p.deactivated_at is null
    )
    or coalesce(public.is_owner_of_gym(p_gym), false)
  );
$$;

revoke execute on function public.can_manage_gym_business(uuid) from public, anon;
grant execute on function public.can_manage_gym_business(uuid) to authenticated;

-- ============ membership_packages (plans) ============
drop policy if exists "gym coaches manage membership_packages" on public.membership_packages;

drop policy if exists "gym admins add membership_packages" on public.membership_packages;
create policy "gym admins add membership_packages"
  on public.membership_packages for insert
  to authenticated
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins change membership_packages" on public.membership_packages;
create policy "gym admins change membership_packages"
  on public.membership_packages for update
  to authenticated
  using (public.can_manage_gym_business(gym_id))
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins remove membership_packages" on public.membership_packages;
create policy "gym admins remove membership_packages"
  on public.membership_packages for delete
  to authenticated
  using (public.can_manage_gym_business(gym_id));

drop policy if exists "owner reads membership_packages" on public.membership_packages;
create policy "owner reads membership_packages"
  on public.membership_packages for select
  to authenticated
  using (public.is_owner_of_gym(gym_id));

-- ============ credit_packs ============
drop policy if exists "gym coaches manage credit_packs" on public.credit_packs;

drop policy if exists "gym admins add credit_packs" on public.credit_packs;
create policy "gym admins add credit_packs"
  on public.credit_packs for insert
  to authenticated
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins change credit_packs" on public.credit_packs;
create policy "gym admins change credit_packs"
  on public.credit_packs for update
  to authenticated
  using (public.can_manage_gym_business(gym_id))
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins remove credit_packs" on public.credit_packs;
create policy "gym admins remove credit_packs"
  on public.credit_packs for delete
  to authenticated
  using (public.can_manage_gym_business(gym_id));

drop policy if exists "owner reads credit_packs" on public.credit_packs;
create policy "owner reads credit_packs"
  on public.credit_packs for select
  to authenticated
  using (public.is_owner_of_gym(gym_id));

-- ============ rewards ============
drop policy if exists "gym coaches manage rewards" on public.rewards;

drop policy if exists "gym admins add rewards" on public.rewards;
create policy "gym admins add rewards"
  on public.rewards for insert
  to authenticated
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins change rewards" on public.rewards;
create policy "gym admins change rewards"
  on public.rewards for update
  to authenticated
  using (public.can_manage_gym_business(gym_id))
  with check (public.can_manage_gym_business(gym_id));

drop policy if exists "gym admins remove rewards" on public.rewards;
create policy "gym admins remove rewards"
  on public.rewards for delete
  to authenticated
  using (public.can_manage_gym_business(gym_id));

drop policy if exists "owner reads rewards" on public.rewards;
create policy "owner reads rewards"
  on public.rewards for select
  to authenticated
  using (public.is_owner_of_gym(gym_id));

-- ============ members on each plan, for the owner ============
-- The same count as plan_member_counts() (0101), for a gym the owner names instead of the caller's active gym.
create or replace function public.owner_plan_member_counts(p_gym uuid)
returns table (package_id uuid, member_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;
  return query
    select cm.package_id, count(*)::integer
    from client_memberships cm
    join profiles p on p.id = cm.client_id
    where cm.ended_at is null
      and p.gym_id = p_gym
    group by cm.package_id;
end;
$$;

revoke execute on function public.owner_plan_member_counts(uuid) from public, anon;
grant execute on function public.owner_plan_member_counts(uuid) to authenticated;

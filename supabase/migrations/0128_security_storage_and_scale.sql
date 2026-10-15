-- Security access rules, part 2 (fix brief 01): logged-out cost, shared devices, shared food data, library links, branding uploads.
--
--  R9   Row-level rules no longer apply to logged-out callers, so they get an instant empty answer instead of a slow failure.
--  M3   One browser push address can only belong to one person at a time (database half; the app switches over in brief 07).
--  M12  Coaches can correct or hide a wrong scanned food.
--  R23  Exercise library image and video links must be https:// addresses.
--  CM5  Only coaches can upload to the public coach-branding bucket, and only small images.
--
-- Apply 0127 first. Each section starts with a read-only PRE-FLIGHT query: run them BEFORE applying this file.
-- Written to be re-run safely.

-- =====================================================================================================================
-- R9. A logged-out request did expensive work, then failed.
-- Most access rules were written without a TO clause, which means they apply to the "public" role and so also to logged-out
-- callers. For a logged-out call the database still ran the rule's helper functions on every row before refusing (a
-- logged-out read of daily_logs timed out after about 3 seconds). Rules limited to "authenticated" do not apply to a logged-out
-- caller at all, so with RLS on and no rule that applies, the answer is an immediate empty result.
--
-- Nothing the app does while logged out reads these tables with the public key: /join/[token] and /api/join use the service
-- role, /login and /reset-password only call Auth, /auth/confirm only verifies a code, and the middleware only asks Auth who
-- is signed in. Every "using (true)" rule in the schema is already "to authenticated". The service role is unaffected (it
-- bypasses row-level security).
--
-- v_keep is the hard-coded exception list ('table.policy' names a rule that must stay open to logged-out callers). It is empty
-- on purpose: add a name here, with a comment saying why, if a logged-out screen ever needs to read a table directly.
--
-- Indexes: profiles(coach_id) and profiles(gym_id) already exist (0061), and daily_logs has unique (client_id, log_date), so
-- the columns the helper functions filter on are already indexed. No new index is added without an EXPLAIN from the sandbox.
--
-- PRE-FLIGHT (read-only; the rules this will move from "public" to "authenticated"):
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' and roles = array['public']::name[] order by 1, 2;
-- AFTER (expect zero rows):
--   select tablename, policyname from pg_policies where schemaname = 'public' and roles = array['public']::name[];
-- =====================================================================================================================
do $$
declare
  p record;
  v_keep text[] := array[]::text[];
  v_moved integer := 0;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = array['public']::name[]
  loop
    if (p.tablename || '.' || p.policyname) = any (v_keep) then
      continue;
    end if;
    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
    v_moved := v_moved + 1;
  end loop;
  raise notice 'R9: % access rules moved from public to authenticated', v_moved;
end $$;

-- The row-level-security helper functions (they take an id, or read the caller's own row) were still executable by logged-out
-- callers. With the rules above no longer applying to them, nothing logged-out needs them. Signed-in callers keep their grant.
-- This block is separate on purpose: if a logged-out flow is ever found to need one, re-grant it with
--   grant execute on function public.<name>(<args>) to anon;
revoke execute on function public.is_self(uuid) from public, anon;
revoke execute on function public.is_coach_of(uuid) from public, anon;
revoke execute on function public.owns_client(uuid) from public, anon;
revoke execute on function public.my_coach_id() from public, anon;
revoke execute on function public.my_gym_id() from public, anon;
revoke execute on function public.client_gym_id(uuid) from public, anon;
revoke execute on function public.is_same_gym_as_client(uuid) from public, anon;
revoke execute on function public.is_admin_of_gym(uuid) from public, anon;
revoke execute on function public.shares_gym_membership(uuid) from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.my_org_id() from public, anon;
revoke execute on function public.is_owner_of_gym(uuid) from public, anon;

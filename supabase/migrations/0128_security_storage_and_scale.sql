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

-- =====================================================================================================================
-- M3 (database half). One browser push address could belong to two members.
-- push_subscriptions was unique on (client_id, endpoint), so after member A signed out of a shared phone and member B turned
-- push on, both rows existed and A's notifications (with message previews) reached whoever held the phone. Now:
--   * the endpoint itself is unique (existing duplicates are removed first, keeping the most recently used);
--   * register_web_push(endpoint, p256dh, auth) is the way to register: it never takes a member id, moves the endpoint to the
--     caller if someone else held it, refreshes it if the caller already held it, and keeps at most 5 browsers per person.
--     It mirrors register_push_device (0113). Coaches may call it too: 0060 always let any signed-in user subscribe.
-- The table's own "client manages own push_subscriptions" rule is left as it is for now, because the web app still writes
-- there directly until brief 07 (R18) switches it to this function. Until then, a member who turns push on in a browser that
-- still holds another member's subscription gets an error instead of the old silent sharing. Once the app uses the function,
-- the insert/update half of that rule can be dropped.
--
-- PRE-FLIGHT (read-only; endpoints held by more than one row. The rows other than the newest are deleted by this migration):
--   select endpoint, count(*) as holders from public.push_subscriptions group by 1 having count(*) > 1;
-- =====================================================================================================================
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz not null default now();

delete from public.push_subscriptions p
using (
  select id,
         row_number() over (partition by endpoint order by last_seen_at desc, created_at desc nulls last, id desc) as rn
  from public.push_subscriptions
) d
where p.id = d.id and d.rn > 1;

create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);

create or replace function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authorized';
  end if;

  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048 then
    raise exception 'That is not a valid push address';
  end if;
  if coalesce(p_p256dh, '') = '' or char_length(p_p256dh) > 256
     or coalesce(p_auth, '') = '' or char_length(p_auth) > 256 then
    raise exception 'That is not a valid push subscription';
  end if;

  -- A browser belongs to one person at a time: if it was someone else's, it is now the caller's.
  delete from push_subscriptions where endpoint = p_endpoint and client_id <> v_me;

  insert into push_subscriptions (client_id, endpoint, p256dh, auth, last_seen_at)
  values (v_me, p_endpoint, p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_seen_at = now();

  -- At most 5 browsers per person: keep the ones used most recently.
  delete from push_subscriptions
  where client_id = v_me
    and id not in (
      select id from push_subscriptions
      where client_id = v_me
      order by last_seen_at desc, created_at desc nulls last, id desc
      limit 5
    );
end;
$$;

revoke execute on function public.register_web_push(text, text, text) from public, anon;
grant execute on function public.register_web_push(text, text, text) to authenticated;

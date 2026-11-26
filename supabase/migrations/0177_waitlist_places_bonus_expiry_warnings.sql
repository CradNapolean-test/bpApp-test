-- Classes and booking (live review Build 5: BK5, CS5, BK18, RO16; 26 Nov 2026).
--
-- Before: a member on a waitlist could not see their place in the queue, because Row Level Security lets a member read only their own
-- bookings, so the app cannot count the people ahead of them (BK5). Bonus credits with an expiry date simply disappeared on the day:
-- expire_bonus_credits (0055, 0157) takes back what is left, and the member was never told it was coming (RO16).
--
-- New (each function is "security definer" with "set search_path = public" and checks its caller first):
--   1. my_waitlist_places() -> table (booking_id, class_id, booking_date, place). For the member's Book screen and My bookings, and the
--      phone app's later. Answers only the CALLER'S OWN waitlist bookings (client_id = auth.uid()), from yesterday on, each with its place
--      in that session's queue: 1 + the waitlist bookings for the same session and date ahead of it, in the order promote_from_waitlist
--      (0158) moves people in (created_at, then id). Never anyone else's booking, id or name: only a number about the caller's own row.
--      Signed out: not callable (permission denied). A coach or the owner gets their own waitlist places, which is none; the coach's Run
--      this class reads the queue order from the bookings they can already read (no change to Row Level Security).
--   2. warn_expiring_bonus_credits(days default 3) -> table (member_id, grant_id, credits_left, grant_expires_at, notice). For the daily
--      job only (app/api/cron/expire-credits, after expire_bonus_credits): not callable by anyone signed in or signed out, as 0105 does
--      for expire_bonus_credits. For each bonus grant (bucket 'bonus', delta > 0, no booking) that expires in the next `days` days (1 to
--      14) and still has credits left (bonus_credit_lots' remaining for that grant, never more than the member's bonus balance, the same
--      rule expire_bonus_credits uses), it writes ONE in-app notice to the member ("3 bonus credits expire on Sat 28 Nov. Book a session
--      before then to use them.", the date in the gym's own time zone) and records the grant in bonus_expiry_warnings, in the same
--      transaction. A grant already in bonus_expiry_warnings is never warned again (its primary key, plus "on conflict do nothing", so
--      two runs at the same moment can't both warn), so re-running the job the same day or every day after sends nothing more. A grant
--      with nothing left is not recorded, and is looked at again the next day. It answers what it warned about, so the job sends the
--      same words by push (the member notice path, as for credits added).
--   3. bonus_expiry_warnings (new table): one row per grant warned about. Row Level Security on with no rule and no grant, so members
--      and coaches can't read or write it through the API; only the function above writes it.
--   BK18: no database change is needed. coach_cancel_booking (0158) gives credits back only when the booking was 'booked' and the coach
--   chose a refund, and refund_booking_credits only ever gives back what the ledger charged that booking, which for a waitlist place is
--   nothing. The app no longer offers "Remove and refund" for a waitlist place.
--
-- Apply: BEFORE the deploy (either order works). The live app calls neither function, so it works the same with this applied. Deployed
-- first, the Book screen shows "On the waitlist" without a place (as it does today) and the daily job still expires credits and records
-- that it could not send warnings (job_runs detail "warnings: not available"), with nothing failing.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... already exists and is not this file's"). Bodies are compared with
-- spaces and line breaks squeezed out. A second run finds this file's own bodies and passes. Safe to run twice: the table is "if not
-- exists", the functions are "create or replace" with the same bodies, and the grants are the same.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.my_waitlist_places()') is not null as waitlist_places,
--          to_regprocedure('public.warn_expiring_bonus_credits(integer)') is not null as expiry_warnings,
--          to_regclass('public.bonus_expiry_warnings') is not null as warnings_table,
--          to_regprocedure('public.bonus_credit_lots(uuid)') is not null as needs_0157,
--          to_regprocedure('public.expire_bonus_credits()') is not null as needs_0055;
-- Expected before: false, false, false, true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('my_waitlist_places', 'warn_expiring_bonus_credits');
-- Expected before: no rows.
--   select (select count(*) from public.notifications) as notices,
--          (select count(*) from public.bookings where status = 'waitlist') as on_waitlists,
--          (select count(*) from public.credits_ledger
--             where bucket = 'bonus' and delta > 0 and booking_id is null and expires_at is not null and expired_at is null) as open_expiring_grants,
--          (select count(*) from public.credits_ledger
--             where bucket = 'bonus' and delta > 0 and booking_id is null and expires_at is not null and expired_at is null
--               and expires_at > now() and expires_at <= now() + interval '3 days') as expiring_in_3_days;
-- Note all four (this file writes no notice and changes no booking or ledger row). On live today expiring_in_3_days is expected 0.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: all true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef, p.proconfig
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('my_waitlist_places', 'warn_expiring_bonus_credits')
--   order by 1;
-- Expected after (this file's bodies: the values in the guard below), both prosecdef true, proconfig {search_path=public}:
--   my_waitlist_places cc0dc32a71e774dde8427267f295ad85, warn_expiring_bonus_credits 8d277d9306d60b9d0fa90833b102573d.
--   select has_function_privilege('authenticated', 'public.my_waitlist_places()', 'execute') as member_places,
--          has_function_privilege('anon', 'public.my_waitlist_places()', 'execute') as anyone_places,
--          has_function_privilege('authenticated', 'public.warn_expiring_bonus_credits(integer)', 'execute') as signed_in_warn,
--          has_function_privilege('anon', 'public.warn_expiring_bonus_credits(integer)', 'execute') as anyone_warn,
--          has_function_privilege('service_role', 'public.warn_expiring_bonus_credits(integer)', 'execute') as job_warn;
-- Expected: true, false, false, false, true.
--   select c.relrowsecurity as rls_on,
--          (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'bonus_expiry_warnings') as rules,
--          has_table_privilege('authenticated', 'public.bonus_expiry_warnings', 'select') as signed_in_can_read,
--          has_table_privilege('authenticated', 'public.bonus_expiry_warnings', 'insert') as signed_in_can_write,
--          has_table_privilege('anon', 'public.bonus_expiry_warnings', 'select') as anyone_can_read
--   from pg_class c where c.oid = 'public.bonus_expiry_warnings'::regclass;
-- Expected: true, 0, false, false, false.
--   (the PRE-FLIGHT's counts again)
-- Expected after: the same four numbers. And select count(*) from public.bonus_expiry_warnings; -- 0 (the job has not run yet).
--   As a member, inside a transaction that is rolled back (put a member's id in; the function only reads):
--     begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', '<member id>', 'role', 'authenticated')::text, true);
--     select count(*) as places, count(*) filter (where place >= 1) as numbered from public.my_waitlist_places();
--     select count(*) as visible_waitlist_rows from public.bookings where status = 'waitlist' and booking_date >= current_date - 1;
--     rollback;
-- Expected: places = numbered = visible_waitlist_rows (a member sees only their own bookings, so all three count the member's own
-- waitlist places; 0 for most members). With a coach's id: places 0. As anon (set local role anon, no claims): permission denied.
--
-- Write checks (test accounts, on a sandbox, not the live project): give member M 3 bonus credits expiring in 2 days (grant_credits) and
-- 2 expiring in 10 days. Run select * from public.warn_expiring_bonus_credits(3); as the service role -> one row for the first grant,
-- credits_left 3, one new notice for M ("3 bonus credits expire on ..."), one bonus_expiry_warnings row. Run it again -> no rows, no new
-- notice. Book a session with 3 of M's bonus credits before the first run instead -> no row (nothing left), no notice, no record. Put
-- M and two others on a full session's waitlist: as M, my_waitlist_places() answers M's booking only, with M's place (1, 2 or 3 by when
-- they joined); as the others, each their own.
--
-- REVERSE: drop function if exists public.warn_expiring_bonus_credits(integer), public.my_waitlist_places(); then, if wanted (nothing
-- else reads it), drop table if exists public.bonus_expiry_warnings. Deploy the app before or after: it copes with neither being there.
--
-- No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
  v_name text;
begin
  for v_check in
    select * from (values
      ('my_waitlist_places', 'cc0dc32a71e774dde8427267f295ad85'),
      ('warn_expiring_bonus_credits', '8d277d9306d60b9d0fa90833b102573d')
    ) as t(name, accepted)
  loop
    v_md5 := null;
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and v_md5 <> v_check.accepted then
      raise exception '% already exists and is not this file''s (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  foreach v_name in array array['bonus_credit_lots', 'expire_bonus_credits'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception 'function % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  foreach v_name in array array['public.bookings', 'public.credits_ledger', 'public.notifications', 'public.profiles', 'public.gyms'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('bookings', 'client_id'), ('bookings', 'class_id'), ('bookings', 'booking_date'), ('bookings', 'status'), ('bookings', 'created_at'),
      ('credits_ledger', 'bucket'), ('credits_ledger', 'delta'), ('credits_ledger', 'booking_id'), ('credits_ledger', 'expires_at'),
      ('credits_ledger', 'expired_at'), ('credits_ledger', 'created_at'), ('notifications', 'client_id'), ('notifications', 'message'),
      ('profiles', 'gym_id'), ('gyms', 'timezone')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = v_check.tbl and column_name = v_check.col
    ) then
      raise exception 'column %.% is missing, so nothing was changed.', v_check.tbl, v_check.col;
    end if;
  end loop;
end
$guard$;

-- =====================================================================================================================================
-- 1. A member's own places on waitlists (BK5)
-- =====================================================================================================================================
create or replace function public.my_waitlist_places()
returns table (booking_id uuid, class_id uuid, booking_date date, place integer)
language sql
stable
security definer
set search_path = public
as $fn$
  -- Only the caller's own waitlist rows; signed out, auth.uid() is null and nothing matches. The place counts the waitlist rows for
  -- the same session and date ahead of the caller's in promote_from_waitlist's order (created_at, then id), and returns only that number.
  select mine.id, mine.class_id, mine.booking_date,
         (
           select count(*)::integer + 1
           from bookings ahead
           where ahead.class_id = mine.class_id
             and ahead.booking_date = mine.booking_date
             and ahead.status = 'waitlist'
             and (ahead.created_at, ahead.id) < (mine.created_at, mine.id)
         )
  from bookings mine
  where auth.uid() is not null
    and mine.client_id = auth.uid()
    and mine.status = 'waitlist'
    and mine.booking_date >= current_date - 1
  order by mine.booking_date, mine.class_id;
$fn$;

revoke execute on function public.my_waitlist_places() from public, anon;
grant execute on function public.my_waitlist_places() to authenticated;

-- =====================================================================================================================================
-- 2. A warning a few days before bonus credits expire (RO16), for the daily job only
-- =====================================================================================================================================
create table if not exists public.bonus_expiry_warnings (
  -- One row per grant warned about: the primary key is what makes it one warning per grant.
  ledger_id uuid primary key references public.credits_ledger(id) on delete cascade,
  client_id uuid not null,
  credits integer not null,
  expires_at timestamptz not null,
  warned_at timestamptz not null default now()
);

alter table public.bonus_expiry_warnings enable row level security;
revoke all on table public.bonus_expiry_warnings from public, anon, authenticated;

create or replace function public.warn_expiring_bonus_credits(p_days integer default 3)
returns table (member_id uuid, grant_id uuid, credits_left integer, grant_expires_at timestamptz, notice text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_days integer := least(greatest(coalesce(p_days, 3), 1), 14);
  v_grant record;
  v_unspent integer;
  v_bonus_balance integer;
  v_left integer;
  v_gym_tz text;
  v_checked_tz text;
  v_checked_ok boolean := false;
  v_tz text;
  v_notice text;
begin
  for v_grant in
    select l.id, l.client_id, l.expires_at
    from credits_ledger l
    where l.bucket = 'bonus' and l.delta > 0 and l.booking_id is null
      and l.expires_at is not null and l.expired_at is null
      and l.expires_at > now() and l.expires_at <= now() + make_interval(days => v_days)
      and not exists (select 1 from bonus_expiry_warnings w where w.ledger_id = l.id)
    order by l.client_id, l.expires_at, l.created_at, l.id
  loop
    -- The same lock as grants, refunds and expiry, so the credits left are read while nothing else moves this member's credits.
    perform pg_advisory_xact_lock(hashtext('credits:' || v_grant.client_id::text));

    select b.remaining into v_unspent
    from public.bonus_credit_lots(v_grant.client_id) b
    where b.ledger_id = v_grant.id;

    select coalesce(sum(cl.delta), 0) into v_bonus_balance
    from credits_ledger cl where cl.client_id = v_grant.client_id and cl.bucket = 'bonus';

    -- What expire_bonus_credits would take back today: what is left of this grant, never more than the member has.
    v_left := least(coalesce(v_unspent, 0), greatest(v_bonus_balance, 0));
    continue when v_left <= 0;

    insert into bonus_expiry_warnings (ledger_id, client_id, credits, expires_at)
    values (v_grant.id, v_grant.client_id, v_left, v_grant.expires_at)
    on conflict (ledger_id) do nothing;
    -- Another run got there first: it sent the warning.
    continue when not found;

    -- The date in the gym's own time zone (an expiry the coach picks is the end of that day at the gym), London when not known. The zone
    -- is checked against pg_timezone_names (a slow view) only when it differs from the last one checked: members come gym by gym.
    v_gym_tz := null;
    select nullif(btrim(g.timezone), '') into v_gym_tz
    from profiles p join gyms g on g.id = p.gym_id
    where p.id = v_grant.client_id;
    if v_gym_tz is distinct from v_checked_tz then
      v_checked_tz := v_gym_tz;
      v_checked_ok := v_gym_tz is not null and exists (select 1 from pg_timezone_names tz where tz.name = v_gym_tz);
    end if;
    v_tz := case when v_checked_ok then v_gym_tz else 'Europe/London' end;

    v_notice := v_left::text
      || case when v_left = 1 then ' bonus credit expires on ' else ' bonus credits expire on ' end
      || to_char(v_grant.expires_at at time zone v_tz, 'Dy FMDD Mon')
      || '. Book a session before then to use ' || case when v_left = 1 then 'it' else 'them' end || '.';

    insert into notifications (client_id, message) values (v_grant.client_id, v_notice);

    member_id := v_grant.client_id;
    grant_id := v_grant.id;
    credits_left := v_left;
    grant_expires_at := v_grant.expires_at;
    notice := v_notice;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.warn_expiring_bonus_credits(integer) from public, anon, authenticated;
grant execute on function public.warn_expiring_bonus_credits(integer) to service_role;

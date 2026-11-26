-- Owner and gym admin (live review Build 4: RO19, CW5, RO10, BO14, SE23; 26 Nov 2026).
--
-- Before: the owner's Overview "Coaches" table and the coach Business "Team this week" showed what each coach's MEMBERS did (logged this
-- week, quiet, to review), nothing about the coach's own follow-through (RO19, CW5). Owner Reports had check-ins and coach messaging only,
-- no class figures and no retention (RO10). The only way to change a member's coach was "Move members...", which moves every member of a
-- coach at once (BO14). And only gym admin switches were recorded (admin_audit, 0142), readable in the SQL editor only (SE23).
--
-- New (each function is "security definer" with "set search_path = public", checks its caller first, and touches only that gym's rows):
--   1. coach_follow_through(gym) -> jsonb. For the coach Business overview and the owner's Overview. Per coach at the gym: members, and
--      weekly check-ins due against reviewed over the last 4 complete weeks (a week a member who finished onboarding logged anything in,
--      and whether it has a "Reviewed" mark, coach_reviews kind 'week', 0087). Per conversation whose newest messages are the member's:
--      the coach, when the oldest unanswered message was sent, the newest one, and the "No reply needed" mark (0160) if any. Per reply in
--      the last 30 days: the coach who replied and how many seconds after the member's first unanswered message. Never a message's text, a
--      member's id or name. The app works out the counts, the oldest wait and the median reply time (lib/followThrough.ts).
--      Who may: a gym admin AT THAT GYM, or the owner of the gym's organisation: can_manage_gym_business(gym) from 0161. A coach who is not
--      an admin there, an admin of another gym, a member, and anyone signed out are refused ("Not authorized").
--   2. change_member_coach(member, from_coach, to_coach) -> jsonb. "Change coach" for one member, on the owner's gym Members list and in the
--      gym admin's Team section. The new coach must work at the member's gym; from_coach must still be the member's coach (otherwise "This
--      member's coach has changed since the page was loaded", so a stale screen never moves someone it didn't show). Who may: the owner of
--      the member's gym, or a gym admin there (can_manage_gym_business, 0161). Everyone else gets "Not authorized", whatever the member.
--      Same side effects as moving all of a coach's members: both now go through one internal function, _move_members_to_coach, which
--      changes profiles.coach_id and moves the member's red flags nobody has followed up yet (contacted = 'no') to the new coach. Nothing
--      else changes for either (chat, check-ins, reviews, groups, notices and programmes follow profiles.coach_id or stay where they are,
--      as 0131 describes).
--   3. _reassign_clients (0131, behind "Move members...") now calls _move_members_to_coach and records the move (below). Same checks,
--      same members moved, same red flags, same answer (how many moved).
--   4. owner_class_report(gym, weeks, tz) -> jsonb, owner only: the gym's classes (slots), and per session date the places taken,
--      attended, no-shows, members still on the waitlist and members who came off it, the cancelled dates, and how many different members
--      came each week. No member ids. The app turns it into "Class fill against capacity", "Attendance by week" and "Waitlist demand".
--   5. owner_retention_report(gym, months, tz) -> jsonb, owner only: members by the month they joined, with how many started a plan, are
--      on one now, and were on one 1, 3 and 6 months after joining (with how many have been members that long). Counts only.
--   6. owner_staff_activity(gym, limit, offset) -> jsonb, owner only: the record of staff actions at the gym(s), newest first, with paging.
--   7. The record, staff_activity (new table, append-only), written by the database itself so every route is covered:
--        coach_added / coach_removed  a row added to or removed from coach_gym_memberships (trigger log_staff_membership_change)
--        members_moved                "Move members...": the two coaches and how many moved (_reassign_clients)
--        member_coach_changed         "Change coach": the member and both coaches (change_member_coach)
--        login_on                     a coach's login switched back on (profiles.deactivated_at cleared, trigger log_staff_login_on).
--                                     That runs with the app server's key, so who did it is not known to the database (shown without a
--                                     name). It is filed under the gym the coach was last removed from; one removed before this file has
--                                     no gym and shows in the SQL editor only.
--      Gym admin switches stay in admin_audit (0142, unchanged) and owner_staff_activity reads both. Row Level Security is on with no rule
--      and no grant, so members and coaches can't read or write either table through the API; a trigger refuses any update, delete or
--      truncate of staff_activity and admin_audit, so not even a database function can change or remove a row.
--
-- Apply: BEFORE the deploy. The live app calls none of the new functions, and "Move members..." keeps its name, arguments and answer, so
-- the live app works the same with this applied. Deployed first, the new screens say "This needs a database update (migration 0176)"
-- (Change coach changes nothing) and everything else on the pages works.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), when
-- _reassign_clients is neither 0131's body nor this file's ("... is not the one from migration 0131"), or when a function it creates
-- already exists with a different body ("... already exists and is not this file's"). Bodies are compared with spaces and line breaks
-- squeezed out. A second run finds this file's own bodies and passes. Safe to run twice: the table and index are "if not exists", the
-- triggers are dropped and created again.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.coach_follow_through(uuid)') is not null as follow_through,
--          to_regprocedure('public.change_member_coach(uuid, uuid, uuid)') is not null as change_coach,
--          to_regprocedure('public._move_members_to_coach(uuid, uuid, uuid, uuid[])') is not null as move_helper,
--          to_regprocedure('public.owner_class_report(uuid, integer, text)') is not null as class_report,
--          to_regprocedure('public.owner_retention_report(uuid, integer, text)') is not null as retention_report,
--          to_regprocedure('public.owner_staff_activity(uuid, integer, integer)') is not null as staff_activity_fn,
--          to_regclass('public.staff_activity') is not null as staff_activity_table,
--          to_regprocedure('public.can_manage_gym_business(uuid)') is not null as needs_0161,
--          to_regclass('public.chat_no_reply') is not null as needs_0160;
-- Expected before: false, false, false, false, false, false, false, true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_reassign_clients';
-- Expected before: _reassign_clients cfc9908fecfd3f90befcaad8fc8f4b43 (0131's body).
--   select tgname from pg_trigger where not tgisinternal
--     and tgrelid in ('public.coach_gym_memberships'::regclass, 'public.profiles'::regclass, 'public.admin_audit'::regclass)
--   order by 1;
-- Expected before: log_admin_flag_change, plus the profiles triggers already there (note them); none of log_staff_membership_change,
-- log_staff_login_on, admin_audit_append_only, admin_audit_no_truncate.
--   select count(*) as admin_changes from public.admin_audit;
--   select count(*) as memberships from public.coach_gym_memberships;
--   select coach_id, count(*) from public.profiles where role = 'client' group by 1 order by 1;
-- Note all three (this file adds no admin_audit row, no membership and moves nobody).
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: all true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('_move_members_to_coach', '_reassign_clients', 'block_staff_record_change', 'change_member_coach',
--                       'coach_follow_through', 'log_staff_login_on', 'log_staff_membership_change', 'owner_class_report',
--                       'owner_retention_report', 'owner_staff_activity')
--   order by 1;
-- Expected after (this file's bodies: the values in the guard below), every one prosecdef true:
--   _move_members_to_coach 24646817c1e5ced8432c685bc93676e4, _reassign_clients 15bac4148b1e9e14c86c7a780652162a,
--   block_staff_record_change f1bb67fc53a8e39405c7a579fbcb2e7c, change_member_coach d4c26a460202c57708a3da96171fe31c,
--   coach_follow_through b3937d7f3201bf32db51eeb84c7f7ce9, log_staff_login_on 83f610ed097ec81c60f9bb0dfc9ab3bc,
--   log_staff_membership_change dd876e75c78e0ddc452051c7db044306, owner_class_report 7097f76fbb77f2dd477e6fe3a2d959cc,
--   owner_retention_report e5a3206e3849f867429446870c78b9f5, owner_staff_activity e7152848dac3993137edc7f9cefe95cf.
--   select has_function_privilege('authenticated', 'public.coach_follow_through(uuid)', 'execute') as signed_in,
--          has_function_privilege('anon', 'public.coach_follow_through(uuid)', 'execute') as anyone_follow_through,
--          has_function_privilege('anon', 'public.change_member_coach(uuid, uuid, uuid)', 'execute') as anyone_change,
--          has_function_privilege('anon', 'public.owner_class_report(uuid, integer, text)', 'execute') as anyone_classes,
--          has_function_privilege('anon', 'public.owner_retention_report(uuid, integer, text)', 'execute') as anyone_retention,
--          has_function_privilege('anon', 'public.owner_staff_activity(uuid, integer, integer)', 'execute') as anyone_staff,
--          has_function_privilege('authenticated', 'public._move_members_to_coach(uuid, uuid, uuid, uuid[])', 'execute') as helper_callable,
--          has_function_privilege('authenticated', 'public.log_staff_membership_change()', 'execute') as trigger_callable;
-- Expected: true, false, false, false, false, false, false, false (signed-in users can call the five, and each refuses anyone it isn't for).
--   select c.relrowsecurity as rls_on,
--          (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'staff_activity') as rules,
--          has_table_privilege('authenticated', 'public.staff_activity', 'select') as signed_in_can_read,
--          has_table_privilege('authenticated', 'public.staff_activity', 'insert') as signed_in_can_write,
--          has_table_privilege('anon', 'public.staff_activity', 'select') as anyone_can_read
--   from pg_class c where c.oid = 'public.staff_activity'::regclass;
-- Expected: true, 0, false, false, false.
--   (the PRE-FLIGHT's pg_trigger query again)
-- Expected after: the same as before, plus admin_audit_append_only, admin_audit_no_truncate, log_staff_login_on and
-- log_staff_membership_change (and on staff_activity: staff_activity_append_only, staff_activity_no_truncate).
--   (the PRE-FLIGHT's three counts again)
-- Expected after: the same numbers. And select count(*) from public.staff_activity; -- 0 (nothing has happened yet).
--   As the owner, inside a transaction that is rolled back (put the owner's id in; the four functions only read):
--     begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', '<owner id>', 'role', 'authenticated')::text, true);
--     select jsonb_array_length(public.owner_class_report()->'classes') as classes,
--            jsonb_array_length(public.owner_retention_report()->'cohorts') as months,
--            public.owner_staff_activity()->'total' as staff_rows;
--     select jsonb_array_length(public.coach_follow_through(g.id)->'coaches') from public.gyms g where g.organisation_id is not null;
--     rollback;
-- Expected: classes = the organisation's class slots, months 12, staff_rows = the admin_changes number above; one row per gym, its
-- number of coaches. With a member's id (or a coach who is not an admin) in place of the owner's, each call fails "Not authorized".
--
-- Write checks (test accounts, on a sandbox, not the live project): as a gym admin at gym A, change_member_coach(M, C1, C2) for a member
-- M of C1 at gym A with an open red flag -> M's coach is C2, the open flag's coach is C2, a flag already followed up keeps C1, one
-- staff_activity row member_coach_changed. Again with the same from (C1) -> "coach has changed". With C3 who works only at gym B -> "must
-- work at this member's gym". As a coach at gym A who is not an admin, as an admin of gym B, or as M -> "Not authorized", nothing changed.
-- reassign_clients(A, C2, C1) -> moves M back, one members_moved row with member_count 1. Remove a coach with no members -> one
-- coach_removed row. update public.staff_activity set action = 'x'; -> refused (append-only).
--
-- REVERSE: drop the four triggers (log_staff_membership_change on coach_gym_memberships, log_staff_login_on on profiles,
--   admin_audit_append_only and admin_audit_no_truncate on admin_audit); run _reassign_clients' definition from migration 0131 again;
--   drop function if exists public.change_member_coach(uuid, uuid, uuid), public.coach_follow_through(uuid),
--   public.owner_class_report(uuid, integer, text), public.owner_retention_report(uuid, integer, text),
--   public.owner_staff_activity(uuid, integer, integer), public._move_members_to_coach(uuid, uuid, uuid, uuid[]),
--   public.log_staff_membership_change(), public.log_staff_login_on(); the table can stay (nothing else reads it), or: drop table
--   public.staff_activity; then drop function public.block_staff_record_change().
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
      ('_move_members_to_coach', '24646817c1e5ced8432c685bc93676e4'),
      ('block_staff_record_change', 'f1bb67fc53a8e39405c7a579fbcb2e7c'),
      ('change_member_coach', 'd4c26a460202c57708a3da96171fe31c'),
      ('coach_follow_through', 'b3937d7f3201bf32db51eeb84c7f7ce9'),
      ('log_staff_login_on', '83f610ed097ec81c60f9bb0dfc9ab3bc'),
      ('log_staff_membership_change', 'dd876e75c78e0ddc452051c7db044306'),
      ('owner_class_report', '7097f76fbb77f2dd477e6fe3a2d959cc'),
      ('owner_retention_report', 'e5a3206e3849f867429446870c78b9f5'),
      ('owner_staff_activity', 'e7152848dac3993137edc7f9cefe95cf')
    ) as t(name, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and v_md5 <> v_check.accepted then
      raise exception '% already exists and is not this file''s (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  -- the one function this file replaces: 0131's body, or this file's own on a second run
  v_md5 := null;
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = '_reassign_clients';
  if v_md5 is null then
    raise exception 'function _reassign_clients is missing, so nothing was changed.';
  end if;
  if v_md5 not in ('cfc9908fecfd3f90befcaad8fc8f4b43', '15bac4148b1e9e14c86c7a780652162a') then
    raise exception '_reassign_clients is not the one from migration 0131 (body md5 %), so nothing was changed.', v_md5;
  end if;

  foreach v_name in array array['can_manage_gym_business', 'is_owner', 'is_owner_of_gym', 'my_org_id', 'local_date', 'reassign_clients',
                                'owner_reassign_clients'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception 'function % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  foreach v_name in array array['public.profiles', 'public.client_profiles', 'public.gyms', 'public.coach_gym_memberships',
                                'public.coach_reviews', 'public.daily_logs', 'public.chat_messages', 'public.chat_no_reply',
                                'public.red_flag_entries', 'public.admin_audit', 'public.classes', 'public.bookings',
                                'public.class_exceptions', 'public.client_memberships'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('profiles', 'deactivated_at'), ('profiles', 'gym_id'), ('client_profiles', 'onboarding_completed_at'), ('chat_no_reply', 'marked_at'),
      ('coach_reviews', 'ref'), ('red_flag_entries', 'contacted'), ('classes', 'gym_id'), ('classes', 'specific_date'),
      ('classes', 'retired_at'), ('bookings', 'attended'), ('bookings', 'no_show'), ('bookings', 'promoted_at'),
      ('client_memberships', 'started_at'), ('admin_audit', 'changed_by')
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
-- 7. The record of staff actions (append-only)
-- =====================================================================================================================================
create table if not exists public.staff_activity (
  id bigint generated always as identity primary key,
  -- No foreign keys: the record outlives the gym, coach or member it names (as admin_audit, 0142).
  gym_id uuid,
  action text not null check (action in ('coach_added', 'coach_removed', 'members_moved', 'member_coach_changed', 'login_on')),
  -- auth.uid() of whoever did it; empty when the database can't tell (the app server's key, the SQL editor)
  actor_id uuid,
  -- the coach added, removed or switched back on; for a move, the members' old coach
  coach_id uuid,
  -- for a move, the new coach
  to_coach_id uuid,
  -- for "Change coach", the member
  member_id uuid,
  -- for a move, how many members moved
  member_count integer,
  created_at timestamptz not null default now()
);

create index if not exists staff_activity_gym_created_idx on public.staff_activity (gym_id, created_at desc);
create index if not exists admin_audit_gym_changed_idx on public.admin_audit (gym_id, changed_at desc);

alter table public.staff_activity enable row level security;
-- No rule: nobody reads or writes it through the API. The owner reads it through owner_staff_activity below.
revoke all on table public.staff_activity from public, anon, authenticated;

create or replace function public.block_staff_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'The staff record can only be added to: its rows cannot be changed or removed.';
end;
$fn$;

revoke execute on function public.block_staff_record_change() from public, anon, authenticated;

drop trigger if exists staff_activity_append_only on public.staff_activity;
create trigger staff_activity_append_only
  before update or delete on public.staff_activity
  for each row execute function public.block_staff_record_change();

drop trigger if exists staff_activity_no_truncate on public.staff_activity;
create trigger staff_activity_no_truncate
  before truncate on public.staff_activity
  for each statement execute function public.block_staff_record_change();

drop trigger if exists admin_audit_append_only on public.admin_audit;
create trigger admin_audit_append_only
  before update or delete on public.admin_audit
  for each row execute function public.block_staff_record_change();

drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.block_staff_record_change();

-- A coach added to or removed from a gym, by any route (add_coach_to_gym, owner_add_coach_to_gym, the Add coach screen, remove_coach_from_gym,
-- owner_remove_coach_from_gym, or a deleted account).
create or replace function public.log_staff_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into staff_activity (gym_id, action, actor_id, coach_id)
    values (new.gym_id, 'coach_added', auth.uid(), new.coach_id);
    return new;
  end if;
  insert into staff_activity (gym_id, action, actor_id, coach_id)
  values (old.gym_id, 'coach_removed', auth.uid(), old.coach_id);
  return old;
end;
$fn$;

revoke execute on function public.log_staff_membership_change() from public, anon, authenticated;

drop trigger if exists log_staff_membership_change on public.coach_gym_memberships;
create trigger log_staff_membership_change
  after insert or delete on public.coach_gym_memberships
  for each row execute function public.log_staff_membership_change();

-- A coach's login switched back on: /api/gym/deactivate-coach (action 'reactivate') or Add coach with the address of a removed coach clear
-- profiles.deactivated_at. Filed under the gym the coach was last removed from.
create or replace function public.log_staff_login_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid;
begin
  select s.gym_id into v_gym
  from staff_activity s
  where s.coach_id = new.id and s.action = 'coach_removed'
  order by s.created_at desc, s.id desc
  limit 1;
  insert into staff_activity (gym_id, action, actor_id, coach_id)
  values (v_gym, 'login_on', auth.uid(), new.id);
  return new;
end;
$fn$;

revoke execute on function public.log_staff_login_on() from public, anon, authenticated;

drop trigger if exists log_staff_login_on on public.profiles;
create trigger log_staff_login_on
  after update of deactivated_at on public.profiles
  for each row
  when (old.deactivated_at is not null and new.deactivated_at is null)
  execute function public.log_staff_login_on();

-- =====================================================================================================================================
-- 2 and 3. Moving members to another coach: one way for "Move members..." and "Change coach"
-- =====================================================================================================================================
-- Moves the given members of the gym whose coach is still p_from to p_to, and their red flags nobody has followed up yet. Returns who moved.
-- Internal: called by _reassign_clients and change_member_coach only, after their own checks.
create or replace function public._move_members_to_coach(p_gym uuid, p_from uuid, p_to uuid, p_members uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ids uuid[];
begin
  with moved as (
    update profiles
    set coach_id = p_to
    where role = 'client' and gym_id = p_gym and coach_id is not distinct from p_from and id = any (coalesce(p_members, '{}'::uuid[]))
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from moved;

  -- Flags nobody has followed up yet move with the member; ones with a recorded follow-up keep the coach who did it (0131).
  update red_flag_entries
  set coach_id = p_to, updated_at = now()
  where gym_id = p_gym and client_id = any (v_ids) and coach_id is not distinct from p_from and contacted = 'no';

  return v_ids;
end;
$fn$;

revoke execute on function public._move_members_to_coach(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

-- 0131's checks and answer, unchanged; the move itself is _move_members_to_coach, and it is recorded.
create or replace function public._reassign_clients(p_gym uuid, p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ids uuid[];
  v_moved integer;
begin
  if p_gym is null or p_from is null or p_to is null then
    raise exception 'Choose both coaches';
  end if;
  if p_from = p_to then
    raise exception 'Choose two different coaches';
  end if;
  if not exists (select 1 from coach_gym_memberships where coach_id = p_from and gym_id = p_gym)
     or not exists (select 1 from coach_gym_memberships where coach_id = p_to and gym_id = p_gym) then
    raise exception 'Both coaches must work at this gym.';
  end if;

  v_ids := public._move_members_to_coach(
    p_gym, p_from, p_to,
    array(select id from profiles where role = 'client' and coach_id = p_from and gym_id = p_gym)
  );
  v_moved := coalesce(array_length(v_ids, 1), 0);

  if v_moved > 0 then
    insert into staff_activity (gym_id, action, actor_id, coach_id, to_coach_id, member_count)
    values (p_gym, 'members_moved', auth.uid(), p_from, p_to, v_moved);
  end if;

  return v_moved;
end;
$fn$;

revoke execute on function public._reassign_clients(uuid, uuid, uuid) from public, anon, authenticated;

-- "Change coach" for one member: the owner of the member's gym or a gym admin there. p_from is the coach the screen showed (empty for a
-- member with no coach); the change is refused when it is no longer the member's coach.
create or replace function public.change_member_coach(p_member uuid, p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_member profiles;
  v_ids uuid[];
begin
  if auth.uid() is null or p_member is null or p_to is null then
    raise exception 'Not authorized';
  end if;

  -- the member's row, held until the change is done, so two changes of the same member wait for each other
  select * into v_member from profiles where id = p_member for update;
  -- the same answer for "no such member" as for "not yours to change", so nobody can probe for accounts
  if not found or v_member.role is distinct from 'client' or v_member.gym_id is null
     or not coalesce(public.can_manage_gym_business(v_member.gym_id), false) then
    raise exception 'Not authorized';
  end if;

  if v_member.coach_id is distinct from p_from then
    raise exception 'This member''s coach has changed since the page was loaded. Reload the page and try again.';
  end if;
  if v_member.coach_id is not distinct from p_to then
    raise exception 'That is already their coach.';
  end if;
  if not exists (
    select 1 from coach_gym_memberships cgm join profiles c on c.id = cgm.coach_id
    where cgm.coach_id = p_to and cgm.gym_id = v_member.gym_id and c.role = 'coach' and c.deactivated_at is null
  ) then
    raise exception 'The new coach must work at this member''s gym.';
  end if;

  v_ids := public._move_members_to_coach(v_member.gym_id, v_member.coach_id, p_to, array[p_member]);
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'This member''s coach has changed since the page was loaded. Reload the page and try again.';
  end if;

  insert into staff_activity (gym_id, action, actor_id, coach_id, to_coach_id, member_id, member_count)
  values (v_member.gym_id, 'member_coach_changed', auth.uid(), v_member.coach_id, p_to, p_member, 1);

  return jsonb_build_object('gymId', v_member.gym_id, 'from', v_member.coach_id, 'to', p_to);
end;
$fn$;

revoke execute on function public.change_member_coach(uuid, uuid, uuid) from public, anon;
grant execute on function public.change_member_coach(uuid, uuid, uuid) to authenticated;

-- =====================================================================================================================================
-- 1. Coach follow-through (Business overview, owner's Overview)
-- =====================================================================================================================================
create or replace function public.coach_follow_through(p_gym uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_today date;
  v_this_week date;
  v_from_week date;
  v_result jsonb;
begin
  -- a gym admin at THIS gym (an active coach login with Admin on there) or the owner of the gym's organisation (0161)
  if p_gym is null or not coalesce(public.can_manage_gym_business(p_gym), false) then
    raise exception 'Not authorized';
  end if;

  v_today := public.local_date((select g.timezone from gyms g where g.id = p_gym));
  v_this_week := date_trunc('week', v_today::timestamp)::date;
  -- the last 4 complete weeks, Monday to Sunday, in the gym's calendar
  v_from_week := v_this_week - 28;

  with team as (
    select c.id as coach_id, coalesce(nullif(btrim(c.display_name), ''), c.email) as name
    from coach_gym_memberships cgm
    join profiles c on c.id = cgm.coach_id
    where cgm.gym_id = p_gym
  ),
  gym_members as (
    select m.id, m.coach_id, (cp.onboarding_completed_at is not null) as onboarded
    from profiles m
    left join client_profiles cp on cp.client_id = m.id
    where m.role = 'client' and m.gym_id = p_gym
  ),
  -- a check-in is due for each complete week a member who finished onboarding logged anything in (the dashboard's To do rule)
  weeks_due as (
    select gm.coach_id, w.week_start,
           exists (
             select 1 from coach_reviews r
             where r.kind = 'week' and r.client_id = gm.id and r.ref = w.week_start::text
           ) as reviewed
    from gym_members gm
    cross join lateral (
      select distinct date_trunc('week', dl.log_date::timestamp)::date as week_start
      from daily_logs dl
      where dl.client_id = gm.id
        and dl.log_date >= v_from_week and dl.log_date < v_this_week
        and (dl.protein is not null or dl.carbs is not null or dl.fat is not null or dl.calories is not null
             or dl.fibre is not null or dl.water is not null or dl.bodyweight is not null or dl.steps is not null
             or dl.sleep is not null or dl.gym_session or dl.hunger is not null or dl.energy is not null
             or dl.motivation is not null or dl.stress is not null or dl.period_started or coalesce(dl.notes, '') <> '')
    ) w
    where gm.onboarded
  ),
  -- every message in the gym's members' threads, numbered by how many staff messages came before it (a member's message) or up to and
  -- including it (a staff message): the member's messages after the k-th staff message share k, and the staff message that answers
  -- them has k + 1
  msgs as (
    select cm.client_id, cm.sender_id, cm.created_at, (cm.sender_id = cm.client_id) as from_member,
           sum(case when cm.sender_id = cm.client_id then 0 else 1 end)
             over (partition by cm.client_id order by cm.created_at, cm.id rows between unbounded preceding and current row) as staff_seq
    from chat_messages cm
    where cm.client_id in (select gm.id from gym_members gm)
  ),
  -- each unbroken run of the member's messages: when it started and its newest message
  runs as (
    select client_id, staff_seq, min(created_at) as first_at, max(created_at) as last_at
    from msgs
    where from_member
    group by client_id, staff_seq
  ),
  last_seq as (
    select client_id, max(staff_seq) as staff_seq from msgs group by client_id
  )
  select jsonb_build_object(
    'gymId', p_gym,
    'today', v_today,
    'weeksFrom', v_from_week,
    'weeks', 4,
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachId', t.coach_id,
        'name', t.name,
        'members', (select count(*) from gym_members gm where gm.coach_id = t.coach_id),
        'checkinsDue', (select count(*) from weeks_due d where d.coach_id = t.coach_id),
        'checkinsReviewed', (select count(*) from weeks_due d where d.coach_id = t.coach_id and d.reviewed)
      ) order by t.name)
      from team t
    ), '[]'::jsonb),
    -- conversations whose newest messages are the member's, under the member's coach (no member id, no text)
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('coachId', gm.coach_id, 'since', r.first_at, 'lastAt', r.last_at, 'noReplyAt', nr.marked_at)
                       order by r.first_at)
      from runs r
      join last_seq l on l.client_id = r.client_id and l.staff_seq = r.staff_seq
      join gym_members gm on gm.id = r.client_id
      left join chat_no_reply nr on nr.client_id = r.client_id
      where gm.coach_id in (select t.coach_id from team t)
    ), '[]'::jsonb),
    -- replies sent in the last 30 days by a coach at the gym: seconds from the member's first unanswered message. A run the coach marked
    -- "No reply needed" before writing again is not a reply.
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object('coachId', s.sender_id, 'seconds', greatest(0, floor(extract(epoch from (s.created_at - r.first_at))))::bigint))
      from runs r
      join msgs s on s.client_id = r.client_id and not s.from_member and s.staff_seq = r.staff_seq + 1
      left join chat_no_reply nr on nr.client_id = r.client_id
      where s.created_at >= now() - interval '30 days'
        and s.sender_id in (select t.coach_id from team t)
        and not (nr.marked_at is not null and nr.marked_at >= r.last_at and nr.marked_at < s.created_at)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke execute on function public.coach_follow_through(uuid) from public, anon;
grant execute on function public.coach_follow_through(uuid) to authenticated;

-- =====================================================================================================================================
-- 4. Classes for the owner's reports: fill against capacity, attendance by week, waitlist demand
-- =====================================================================================================================================
create or replace function public.owner_class_report(p_gym uuid default null, p_weeks integer default 12, p_tz text default 'Europe/London')
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_tz text := coalesce(nullif(p_tz, ''), 'Europe/London');
  v_weeks integer := greatest(1, least(coalesce(p_weeks, 12), 26));
  v_today date;
  v_this_week date;
  v_from date;
  v_until date;
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;
  if p_gym is not null and not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;

  -- One gym: that gym's own calendar. All gyms: the timezone the caller passes (as owner_activity_report, 0142).
  if p_gym is not null then
    v_tz := coalesce(nullif((select g.timezone from gyms g where g.id = p_gym), ''), v_tz);
  end if;
  perform now() at time zone v_tz; -- raises for a name that is not a real timezone

  v_today := public.local_date(v_tz);
  v_this_week := date_trunc('week', v_today::timestamp)::date;
  -- the weeks asked for, and at least the last 28 days; up to 14 days ahead for who is waiting now
  v_from := least(v_this_week - (v_weeks - 1) * 7, v_today - 28);
  v_until := v_today + 14;

  with gyms_in as (
    select g.id, g.name from gyms g
    where g.organisation_id = public.my_org_id() and (p_gym is null or g.id = p_gym)
  ),
  cls as (
    select c.id, c.gym_id, gi.name as gym_name, c.name, c.day_of_week, c.start_time, c.specific_date, c.capacity, c.retired_at
    from classes c
    join gyms_in gi on gi.id = c.gym_id
    where (c.retired_at is null or c.retired_at >= (v_from::timestamp at time zone v_tz))
      and (c.specific_date is null or c.specific_date between v_from and v_until)
  ),
  ses as (
    select b.class_id, b.booking_date,
           count(*) filter (where b.status = 'booked') as booked,
           count(*) filter (where b.status = 'booked' and b.attended) as attended,
           count(*) filter (where b.status = 'booked' and b.no_show) as no_show,
           count(*) filter (where b.status = 'waitlist') as waiting,
           count(*) filter (where b.promoted_at is not null) as promoted
    from bookings b
    where b.class_id in (select id from cls) and b.booking_date between v_from and v_until
    group by b.class_id, b.booking_date
  )
  select jsonb_build_object(
    'today', v_today,
    'from', v_from,
    'weeks', v_weeks,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'gymId', c.gym_id, 'gymName', c.gym_name, 'name', c.name, 'dayOfWeek', c.day_of_week, 'startTime', c.start_time,
        'specificDate', c.specific_date, 'capacity', c.capacity, 'retiredAt', c.retired_at
      ) order by c.gym_name, c.day_of_week, c.start_time, c.name, c.id)
      from cls c
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'classId', s.class_id, 'date', s.booking_date, 'booked', s.booked, 'attended', s.attended, 'noShow', s.no_show,
        'waiting', s.waiting, 'promoted', s.promoted
      ) order by s.booking_date, s.class_id)
      from ses s
    ), '[]'::jsonb),
    'cancelled', coalesce((
      select jsonb_agg(e.class_id::text || '|' || e.occurrence_date::text order by e.occurrence_date, e.class_id)
      from class_exceptions e
      where e.class_id in (select id from cls) and e.occurrence_date between v_from and v_until
    ), '[]'::jsonb),
    -- how many different members came each week (Monday start), up to yesterday (as the app counts the sessions)
    'weekMembers', coalesce((
      select jsonb_agg(jsonb_build_object('weekStart', x.week_start, 'members', x.members) order by x.week_start)
      from (
        select date_trunc('week', b.booking_date::timestamp)::date as week_start, count(distinct b.client_id) as members
        from bookings b
        where b.class_id in (select id from cls) and b.status = 'booked' and b.attended
          and b.booking_date >= v_from and b.booking_date < v_today
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke execute on function public.owner_class_report(uuid, integer, text) from public, anon;
grant execute on function public.owner_class_report(uuid, integer, text) to authenticated;

-- =====================================================================================================================================
-- 5. Retention by join month
-- =====================================================================================================================================
create or replace function public.owner_retention_report(p_gym uuid default null, p_months integer default 12, p_tz text default 'Europe/London')
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_tz text := coalesce(nullif(p_tz, ''), 'Europe/London');
  v_months integer := greatest(1, least(coalesce(p_months, 12), 24));
  v_today date;
  v_month date;
  v_from date;
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;
  if p_gym is not null and not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;

  if p_gym is not null then
    v_tz := coalesce(nullif((select g.timezone from gyms g where g.id = p_gym), ''), v_tz);
  end if;
  perform now() at time zone v_tz; -- raises for a name that is not a real timezone

  v_today := public.local_date(v_tz);
  v_month := date_trunc('month', v_today::timestamp)::date;
  v_from := (v_month - make_interval(months => v_months - 1))::date;

  with joined as (
    select m.id,
           (m.created_at at time zone v_tz)::date as joined_on
    from profiles m
    join gyms g on g.id = m.gym_id
    where m.role = 'client'
      and g.organisation_id = public.my_org_id() and (p_gym is null or g.id = p_gym)
      and (m.created_at at time zone v_tz)::date >= v_from
  ),
  facts as (
    select j.id,
           date_trunc('month', j.joined_on::timestamp)::date as month,
           (j.joined_on + interval '1 month')::date as d1,
           (j.joined_on + interval '3 months')::date as d3,
           (j.joined_on + interval '6 months')::date as d6,
           exists (select 1 from client_memberships cm where cm.client_id = j.id) as ever,
           exists (select 1 from client_memberships cm where cm.client_id = j.id and cm.ended_at is null) as now_on
    from joined j
  ),
  -- on a plan that day: a plan started by then and not ended by then
  marked as (
    select f.*,
           exists (select 1 from client_memberships cm where cm.client_id = f.id and cm.started_at <= f.d1 and (cm.ended_at is null or cm.ended_at > f.d1)) as on1,
           exists (select 1 from client_memberships cm where cm.client_id = f.id and cm.started_at <= f.d3 and (cm.ended_at is null or cm.ended_at > f.d3)) as on3,
           exists (select 1 from client_memberships cm where cm.client_id = f.id and cm.started_at <= f.d6 and (cm.ended_at is null or cm.ended_at > f.d6)) as on6
    from facts f
  )
  select jsonb_build_object(
    'today', v_today,
    'months', v_months,
    'cohorts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', mo.month,
        'joined', coalesce(c.joined, 0),
        'startedPlan', coalesce(c.ever, 0),
        'onPlanNow', coalesce(c.now_on, 0),
        'eligible1', coalesce(c.e1, 0), 'kept1', coalesce(c.k1, 0),
        'eligible3', coalesce(c.e3, 0), 'kept3', coalesce(c.k3, 0),
        'eligible6', coalesce(c.e6, 0), 'kept6', coalesce(c.k6, 0)
      ) order by mo.month)
      from (
        select gs::date as month from generate_series(v_from::timestamp, v_month::timestamp, interval '1 month') as gs
      ) mo
      left join (
        select k.month,
               count(*) as joined,
               count(*) filter (where k.ever) as ever,
               count(*) filter (where k.now_on) as now_on,
               count(*) filter (where k.d1 <= v_today) as e1, count(*) filter (where k.d1 <= v_today and k.on1) as k1,
               count(*) filter (where k.d3 <= v_today) as e3, count(*) filter (where k.d3 <= v_today and k.on3) as k3,
               count(*) filter (where k.d6 <= v_today) as e6, count(*) filter (where k.d6 <= v_today and k.on6) as k6
        from marked k
        group by k.month
      ) c on c.month = mo.month
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke execute on function public.owner_retention_report(uuid, integer, text) from public, anon;
grant execute on function public.owner_retention_report(uuid, integer, text) to authenticated;

-- =====================================================================================================================================
-- 6. Staff activity for the owner
-- =====================================================================================================================================
create or replace function public.owner_staff_activity(p_gym uuid default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_owner() then
    raise exception 'Not authorized';
  end if;
  if p_gym is not null and not coalesce(public.is_owner_of_gym(p_gym), false) then
    raise exception 'Not authorized';
  end if;

  with gyms_in as (
    select g.id, g.name from gyms g
    where g.organisation_id = public.my_org_id() and (p_gym is null or g.id = p_gym)
  ),
  entries as (
    select 'staff'::text as src, s.id, s.gym_id, s.action, s.actor_id, s.coach_id, s.to_coach_id, s.member_id, s.member_count,
           s.created_at as at
    from staff_activity s
    where s.gym_id in (select gi.id from gyms_in gi)
    union all
    -- gym admin switches, written by 0142's trigger
    select 'admin'::text, a.id, a.gym_id, case when a.is_gym_admin then 'admin_on' else 'admin_off' end, a.changed_by, a.coach_id,
           null::uuid, null::uuid, null::integer, a.changed_at
    from admin_audit a
    where a.gym_id in (select gi.id from gyms_in gi)
  ),
  page as (
    select e.* from entries e order by e.at desc, e.src, e.id desc limit v_limit offset v_offset
  )
  select
    (select count(*) from entries),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', p.src || ':' || p.id::text,
        'at', p.at,
        'action', p.action,
        'gymId', p.gym_id,
        'gymName', gi.name,
        'actorName', coalesce(nullif(btrim(pa.display_name), ''), pa.email),
        'actorIsYou', coalesce(p.actor_id = auth.uid(), false),
        'coachName', coalesce(nullif(btrim(pc.display_name), ''), pc.email),
        'toCoachName', coalesce(nullif(btrim(pt.display_name), ''), pt.email),
        'memberName', coalesce(nullif(btrim(cpm.name), ''), pm.email),
        'memberCount', p.member_count
      ) order by p.at desc, p.src, p.id desc)
      from page p
      join gyms_in gi on gi.id = p.gym_id
      left join profiles pa on pa.id = p.actor_id
      left join profiles pc on pc.id = p.coach_id
      left join profiles pt on pt.id = p.to_coach_id
      left join profiles pm on pm.id = p.member_id
      left join client_profiles cpm on cpm.client_id = p.member_id
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$fn$;

revoke execute on function public.owner_staff_activity(uuid, integer, integer) from public, anon;
grant execute on function public.owner_staff_activity(uuid, integer, integer) to authenticated;

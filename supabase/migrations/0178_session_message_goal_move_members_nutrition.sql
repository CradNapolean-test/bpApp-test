-- Follow-ons (live review Build 8: BK16, CL10; 26 Nov 2026).
--
-- Before: a coach had no way to message everyone booked into one session ("car park closed tonight", BK16). The chat's insert rule
-- (owns_client) lets a coach post only into their OWN members' chats, and a session at the gym has members of several coaches.
-- A member's goal was kept in three places (CL10): the goal on Details (client_profiles.goal_description, which the member sees and
-- edits), the coach's Notes "Client Goals" card (client_journal_entries with kind 'goal', coach-only), and the weights. The owner chose
-- one place: the goal on Details, with the weights. The app no longer has the card.
--
-- New (each function is "security definer" with "set search_path = public" and checks its caller first):
--   1. message_session_booked(class_id, date, text) -> table (member_id, message_id, sent_at). For "Message everyone booked" in the
--      coach's Sessions pop-up. The caller must be a coach whose gym is the session's gym (my_gym_id(), which is null for a member and
--      for anyone signed out, and for a coach of another gym is that other gym): anyone else gets "Not authorized" and nothing is written.
--      It writes ONE chat message, from the caller, into the chat of each member BOOKED into that session on that date (bookings.status
--      'booked': not the waitlist, not cancelled or removed bookings), and no one else. The text is trimmed and must be 1 to 4,000
--      characters (chat_messages' own limit, 0108). It answers which messages it wrote, so the app pings exactly those members the way
--      every coach message does. It gives the caller no read access to anyone's chat (the chat's read rules are unchanged: a colleague's
--      member's thread stays private to that member's own coach, D3/0153); the member and their own coach see the message in their chat.
--   2. A data move, no function (CL10). client_journal_entries gets a column, moved_to_goal_at (timestamptz, null). Every goal entry not
--      moved yet is added to the end of its member's goal, oldest first, a blank line between pieces (an empty goal just takes them),
--      unless its words are already in the goal word for word. Every entry of a member whose goal was written is marked moved_to_goal_at
--      = now(). No row is deleted. A member whose goal would pass the goal's 5,000-character limit (0111) is left alone and unmarked:
--      Details lists those entries with "Add to goal" for the coach. Marked entries are never looked at again, so a second run moves
--      nothing twice (a goal entry a coach adds with the old app between this and the deploy is picked up by a second run, or by
--      "Add to goal").
--      PLEASE READ the entries first (the PRE-FLIGHT lists them): "Client Goals" were coach-only notes, and the goal on Details is the
--      member's own field, which they see and can edit. Once moved, the member sees that text.
--
-- Apply: BEFORE the deploy (either order works). The live app doesn't call the function, and its Notes card keeps showing the goal
-- entries (the rows are kept), so it works the same with this applied. Deployed first: "Message everyone booked" answers "This needs a
-- database update (migration 0178)..." and sends nothing, and the goal entries (no longer in Notes) show on Details under the goal, each
-- with "Add to goal", until this is applied; nothing is hidden or lost either way.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... already exists and is not this file's"). Bodies are compared with
-- spaces and line breaks squeezed out. A second run finds this file's own bodies and passes. Safe to run twice: the functions are
-- "create or replace" with the same bodies, and the grants are the same.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.message_session_booked(uuid, date, text)') is not null as session_message,
--          to_regprocedure('public.my_gym_id()') is not null as needs_0052;
-- Expected before: false, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('message_session_booked');
-- Expected before: no rows.
--   select (select count(*) from public.chat_messages) as chat_messages;
-- Note it (this file writes no message).
--   select count(*) as goal_entries,
--          count(distinct j.client_id) as members_with_them,
--          count(distinct j.client_id) filter (where btrim(coalesce(p.goal_description, '')) <> '') as already_have_a_details_goal,
--          count(*) filter (where btrim(j.body) = '') as empty_entries,
--          count(*) filter (where p.client_id is null) as no_profile_row,
--          (select count(*) from public.client_journal_entries) as all_journal_entries
--   from public.client_journal_entries j
--   left join public.client_profiles p on p.client_id = j.client_id
--   where j.kind = 'goal';
-- Note all six. no_profile_row is expected 0 (such entries would be left unmoved until the member has a profile).
--   select count(*) as would_pass_5000
--   from (select p.client_id, char_length(coalesce(p.goal_description, '')) + sum(char_length(btrim(j.body)) + 2) as len
--         from public.client_journal_entries j join public.client_profiles p on p.client_id = j.client_id
--         where j.kind = 'goal' group by p.client_id, p.goal_description) t
--   where len > 5000;
-- Expected 0 (an upper bound: those members are left for the coach).
--   select coalesce(p.name, j.client_id::text) as member, j.created_at::date as written, j.body
--   from public.client_journal_entries j left join public.client_profiles p on p.client_id = j.client_id
--   where j.kind = 'goal' order by 1, 2;
-- Read these: each becomes part of a goal the member sees.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef, p.proconfig
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('message_session_booked') order by 1;
-- Expected after (this file's bodies: the values in the guard below), prosecdef true, proconfig {search_path=public}.
--   select has_function_privilege('authenticated', 'public.message_session_booked(uuid, date, text)', 'execute') as signed_in,
--          has_function_privilege('anon', 'public.message_session_booked(uuid, date, text)', 'execute') as anyone;
-- Expected: true, false (signed-in members can call it but are refused inside: my_gym_id() is null for them).
--   (the PRE-FLIGHT's chat_messages count again)
-- Expected after: the same number.
--   select count(*) filter (where j.moved_to_goal_at is not null) as moved,
--          count(*) filter (where j.moved_to_goal_at is null) as left_for_the_coach,
--          (select count(*) from public.client_journal_entries) as all_journal_entries
--   from public.client_journal_entries j where j.kind = 'goal';
-- Expected: moved = goal_entries - left_for_the_coach; left_for_the_coach = the entries of would_pass_5000's members (0 expected) plus
-- no_profile_row; all_journal_entries the same as before (nothing deleted).
--   select count(*) as moved_but_not_in_the_goal
--   from public.client_journal_entries j join public.client_profiles p on p.client_id = j.client_id
--   where j.kind = 'goal' and j.moved_to_goal_at is not null and btrim(j.body) <> ''
--     and strpos(coalesce(p.goal_description, ''), btrim(j.body)) = 0;
-- Expected 0: every moved entry's words are in its member's goal (no text lost).
--   select count(*) filter (where btrim(coalesce(goal_description, '')) <> '') as members_with_a_goal from public.client_profiles;
-- Expected: the PRE-FLIGHT's already_have_a_details_goal plus the members who had goal entries but no goal (never fewer than before).
--   Run the file a second time, then the three queries above again. Expected: exactly the same numbers (nothing moved twice).
--   As a member, then as a coach of ANOTHER gym, inside a transaction that is rolled back (put their id and a session's class id and date in):
--     begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', '<member or other-gym coach id>', 'role', 'authenticated')::text, true);
--     select * from public.message_session_booked('<class id>', '<date>', 'test');
--     rollback;
-- Expected: ERROR "Not authorized" for both. As anon (set local role anon, no claims): permission denied.
--
-- Write checks (test accounts, on a sandbox, not the live project): a session with members A and B booked (A is coach X's member, B is
-- coach Y's), C on its waitlist and D who cancelled. As coach Y (same gym): select * from message_session_booked(session, date, 'Car park
-- closed') -> two rows, for A and B; A's and B's chats each have one new message from Y; C and D have none. Run it as a coach of another
-- gym -> "Not authorized", nothing written. With text '   ' -> "Write a message first", nothing written.
--
-- REVERSE: drop function if exists public.message_session_booked(uuid, date, text); (the app then says the update is needed again).
-- The goal move has no automatic reverse: the old entries are all kept, so a goal can be put back by hand from them (each moved entry's
-- text is on the end of the goal, in the order written). To make Details list them again: update public.client_journal_entries set
-- moved_to_goal_at = null where kind = 'goal'; (the column can stay).
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
      ('message_session_booked', '71b9b9ac8fcb83b4cd60b463329d36a8')
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

  foreach v_name in array array['my_gym_id'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception 'function % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  foreach v_name in array array['public.bookings', 'public.classes', 'public.chat_messages', 'public.client_journal_entries', 'public.client_profiles'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('bookings', 'client_id'), ('bookings', 'class_id'), ('bookings', 'booking_date'), ('bookings', 'status'),
      ('classes', 'gym_id'), ('chat_messages', 'client_id'), ('chat_messages', 'sender_id'), ('chat_messages', 'text'),
      ('chat_messages', 'created_at'), ('client_journal_entries', 'id'), ('client_journal_entries', 'client_id'),
      ('client_journal_entries', 'kind'), ('client_journal_entries', 'body'), ('client_journal_entries', 'created_at'),
      ('client_profiles', 'client_id'), ('client_profiles', 'goal_description')
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
-- 1. Message everyone booked into a session (BK16)
-- =====================================================================================================================================
create or replace function public.message_session_booked(p_class_id uuid, p_date date, p_text text)
returns table (member_id uuid, message_id uuid, sent_at timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_member record;
begin
  -- A coach at the session's gym only. my_gym_id() is the caller's gym when they are a coach, and null for a member or anyone signed out.
  select c.gym_id into v_gym from classes c where c.id = p_class_id;
  if v_gym is null or public.my_gym_id() is null or v_gym is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if p_date is null then
    raise exception 'Choose the session''s date';
  end if;
  if v_text = '' then
    raise exception 'Write a message first';
  end if;
  if char_length(v_text) > 4000 then
    raise exception 'That message is too long';
  end if;

  -- One message each, from the caller, to the members booked into this session on this date: not the waitlist, not cancelled or removed.
  for v_member in
    select distinct b.client_id
    from bookings b
    where b.class_id = p_class_id
      and b.booking_date = p_date
      and b.status = 'booked'
  loop
    insert into chat_messages (client_id, sender_id, text)
    values (v_member.client_id, auth.uid(), v_text)
    returning chat_messages.id, chat_messages.created_at into message_id, sent_at;
    member_id := v_member.client_id;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.message_session_booked(uuid, date, text) from public, anon;
grant execute on function public.message_session_booked(uuid, date, text) to authenticated;

-- =====================================================================================================================================
-- 2. One goal per member (CL10): the Notes "Client Goals" entries move into the goal on Details
-- =====================================================================================================================================
-- Each goal entry not moved yet goes on the end of its member's goal (client_profiles.goal_description), oldest first, a blank line
-- between pieces; an empty goal just takes them. An entry whose words are already in the goal word for word adds nothing (it is there).
-- Every entry of a member whose goal was written is marked moved_to_goal_at; the rows themselves are kept. A member whose goal would pass
-- the goal's 5,000-character limit (0111) is left alone, unmarked: the app shows those entries on Details with "Add to goal". Marked
-- entries are never looked at again, so running this twice moves nothing twice.
alter table public.client_journal_entries add column if not exists moved_to_goal_at timestamptz;

with todo as (
  select j.id, j.client_id, btrim(j.body) as body, j.created_at
  from public.client_journal_entries j
  where j.kind = 'goal'
    and j.moved_to_goal_at is null
),
per_member as (
  select p.client_id,
         p.goal_description as old_goal,
         string_agg(t.body, E'\n\n' order by t.created_at, t.id)
           filter (where t.body <> '' and strpos(coalesce(p.goal_description, ''), t.body) = 0) as added
  from todo t
  join public.client_profiles p on p.client_id = t.client_id
  group by p.client_id, p.goal_description
),
merged as (
  select client_id,
         old_goal,
         case
           when added is null then old_goal
           when btrim(coalesce(old_goal, '')) = '' then added
           else regexp_replace(old_goal, '\s+$', '') || E'\n\n' || added
         end as new_goal
  from per_member
),
fits as (
  select client_id, old_goal, new_goal from merged where new_goal is null or char_length(new_goal) <= 5000
),
written as (
  update public.client_profiles p
  set goal_description = f.new_goal
  from fits f
  where p.client_id = f.client_id
    and f.new_goal is distinct from f.old_goal
  returning p.client_id
)
update public.client_journal_entries j
set moved_to_goal_at = now()
from todo t
join fits f on f.client_id = t.client_id
where j.id = t.id;

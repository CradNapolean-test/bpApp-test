-- Follow-ons (live review Build 8: BK16; 26 Nov 2026).
--
-- Before: a coach had no way to message everyone booked into one session ("car park closed tonight", BK16). The chat's insert rule
-- (owns_client) lets a coach post only into their OWN members' chats, and a session at the gym has members of several coaches.
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
--
-- Apply: BEFORE the deploy (either order works). The live app doesn't call it, so it works the same with this applied. Deployed first,
-- "Message everyone booked" answers "This needs a database update (migration 0178)..." and sends nothing.
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

  foreach v_name in array array['public.bookings', 'public.classes', 'public.chat_messages'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('bookings', 'client_id'), ('bookings', 'class_id'), ('bookings', 'booking_date'), ('bookings', 'status'),
      ('classes', 'gym_id'), ('chat_messages', 'client_id'), ('chat_messages', 'sender_id'), ('chat_messages', 'text'),
      ('chat_messages', 'created_at')
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

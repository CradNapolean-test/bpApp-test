-- Coach app speed (fix brief 05, CP1/SP1): one number for the unread-messages badge.
--
-- Every coach page drew its header badge by calling get_coach_chat_overview(), which builds a row for every one of the coach's members
-- (last message, preview, unread count) and then adds the unread counts up in the app. With 90 members that is the slowest part of
-- many pages, only to show one number. coach_unread_total() returns the same number (the messages the coach has not read, over all of
-- their own members) from one count.
--
-- The unread rule is the one get_coach_chat_overview() uses: messages in a thread of a member whose coach is the caller, not sent by the
-- caller, newer than the coach's last-read time for that thread (all of them when the coach has never opened it).
--
-- PRE-FLIGHT (read-only; the two numbers must agree for the same coach once this is applied; as a signed-in coach):
--   select (select sum(unread_count) from public.get_coach_chat_overview()) as from_overview, public.coach_unread_total() as from_total;
--
-- Apply after 0133 (0143 stays last). Safe to run again.

create or replace function public.coach_unread_total()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)
  from chat_messages cm
  join profiles p on p.id = cm.client_id and p.coach_id = auth.uid()
  left join chat_threads ct on ct.client_id = p.id
  where cm.sender_id is distinct from auth.uid()
    and cm.created_at > coalesce(ct.coach_last_read_at, '-infinity'::timestamptz);
$$;

revoke execute on function public.coach_unread_total() from public, anon;
grant execute on function public.coach_unread_total() to authenticated;

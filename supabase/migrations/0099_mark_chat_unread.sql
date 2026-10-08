-- A coach can mark a conversation unread again. Unread is "messages from the other side newer than the coach's
-- last-read time" (see mark_chat_read, 0014), so marking unread moves that time back to just before the member's
-- latest message, which makes that message (and anything after it) count as unread once more.

create or replace function public.mark_chat_unread(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_last timestamptz;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select max(created_at) into v_last from chat_messages where client_id = p_client_id and sender_id = p_client_id;
  if v_last is null then
    return; -- they have not written anything, so there is nothing to mark
  end if;

  insert into chat_threads (client_id, coach_last_read_at)
  values (p_client_id, v_last - interval '1 millisecond')
  on conflict (client_id) do update set coach_last_read_at = v_last - interval '1 millisecond';
end;
$fn$;

grant execute on function public.mark_chat_unread(uuid) to authenticated;

-- The coach's inbox list showed "No messages yet" when a thread's latest message was a voice note
-- or a photo (they have no text). Same function as 0014, but the preview now says what it was.
create or replace function public.get_coach_chat_overview()
returns table (
  client_id uuid,
  client_name text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    coalesce(cp.name, p.email),
    lm.preview,
    lm.created_at,
    lm.sender_id,
    coalesce(uc.unread_count, 0)
  from profiles p
  left join client_profiles cp on cp.client_id = p.id
  left join lateral (
    select
      coalesce(
        text,
        case when audio_path is not null then 'Voice note' when image_path is not null then 'Photo' end
      ) as preview,
      created_at,
      sender_id
    from chat_messages
    where chat_messages.client_id = p.id
    order by created_at desc limit 1
  ) lm on true
  left join chat_threads ct on ct.client_id = p.id
  left join lateral (
    select count(*) as unread_count from chat_messages cm
    where cm.client_id = p.id
      and cm.sender_id <> auth.uid()
      and cm.created_at > coalesce(ct.coach_last_read_at, '-infinity'::timestamptz)
  ) uc on true
  where p.coach_id = auth.uid()
  order by lm.created_at desc nulls last;
$$;

grant execute on function public.get_coach_chat_overview() to authenticated;

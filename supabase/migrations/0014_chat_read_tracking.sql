-- Coach-facing messaging inbox: today the coach only sees a client's chat after navigating
-- into that specific client's dashboard, with no read-tracking and no way to see "who
-- messaged recently" across their whole roster. This adds read-tracking (per side, since a
-- thread has exactly two participants: the client and their coach) and an overview RPC the
-- coach's inbox page can list-and-sort by.

create table chat_threads (
  client_id uuid primary key references profiles(id) on delete cascade,
  client_last_read_at timestamptz,
  coach_last_read_at timestamptz
);

alter table chat_threads enable row level security;

create policy "select own or coached chat_threads"
  on chat_threads for select
  using (owns_client(client_id));

-- Upserts whichever side's read-timestamp matches the caller -- a client marks their own
-- side read, a coach marks their side read, never both from one call.
create or replace function public.mark_chat_read(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not owns_client(p_client_id) then
    raise exception 'Not authorized';
  end if;

  insert into chat_threads (client_id, client_last_read_at, coach_last_read_at)
  values (
    p_client_id,
    case when is_self(p_client_id) then now() end,
    case when is_coach_of(p_client_id) then now() end
  )
  on conflict (client_id) do update set
    client_last_read_at = case when is_self(p_client_id) then now() else chat_threads.client_last_read_at end,
    coach_last_read_at = case when is_coach_of(p_client_id) then now() else chat_threads.coach_last_read_at end;
end;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;

-- One row per client of the calling coach: last message + unread count, for the coach's
-- inbox list. Returns nothing for a client caller (no profile has coach_id = a client's own
-- uid), so this is effectively coach-only without a separate role check.
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
    lm.text,
    lm.created_at,
    lm.sender_id,
    coalesce(uc.unread_count, 0)
  from profiles p
  left join client_profiles cp on cp.client_id = p.id
  left join lateral (
    select text, created_at, sender_id from chat_messages
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

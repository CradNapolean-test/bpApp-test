create table scheduled_communications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  message text not null,
  target_type text not null check (target_type in ('group', 'all_clients')),
  target_group_id uuid references client_groups(id) on delete set null,
  send_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz default now(),
  check (
    (target_type = 'group' and target_group_id is not null) or
    (target_type = 'all_clients' and target_group_id is null)
  )
);

alter table scheduled_communications enable row level security;

create policy "coach manages own scheduled_communications"
  on scheduled_communications for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Cron-only, mirrors send_checkin_reminders (0007) -- deliberately NOT granted to
-- `authenticated`. Granting it broadly would let ANY logged-in user (including a client) call
-- it directly and force-process every coach's due broadcasts platform-wide, and a bare loop
-- with no per-row claim would race under concurrent calls. Restricting to service-role-only
-- removes both: only Vercel's single scheduled trigger ever calls this. "Send now" broadcasts
-- never go through this function at all -- see composeCommunication in lib/data/communications.ts,
-- which does a direct RLS-scoped insert loop instead. This function only ever processes rows
-- that were genuinely scheduled for later.
create or replace function public.send_due_communications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm record;
  v_client_id uuid;
  v_count integer := 0;
begin
  for v_comm in
    select id, coach_id, message, target_type, target_group_id
    from scheduled_communications
    where sent_at is null and send_at <= now()
    for update skip locked
  loop
    if v_comm.target_type = 'all_clients' then
      for v_client_id in select id from profiles where coach_id = v_comm.coach_id loop
        insert into chat_messages (client_id, sender_id, text) values (v_client_id, v_comm.coach_id, v_comm.message);
        v_count := v_count + 1;
      end loop;
    else
      for v_client_id in select client_id from client_group_members where group_id = v_comm.target_group_id loop
        insert into chat_messages (client_id, sender_id, text) values (v_client_id, v_comm.coach_id, v_comm.message);
        v_count := v_count + 1;
      end loop;
    end if;
    update scheduled_communications set sent_at = now() where id = v_comm.id;
  end loop;
  return v_count;
end;
$$;
-- No grant to authenticated -- only the cron route's service-role admin client calls this.

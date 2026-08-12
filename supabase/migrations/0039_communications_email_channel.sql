-- Adds an email delivery channel alongside the existing in-app message channel. `sent_at` keeps
-- its current meaning (message channel processed); `email_sent_at` is the equivalent marker for
-- the email channel, kept independent so a 'both' row can have one channel done before the
-- other. Email itself is sent from TypeScript (lib/email.ts, called from composeCommunication
-- for immediate sends and from the cron route for scheduled ones) -- send_due_communications()
-- can't call Resend directly (plpgsql has no outbound HTTP without the pg_net extension), so
-- this migration only touches the in-app message fan-out this RPC is already responsible for.
alter table scheduled_communications
  add column channel text not null default 'message' check (channel in ('message', 'email', 'both')),
  add column email_sent_at timestamptz;

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
    select id, coach_id, message, target_type, target_group_id, channel
    from scheduled_communications
    where sent_at is null and send_at <= now()
    for update skip locked
  loop
    if v_comm.channel in ('message', 'both') then
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
    end if;
    update scheduled_communications set sent_at = now() where id = v_comm.id;
  end loop;
  return v_count;
end;
$$;
-- No grant to authenticated -- only the cron route's service-role admin client calls this.
-- (Grant/revoke state carries over from 0032 automatically; create-or-replace doesn't reset it.)

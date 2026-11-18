-- Messages and push (live review decisions of 11 Nov 2026). Each part has its own before/after below:
--   1. D21: a whole-gym broadcast is posted only into the sending coach's own members' chats (create_communication,
--      send_due_communications).
--   2. MS10: a coach can mark a conversation "No reply needed" (chat_threads.coach_no_reply_at, set_chat_no_reply,
--      get_coach_chat_overview).
--   3. D20: session_reminders, so the reminder before a booked session never goes twice for the same booking.
--
-- 1. D21 (MS7, MS8). A broadcast is saved as a chat message from the coach who sent it. A whole-gym one went into every member's thread at
--   the gym, so every other coach saw it in their own members' threads drawn as the member's message, and counted as unread (unread means
--   "not sent by me"): one broadcast lit up every thread of every other coach (live on 6 Nov, the other 2 coaches' only unread messages were
--   one of Brad's broadcasts).
-- After: a whole-gym broadcast still goes to everyone at the gym by EMAIL (when the coach picks Email or Both), but the in-app message only
--   goes into the threads of the sending coach's own members at that gym. "My clients" and group broadcasts are unchanged. Broadcasts
--   already sent stay where they are (nothing is deleted or moved). Scheduled and weekly-repeating whole-gym broadcasts follow the new
--   rule from their next send (the PRE-FLIGHT lists them).
--   create_communication (last defined in migration 0097) sends a broadcast now or schedules it; it still returns every recipient, because
--   the app emails that list. send_due_communications (last defined in migration 0133) sends the scheduled ones (the send-communications
--   job). Nothing else in either function changes.
--
-- 2. MS10. The coach's Messages list has a "Needs reply" filter: conversations whose newest message is the member's. A thread stayed there
--   until the coach wrote, even when the member's last word was "thanks" (live on 6 Nov, 1 of the 5 under Needs reply).
-- After: the coach can choose "No reply needed" on a conversation (the menu on each row). That stamps the new column
--   chat_threads.coach_no_reply_at with the time and marks the conversation read; the app leaves it out of Needs reply until the member
--   writes again (a message newer than the stamp). "Needs a reply after all" clears the stamp.
--   New: chat_threads.coach_no_reply_at (timestamptz, empty by default). chat_threads keeps its only rule, "select own or coached
--     chat_threads" (0014): the member and their own coach can read it, nobody else (0153). Nobody writes it directly: there is no write rule,
--     only the new set_chat_no_reply(member, true/false), which refuses anyone but the member's own coach (as mark_chat_unread, 0099). The
--     member can read the stamp on their own thread through the database API, as they can read the coach's last-read time today.
--   get_coach_chat_overview (last defined in migration 0086) gives the coach's list; it returns one more column, no_reply_at. Adding an
--     output column needs a drop and create, so its execute rights are set again as they were (signed-in users only, 0105). The rows, the
--     last message and the unread count are unchanged, and still only for the caller's own members.
--
-- 3. D20. A push about 2 hours before a booked session (the evening before for an early class), sent by a new hourly job
--   (/api/cron/session-reminders, called by the GitHub Actions workflow that already runs every hour). New table session_reminders: one
--   row per booking reminded (booking_id is the primary key, so a second run, or two at once, cannot remind the same booking again). It
--   is gone with the booking (on delete cascade), and the job removes rows older than 30 days. Written and read by the job's service role
--   only: Row Level Security is on with no rule, and members and coaches have no access to it. Nothing about bookings, credits or their
--   functions changes. The other D20 pushes (plan ready, programme assigned, credits added) are sent by the app and need nothing here.
--
-- Guard: before changing anything, the migration checks each function it replaces is the expected current one (or already this file's),
-- comparing their bodies with spaces and line breaks squeezed out. If one has been changed some other way since, nothing is changed and it
-- stops with "... is not the one from migration ...". Then send the PRE-FLIGHT's results to the developer instead.
--
-- PRE-FLIGHT (read-only):
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('create_communication', 'send_due_communications', 'get_coach_chat_overview') order by 1;
-- Expected before: create_communication 345eaadd17306e4d1e63b6edd4f2a82f (0097's body), get_coach_chat_overview
-- 45993cf5e035774b4d8da8f5157d9226 (0086's body), send_due_communications fb1477aeb5df7688cbfb197e3a23f3be (0133's body).
--
--   -- 1. Whole-gym broadcasts not sent yet (one-off or repeating): from their next send, the in-app message reaches only the sender's own
--   -- members (own_members_at_gym); everyone at the gym (members_at_gym) still gets the email when the channel is email or both.
--   select sc.id, coalesce(nullif(c.display_name, ''), c.email) as coach, sc.channel, sc.repeat, sc.send_at,
--          (select count(*) from profiles m where m.role = 'client' and m.gym_id = sc.gym_id) as members_at_gym,
--          (select count(*) from profiles m where m.role = 'client' and m.gym_id = sc.gym_id and m.coach_id = sc.coach_id) as own_members_at_gym
--   from scheduled_communications sc join profiles c on c.id = sc.coach_id
--   where sc.target_type in ('gym', 'all_clients') and sc.sent_at is null and sc.cancelled_at is null
--   order by sc.send_at;
--
--   -- 1. Whole-gym broadcasts already sent, by coach (these stay in the threads as they are):
--   select coalesce(nullif(c.display_name, ''), c.email) as coach, count(*) as sent
--   from scheduled_communications sc join profiles c on c.id = sc.coach_id
--   where sc.target_type in ('gym', 'all_clients') and sc.sent_at is not null group by 1 order by 1;
--
--   -- 2. The chat_threads columns and rules today (expected: client_id, client_last_read_at, coach_last_read_at; one rule, a select):
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'chat_threads' order by ordinal_position;
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'chat_threads';
--
--   -- 3. Booked sessions in the next day with a start time (each will get a reminder once push is switched on):
--   select count(*) from bookings b join classes c on c.id = b.class_id
--   where b.status = 'booked' and c.start_time is not null and b.booking_date between current_date and current_date + 1;
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: create_communication e428390440a2329b9fc8d28635bdc974, get_coach_chat_overview 2ea72539458e9a80e17d857b22379d3e,
-- send_due_communications b1e2515386a5649c8db9cd57c7daefb8 (this file's bodies).
--   select has_function_privilege('anon', 'public.create_communication(text, text, uuid, timestamptz, text, text)', 'execute') as anyone,
--          has_function_privilege('authenticated', 'public.create_communication(text, text, uuid, timestamptz, text, text)', 'execute') as coaches,
--          has_function_privilege('authenticated', 'public.send_due_communications()', 'execute') as members_can_run_job;
-- Expected: false, true, false (as before).
-- Then, as a coach with members of their own: Messages > Broadcasts > Whole gym, Message, Send now. Afterwards (read-only):
--   select p.coach_id = cm.sender_id as own_member, count(*) from chat_messages cm join profiles p on p.id = cm.client_id
--   where cm.sender_id = '<that coach''s id>' and cm.created_at > now() - interval '10 minutes' group by 1;
-- Expected: one row, own_member true (nothing in other coaches' members' threads).
--   (the PRE-FLIGHT's chat_threads queries again)
-- Expected: the same three columns plus coach_no_reply_at (timestamp with time zone); still the one select rule.
--   select has_function_privilege('anon', 'public.set_chat_no_reply(uuid, boolean)', 'execute') as anyone,
--          has_function_privilege('authenticated', 'public.set_chat_no_reply(uuid, boolean)', 'execute') as signed_in,
--          has_function_privilege('anon', 'public.get_coach_chat_overview()', 'execute') as anyone_overview,
--          has_function_privilege('authenticated', 'public.get_coach_chat_overview()', 'execute') as signed_in_overview;
-- Expected: false, true, false, true.
-- Then, as a coach: Messages, Needs reply, the "..." on a conversation, "No reply needed". It leaves Needs reply; after a reload it stays out.
-- Afterwards (read-only): select count(*) from chat_threads where coach_no_reply_at is not null; -- expected: 1 or more
--   select c.relrowsecurity as rls_on, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_reminders') as rules,
--          has_table_privilege('authenticated', 'public.session_reminders', 'select') as signed_in_can_read,
--          has_table_privilege('anon', 'public.session_reminders', 'select') as anyone_can_read
--   from pg_class c where c.oid = 'public.session_reminders'::regclass;
-- Expected: true, 0, false, false.
-- Once push is on and CRON_SECRET is in GitHub, after a session with bookings (read-only):
--   select count(*) as reminded, count(distinct booking_id) as bookings from session_reminders; -- the two are always equal
--   select job, ran_at, ok, detail from job_runs where job = 'session-reminders' order by ran_at desc limit 5;
--
-- REVERSE: run create_communication's definition from migration 0097 and send_due_communications' from migration 0133 again (each from its
-- "create or replace function" line to its closing delimiter; same arguments and return types, so no drop is needed). For part 2:
-- drop function public.get_coach_chat_overview(); then run its definition from migration 0086 and 0105's
-- "revoke execute on function public.get_coach_chat_overview() from public, anon;"; drop function public.set_chat_no_reply(uuid, boolean);
-- the column can stay (nothing else reads it), or: alter table public.chat_threads drop column coach_no_reply_at. For part 3: drop table
-- public.session_reminders (the job then fails without sending anything, so take its step out of the workflow first).
--
-- Must be applied before the app update that goes with it ships: the Broadcasts screen then says a whole-gym message only reaches the
-- coach's own members in the app, "No reply needed" calls set_chat_no_reply (without it the choice fails with "Could not save that"), and
-- the reminder job needs session_reminders (without it, it sends nothing and records a failed run). The new app reads no_reply_at only
-- when it is there, so the Messages list itself works either way.
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_create text;
  v_due text;
  v_overview text;
begin
  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_create
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'create_communication';
  if v_create is null or v_create not in ('345eaadd17306e4d1e63b6edd4f2a82f', 'e428390440a2329b9fc8d28635bdc974') then
    raise exception 'create_communication is not the one from migration 0097 (body md5 %), so nothing was changed.', coalesce(v_create, 'missing');
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_due
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'send_due_communications';
  if v_due is null or v_due not in ('fb1477aeb5df7688cbfb197e3a23f3be', 'b1e2515386a5649c8db9cd57c7daefb8') then
    raise exception 'send_due_communications is not the one from migration 0133 (body md5 %), so nothing was changed.', coalesce(v_due, 'missing');
  end if;

  select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_overview
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'get_coach_chat_overview';
  if v_overview is null or v_overview not in ('45993cf5e035774b4d8da8f5157d9226', '2ea72539458e9a80e17d857b22379d3e') then
    raise exception 'get_coach_chat_overview is not the one from migration 0086 (body md5 %), so nothing was changed.', coalesce(v_overview, 'missing');
  end if;
end
$guard$;

-- ---- 1. D21: whole-gym broadcasts go into the sender's own members' chats only ----------------------------------------------------

-- 0097's function; only the chat message line has a new condition. `recipients` is still everyone the broadcast reaches, for the email.
create or replace function public.create_communication(
  p_message text,
  p_target text,
  p_group uuid,
  p_send_at timestamptz,
  p_channel text,
  p_repeat text default 'none'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_id uuid;
  v_client uuid;
  v_recipients uuid[] := '{}';
  v_now boolean := false;
begin
  if v_gym is null or auth.uid() is null then
    raise exception 'Only a coach can send broadcasts';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Write a message first';
  end if;
  if p_target not in ('my_clients', 'gym', 'group') then
    raise exception 'Unknown audience';
  end if;
  if p_channel not in ('message', 'email', 'both') then
    raise exception 'Unknown channel';
  end if;
  if p_target = 'group' and not exists (select 1 from client_groups g where g.id = p_group and g.gym_id = v_gym) then
    raise exception 'Group not found';
  end if;
  if p_repeat = 'weekly' and p_send_at <= now() then
    raise exception 'A repeating message needs a first send time in the future';
  end if;

  insert into scheduled_communications (coach_id, gym_id, message, target_type, target_group_id, send_at, channel, repeat)
  values (auth.uid(), v_gym, p_message, p_target, case when p_target = 'group' then p_group else null end, p_send_at, p_channel, coalesce(p_repeat, 'none'))
  returning id into v_id;

  if coalesce(p_repeat, 'none') = 'none' and p_send_at <= now() then
    v_now := true;
    for v_client in select * from public.communication_recipients(v_gym, auth.uid(), p_target, p_group) loop
      v_recipients := v_recipients || v_client;
      -- D21: a whole-gym message goes into the sender's own members' chats only (everyone still gets the email).
      if p_channel in ('message', 'both')
         and (p_target <> 'gym' or exists (select 1 from profiles c where c.id = v_client and c.coach_id = auth.uid())) then
        insert into chat_messages (client_id, sender_id, text)
        values (v_client, auth.uid(), public.personalise_message(p_message, v_client));
      end if;
    end loop;
    update scheduled_communications set sent_at = now() where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'sent_now', v_now, 'recipients', to_jsonb(v_recipients));
end;
$fn$;

revoke execute on function public.create_communication(text, text, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.create_communication(text, text, uuid, timestamptz, text, text) to authenticated;

-- 0133's function; only the in-app recipients loop has a new condition (the email pass in the app still reads communication_recipients).
create or replace function public.send_due_communications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm record;
  v_client uuid;
  v_count integer := 0;
  v_tz text;
  v_next timestamptz;
begin
  for v_comm in
    select * from scheduled_communications
    where sent_at is null and cancelled_at is null and send_at <= now()
    for update skip locked
  loop
    if v_comm.target_type = 'group'
       and (v_comm.target_group_id is null or not exists (select 1 from client_groups g where g.id = v_comm.target_group_id)) then
      update scheduled_communications set cancelled_at = now() where id = v_comm.id;
      continue;
    end if;

    if v_comm.channel in ('message', 'both') then
      for v_client in
        select r.id
        from public.communication_recipients(v_comm.gym_id, v_comm.coach_id, v_comm.target_type, v_comm.target_group_id) as r(id)
        -- D21: a whole-gym message goes into the sender's own members' chats only.
        where v_comm.target_type not in ('gym', 'all_clients')
           or exists (select 1 from profiles c where c.id = r.id and c.coach_id = v_comm.coach_id)
      loop
        insert into chat_messages (client_id, sender_id, text)
        values (v_client, v_comm.coach_id, public.personalise_message(v_comm.message, v_client));
        v_count := v_count + 1;
      end loop;
    end if;

    if v_comm.repeat = 'weekly' then
      -- One normal "sent" row for this occurrence (so history, and the email pass, treat it like any other)...
      insert into scheduled_communications
        (coach_id, gym_id, message, target_type, target_group_id, send_at, sent_at, channel, repeat, series_id)
      values
        (v_comm.coach_id, v_comm.gym_id, v_comm.message, v_comm.target_type, v_comm.target_group_id,
         v_comm.send_at, now(), v_comm.channel, 'none', v_comm.id);

      -- ...and the series moves on a week at a time, keeping the same wall-clock time at the gym.
      select coalesce(timezone, 'UTC') into v_tz from gyms where id = v_comm.gym_id;
      v_next := v_comm.send_at;
      loop
        v_next := ((v_next at time zone v_tz) + interval '7 days') at time zone v_tz;
        exit when v_next > now();
      end loop;
      update scheduled_communications set send_at = v_next, last_sent_at = now() where id = v_comm.id;
    else
      update scheduled_communications set sent_at = now() where id = v_comm.id;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.send_due_communications() from public, anon, authenticated;

-- ---- 2. MS10: "No reply needed" ---------------------------------------------------------------------------------------------------

alter table public.chat_threads add column if not exists coach_no_reply_at timestamptz;

-- The member's own coach marks the conversation as needing no reply (and read), or takes the mark off again. The app leaves a marked
-- conversation out of Needs reply until the member writes again.
create or replace function public.set_chat_no_reply(p_client_id uuid, p_no_reply boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_client_id is null or not coalesce(public.is_coach_of(p_client_id), false) then
    raise exception 'Not authorized';
  end if;

  if coalesce(p_no_reply, false) then
    insert into chat_threads (client_id, coach_last_read_at, coach_no_reply_at)
    values (p_client_id, now(), now())
    on conflict (client_id) do update set
      coach_no_reply_at = now(),
      coach_last_read_at = greatest(chat_threads.coach_last_read_at, now());
  else
    update chat_threads set coach_no_reply_at = null where client_id = p_client_id;
  end if;
end;
$fn$;

revoke all on function public.set_chat_no_reply(uuid, boolean) from public, anon;
grant execute on function public.set_chat_no_reply(uuid, boolean) to authenticated;

-- 0086's function plus the no_reply_at column. A new output column cannot be added with "create or replace", hence the drop.
drop function if exists public.get_coach_chat_overview();

create function public.get_coach_chat_overview()
returns table (
  client_id uuid,
  client_name text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint,
  no_reply_at timestamptz
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
    coalesce(uc.unread_count, 0),
    ct.coach_no_reply_at
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

revoke execute on function public.get_coach_chat_overview() from public, anon;
grant execute on function public.get_coach_chat_overview() to authenticated;
-- ---- 3. D20: one reminder per booking -----------------------------------------------------------------------------------------------

create table if not exists public.session_reminders (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists session_reminders_sent_at_idx on public.session_reminders (sent_at);

-- Written and read with the service role only (the hourly job): no rule, so the API shows members and coaches nothing.
alter table public.session_reminders enable row level security;
revoke all on table public.session_reminders from anon, authenticated;

-- Broadcasts: a clear audience, weekly repeats, saved message templates and a first-name insert.
--
--   * Audience is now one of: the coach's own clients ('my_clients'), the whole gym ('gym', so a coach can
--     cover for one who is away), or a group. ('all_clients' stays valid for rows sent before this and means
--     the whole gym, as it always did in the scheduled path.)
--   * A broadcast can repeat weekly. The repeating row is a series that never counts as sent; each time it is
--     due it posts the message and writes a normal "sent" row for that occurrence, then moves its own date on
--     by a week (in the gym's timezone, so 9:00 stays 9:00 across the clocks changing).
--   * "{first name}" in a message becomes each client's first name.
--   * Both sending now and scheduled sending go through the same recipient list, and the in-app message is only
--     posted when the channel includes it (an email-only broadcast no longer also posts a chat message).

-- ---- columns and constraints ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'scheduled_communications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%target_type%'
  loop
    execute format('alter table scheduled_communications drop constraint %I', r.conname);
  end loop;
end $$;

alter table scheduled_communications
  add constraint scheduled_communications_target_type_check
    check (target_type in ('group', 'all_clients', 'my_clients', 'gym')),
  add constraint scheduled_communications_target_group_check
    check (
      (target_type = 'group' and target_group_id is not null)
      or (target_type in ('all_clients', 'my_clients', 'gym') and target_group_id is null)
    );

alter table scheduled_communications
  add column if not exists repeat text not null default 'none' check (repeat in ('none', 'weekly')),
  add column if not exists last_sent_at timestamptz,
  add column if not exists series_id uuid references scheduled_communications(id) on delete set null;

-- ---- saved message templates ---------------------------------------------------------------------------
create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table message_templates enable row level security;

drop policy if exists "gym coaches manage message_templates" on message_templates;
create policy "gym coaches manage message_templates"
  on message_templates for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ---- who a broadcast reaches ---------------------------------------------------------------------------
create or replace function public.communication_recipients(p_gym uuid, p_coach uuid, p_target text, p_group uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id
  from profiles c
  where c.role = 'client'
    and (
      (p_target = 'my_clients' and c.coach_id = p_coach)
      or (
        p_target in ('gym', 'all_clients')
        and exists (select 1 from profiles coach where coach.id = c.coach_id and coach.gym_id = p_gym)
      )
      or (
        p_target = 'group'
        and exists (select 1 from client_group_members m where m.group_id = p_group and m.client_id = c.id)
      )
    );
$fn$;

revoke all on function public.communication_recipients(uuid, uuid, text, uuid) from public, anon, authenticated;

-- "{first name}" -> the client's first name (or "there" when we don't have one).
create or replace function public.personalise_message(p_text text, p_client uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select regexp_replace(
    p_text,
    '\{first name\}',
    coalesce(nullif(split_part(trim(coalesce((select name from client_profiles where client_id = p_client), '')), ' ', 1), ''), 'there'),
    'gi'
  );
$fn$;

revoke all on function public.personalise_message(text, uuid) from public, anon, authenticated;

-- ---- the daily / hourly job ----------------------------------------------------------------------------
create or replace function public.send_due_communications()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_comm record;
  v_client uuid;
  v_count integer := 0;
  v_tz text;
  v_next timestamptz;
begin
  for v_comm in
    select * from scheduled_communications
    where sent_at is null and send_at <= now()
    for update skip locked
  loop
    if v_comm.channel in ('message', 'both') then
      for v_client in
        select * from public.communication_recipients(v_comm.gym_id, v_comm.coach_id, v_comm.target_type, v_comm.target_group_id)
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
$fn$;

-- ---- creating a broadcast (called by a coach) ----------------------------------------------------------
-- Sends straight away when the time is now or past, otherwise schedules it. Returns {id, sent_now,
-- recipients}; recipients is only filled in for an immediate send, so the app can email them.
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
      if p_channel in ('message', 'both') then
        insert into chat_messages (client_id, sender_id, text)
        values (v_client, auth.uid(), public.personalise_message(p_message, v_client));
      end if;
    end loop;
    update scheduled_communications set sent_at = now() where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'sent_now', v_now, 'recipients', to_jsonb(v_recipients));
end;
$fn$;

grant execute on function public.create_communication(text, text, uuid, timestamptz, text, text) to authenticated;

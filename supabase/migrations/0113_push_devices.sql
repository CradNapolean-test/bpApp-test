-- Push notifications for the phone app (slice 8c).
--
-- The web app already pushes to browsers (push_subscriptions, 0060). A phone registers an Expo push token instead. This adds the
-- table that holds them and the one function a member's phone uses to register.
--
-- 1. push_devices: one row per phone (the Expo push token, which is what the push service addresses). A member can READ and
--    DELETE their own rows (the delete is "turn push off on this phone", and sign-out does it). They cannot insert or update
--    directly: registration goes through register_push_device() so the rules below cannot be skipped. The sender (the web app's
--    server, which holds the service-role key) reads the table to find a member's phones and removes tokens Expo says are dead.
-- 2. register_push_device(token, platform, name): for the SIGNED-IN member only (it never takes a member id), members only.
--      - the token must look like an Expo push token (ExponentPushToken[...]) and the platform must be ios or android;
--      - if the same phone was registered to someone else (a phone that changed hands), that old row goes: a token belongs to
--        exactly one member at a time;
--      - registering the same token again just refreshes it (last_seen_at);
--      - at most 5 phones per member: registering a sixth removes the one not seen for longest.
--    Not callable by anon.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  device_name text check (device_name is null or char_length(device_name) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_devices_token_format check (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$')
);

create index if not exists push_devices_client_idx on public.push_devices (client_id);

alter table public.push_devices enable row level security;

drop policy if exists "member reads own push_devices" on public.push_devices;
create policy "member reads own push_devices"
  on public.push_devices for select
  using (is_self(client_id));

drop policy if exists "member deletes own push_devices" on public.push_devices;
create policy "member deletes own push_devices"
  on public.push_devices for delete
  using (is_self(client_id));

-- No insert or update policy on purpose: only register_push_device() writes (RLS denies the rest). The grants say the same.
revoke all on public.push_devices from anon;
revoke insert, update on public.push_devices from authenticated;

create or replace function public.register_push_device(p_token text, p_platform text, p_device_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then
    raise exception 'Not authorized';
  end if;

  select role into v_role from profiles where id = v_me;
  if v_role is distinct from 'client' then
    raise exception 'Only members can register a phone for push notifications';
  end if;

  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$' then
    raise exception 'That is not a valid push token';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'The platform must be ios or android';
  end if;

  -- A token belongs to one member at a time: if this phone was someone else's, it is now this member's.
  delete from push_devices where expo_token = p_token and client_id <> v_me;

  insert into push_devices (client_id, expo_token, platform, device_name)
  values (v_me, p_token, p_platform, left(nullif(trim(p_device_name), ''), 80))
  on conflict (expo_token) do update
    set platform = excluded.platform,
        device_name = excluded.device_name,
        last_seen_at = now();

  -- At most 5 phones per member: keep the ones seen most recently.
  delete from push_devices
  where client_id = v_me
    and id not in (
      select id from push_devices where client_id = v_me order by last_seen_at desc, created_at desc limit 5
    );
end;
$$;

revoke execute on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;

-- Follow-ups to 0112 and 0114 found in review.
--
-- 1. The per-day caps (40 meal photos, 100 manual macro entries) counted rows with no lock, so two simultaneous inserts
--    could both see the old count and both succeed. Inserts for the same day now queue behind a transaction-scoped lock.
-- 2. event_signup_rules had no exception for the system (service role / cron / import scripts, auth.uid() is null), unlike
--    lesson_completion_rules. The system is no longer held to the member rules.

create or replace function public.food_photo_entry_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select client_id into v_owner from daily_logs where id = new.daily_log_id;
  if v_owner is null then
    raise exception 'That day does not exist';
  end if;

  -- The file must be in the member's own folder, as the storage policies already require for uploading it.
  if split_part(new.storage_path, '/', 1) is distinct from v_owner::text then
    raise exception 'A meal photo must be stored in the member''s own folder';
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('food_photo_entries:' || new.daily_log_id::text));
    if (select count(*) from food_photo_entries where daily_log_id = new.daily_log_id) >= 40 then
      raise exception 'That day already has the most photos allowed (40)';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.manual_macro_entry_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('manual_macro_entries:' || new.daily_log_id::text));
  if (select count(*) from manual_macro_entries where daily_log_id = new.daily_log_id) >= 100 then
    raise exception 'That day already has the most macro entries allowed (100)';
  end if;
  return new;
end;
$$;

create or replace function public.event_signup_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event gym_events;
begin
  -- The system (service role, no signed-in member) is not held to the member's rules.
  if auth.uid() is null then
    return new;
  end if;

  select * into v_event from gym_events where id = new.event_id for update;
  if v_event is null then
    raise exception 'Event not found';
  end if;
  if v_event.starts_at < now() - interval '6 hours' then
    raise exception 'This event has already happened';
  end if;
  if v_event.capacity is not null
     and (select count(*) from event_signups where event_id = new.event_id) >= v_event.capacity then
    raise exception 'This event is full';
  end if;
  return new;
end;
$$;

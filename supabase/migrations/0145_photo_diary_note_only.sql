-- Photo diary: a meal can be logged with a description alone (no photo).
--
-- A member who forgot to take a photo, or could not, used to be unable to log the meal at all. storage_path is now optional, but a
-- row still has to carry something: a photo, or a non-empty description. The rule that a photo must sit in the member's own folder is
-- unchanged and still applies whenever there is a photo. RLS is untouched.

alter table public.food_photo_entries alter column storage_path drop not null;

alter table public.food_photo_entries drop constraint if exists food_photo_entries_photo_or_note;
alter table public.food_photo_entries
  add constraint food_photo_entries_photo_or_note check (
    storage_path is not null or (description is not null and char_length(btrim(description)) > 0)
  ) not valid;

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

  -- When there is a file it must be in the member's own folder, as the storage policies already require for uploading it.
  if new.storage_path is not null and split_part(new.storage_path, '/', 1) is distinct from v_owner::text then
    raise exception 'A meal photo must be stored in the member''s own folder';
  end if;

  if tg_op = 'INSERT' and (select count(*) from food_photo_entries where daily_log_id = new.daily_log_id) >= 40 then
    raise exception 'That day already has the most photos allowed (40)';
  end if;

  return new;
end;
$$;

-- Limits for the photo diary and manual macro entry (the diary modes pass: the phone app gets both).
--
-- Row isolation was already right: a member reaches only their own photos, macro entries and diary (checked by
-- supabase/tests/security-audit/diary-modes-check.cjs). What the web enforced only in its own forms, and the database did not:
--
-- 1. The food-photos bucket accepted any file of any size and type. It now takes images only (the same list as the other photo
--    buckets) up to 10 MB; the app shrinks photos to 1600 px first, so a real photo is a few hundred KB.
-- 2. food_photo_entries: a row could point at ANOTHER member's file (storage_path) and carry any text or estimate. Now the file must
--    be in the owning member's own folder (the first part of the path is their id), the description is up to 500 characters, the
--    estimates are 0 to 10,000 g (calories 100,000), and a day holds at most 40 photos.
-- 3. manual_macro_entries: calories, protein, carbs and fat had no range (negative or absurd figures flowed into the day's totals).
--    Now 0 to 10,000 g (calories 100,000), and a day holds at most 100 entries.
-- 4. A manual macro entry or a food diary entry could be filed under ANOTHER member's meal section (the foreign key only checks the
--    section exists). Now the section must belong to the member whose day it is.
--
-- The range checks are NOT VALID: they apply to every new and changed row and leave rows already stored alone. The triggers fire
-- only when the checked columns change, so an unrelated update to an old row (the coach's re-estimate, say) is never blocked by it.
-- Nothing here changes who may read or write what: RLS stays exactly as it was.

-- ---- 1. the photo bucket ----

update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
where id = 'food-photos';

-- ---- 2. photo diary rows ----

alter table public.food_photo_entries drop constraint if exists food_photo_entries_description_length;
alter table public.food_photo_entries drop constraint if exists food_photo_entries_estimates_range;
alter table public.food_photo_entries
  add constraint food_photo_entries_description_length check (description is null or char_length(description) <= 500) not valid,
  add constraint food_photo_entries_estimates_range check (
    (estimated_calories is null or (estimated_calories >= 0 and estimated_calories <= 100000))
    and (estimated_protein is null or (estimated_protein >= 0 and estimated_protein <= 10000))
    and (estimated_carbs is null or (estimated_carbs >= 0 and estimated_carbs <= 10000))
    and (estimated_fat is null or (estimated_fat >= 0 and estimated_fat <= 10000))
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

  -- The file must be in the member's own folder, as the storage policies already require for uploading it.
  if split_part(new.storage_path, '/', 1) is distinct from v_owner::text then
    raise exception 'A meal photo must be stored in the member''s own folder';
  end if;

  if tg_op = 'INSERT' and (select count(*) from food_photo_entries where daily_log_id = new.daily_log_id) >= 40 then
    raise exception 'That day already has the most photos allowed (40)';
  end if;

  return new;
end;
$$;

drop trigger if exists food_photo_entry_rules on public.food_photo_entries;
create trigger food_photo_entry_rules
  before insert or update of storage_path, daily_log_id on public.food_photo_entries
  for each row execute function public.food_photo_entry_rules();

-- ---- 3. manual macro entries ----

alter table public.manual_macro_entries drop constraint if exists manual_macro_entries_range;
alter table public.manual_macro_entries
  add constraint manual_macro_entries_range check (
    (calories is null or (calories >= 0 and calories <= 100000))
    and (protein is null or (protein >= 0 and protein <= 10000))
    and (carbs is null or (carbs >= 0 and carbs <= 10000))
    and (fat is null or (fat >= 0 and fat <= 10000))
  ) not valid;

create or replace function public.manual_macro_entry_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from manual_macro_entries where daily_log_id = new.daily_log_id) >= 100 then
    raise exception 'That day already has the most macro entries allowed (100)';
  end if;
  return new;
end;
$$;

drop trigger if exists manual_macro_entry_cap on public.manual_macro_entries;
create trigger manual_macro_entry_cap
  before insert on public.manual_macro_entries
  for each row execute function public.manual_macro_entry_cap();

-- ---- 4. a diary or macro entry only goes under the member's own meal section ----

create or replace function public.diary_entry_section_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_log_owner uuid;
  v_section_owner uuid;
begin
  if new.meal_section_id is null then
    return new; -- "Other": not filed under a section
  end if;

  select client_id into v_log_owner from daily_logs where id = new.daily_log_id;
  select client_id into v_section_owner from meal_sections where id = new.meal_section_id;
  if v_section_owner is null or v_log_owner is null or v_section_owner <> v_log_owner then
    raise exception 'That meal section does not belong to this member';
  end if;
  return new;
end;
$$;

drop trigger if exists diary_entry_section_rules on public.manual_macro_entries;
create trigger diary_entry_section_rules
  before insert or update of meal_section_id, daily_log_id on public.manual_macro_entries
  for each row execute function public.diary_entry_section_rules();

drop trigger if exists diary_entry_section_rules on public.food_diary_entries;
create trigger diary_entry_section_rules
  before insert or update of meal_section_id, daily_log_id on public.food_diary_entries
  for each row execute function public.diary_entry_section_rules();

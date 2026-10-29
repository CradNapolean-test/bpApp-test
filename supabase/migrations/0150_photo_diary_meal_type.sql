-- Photo diary: say which meal it is (Breakfast, Lunch, Snacks, ...).
--
-- A photo or described meal can now be filed under one of the member's own meal sections, the same sections the food diary and
-- manual macros use. It is optional, so every existing entry stays valid (no meal type), and a section that is deleted later just
-- leaves its meals without one. The section must be the member's own, enforced the same way as for the other diary tables.

alter table public.food_photo_entries
  add column if not exists meal_section_id uuid references public.meal_sections(id) on delete set null;

create index if not exists idx_food_photo_entries_meal_section_id on public.food_photo_entries (meal_section_id);

drop trigger if exists diary_entry_section_rules on public.food_photo_entries;
create trigger diary_entry_section_rules
  before insert or update of meal_section_id, daily_log_id on public.food_photo_entries
  for each row execute function public.diary_entry_section_rules();

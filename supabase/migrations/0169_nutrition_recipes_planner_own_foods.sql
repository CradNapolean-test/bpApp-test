-- Nutrition decisions of 11 Nov 2026 (decision batch 7). Each change has its own before/after below:
--   1. D23c (NU17): a recipe logs as one diary line that opens to its ingredients.
--   2. NU12: the Meal Planner uses the member's own diary sections, not six fixed meals.
--
-- Apply this BEFORE the web app (and phone app) of this batch is deployed: the new screens write the new columns, and a write naming a
-- column that does not exist yet fails.
--
-- 1. food_diary_entries gets three columns, all empty on every existing row (existing entries stay exactly as they are, one line each):
--      recipe_log_id   the same id on every row of one logging of a recipe (a new id each time it is logged or copied to another day)
--      recipe_name     the recipe's name when it was logged (renaming or deleting the recipe later does not change the diary)
--      recipe_servings how many of the recipe's servings were logged
--    The ingredients are still saved as ordinary diary rows, so the day's totals, the weekly log and the coach's numbers add up exactly as
--    before; only how the diary shows them changes (lib/utils/diaryLines.ts). A check keeps the three together. RLS is unchanged (the
--    rows are the same rows, under the same rules).
--
-- 2. meal_plan_entries gets meal_section_id (one of the member's diary sections; emptied, not deleted, if that section is deleted) and
--    its old fixed meal (section) may now be empty: new items are planned in a section, not a fixed meal. Existing items are moved into
--    the member's sections by the rule in lib/utils/planSections.ts: a section with the old meal's name ("Mid-Morning Snack"), else the
--    one it used to be copied into ("Breakfast", "Lunch", "Dinner", "Snacks"), else the one at the same point in the day (a member whose
--    only section is "meal 1" gets everything in "meal 1", not "Other"). Their old meal stays on the row. Members with no sections yet
--    are left as they are; the screens apply the same rule once they have sections. RLS is unchanged (same table, same rules).
--
-- PRE-FLIGHT (read-only):
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and ((table_name = 'food_diary_entries' and column_name like 'recipe%')
--      or (table_name = 'meal_plan_entries' and column_name = 'meal_section_id'));
-- Expected before: no rows.
--   select count(*) as planned_items, count(distinct client_id) as members,
--          count(*) filter (where exists (select 1 from public.meal_sections ms where ms.client_id = e.client_id)) as with_sections
--   from public.meal_plan_entries e;
-- Note the numbers: with_sections is how many items 2. moves into a section.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: food_diary_entries recipe_log_id, recipe_name, recipe_servings; meal_plan_entries meal_section_id.
--   select count(*) filter (where recipe_log_id is not null) as recipe_rows, count(*) as all_rows from public.food_diary_entries;
-- Expected right after applying: recipe_rows 0 (nothing existing is changed).
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'food_diary_entries_recipe_line';
-- Expected: one row (the check in 1.).
--   select e.section, ms.label, count(*) from public.meal_plan_entries e
--   left join public.meal_sections ms on ms.id = e.meal_section_id group by 1, 2 order by 1, 2;
-- Expected: every item of a member with sections has a label (the PRE-FLIGHT's with_sections); "Other" (no label) only for members
-- with no sections.
-- Then, as a member: log a recipe from Add food > Recipes. The diary shows one line with the recipe's name that opens to its ingredients,
-- and the day's calories are the same as logging the ingredients one by one. Open the Meal Planner: it shows the diary's meals; "Add all
-- to my diary" puts each item in the same meal of today's diary.
--
-- REVERSE: 1. alter table public.food_diary_entries drop constraint food_diary_entries_recipe_line; drop index
--   idx_food_diary_entries_recipe_log_id; then drop the three columns (the rows stay, as separate lines).
-- 2. Items planned since have no old meal: delete them or give them one first (update public.meal_plan_entries set section = 'lunch'
--   where section is null), then: alter table public.meal_plan_entries alter column section set not null; drop index
--   idx_meal_plan_entries_meal_section_id; alter table public.meal_plan_entries drop column meal_section_id.
--
-- Safe to run again. No temporary tables.

-- =====================================================================================================================================
-- 1. D23c: a recipe logs as one diary line
-- =====================================================================================================================================
alter table public.food_diary_entries add column if not exists recipe_log_id uuid;
alter table public.food_diary_entries add column if not exists recipe_name text;
alter table public.food_diary_entries add column if not exists recipe_servings numeric;

alter table public.food_diary_entries drop constraint if exists food_diary_entries_recipe_line;
alter table public.food_diary_entries
  add constraint food_diary_entries_recipe_line check (
    (recipe_log_id is null and recipe_name is null and recipe_servings is null)
    or (
      recipe_log_id is not null
      and food_id is not null
      and char_length(btrim(recipe_name)) between 1 and 100
      and (recipe_servings is null or (recipe_servings > 0 and recipe_servings <= 100))
    )
  );

create index if not exists idx_food_diary_entries_recipe_log_id
  on public.food_diary_entries (recipe_log_id) where recipe_log_id is not null;

-- =====================================================================================================================================
-- 2. NU12: the Meal Planner uses the member's own diary sections
-- =====================================================================================================================================
alter table public.meal_plan_entries
  add column if not exists meal_section_id uuid references public.meal_sections(id) on delete set null;
alter table public.meal_plan_entries alter column section drop not null;
create index if not exists idx_meal_plan_entries_meal_section_id on public.meal_plan_entries (meal_section_id);

-- Existing plans: each item into the member's own section, by the rule in lib/utils/planSections.ts (legacySlotSectionId): a section with
-- the old meal's own name, else the section the meal used to be copied into, else the section at the same point in the day. Only items
-- with no section yet, of members who have sections; the old meal (section) is kept on every row.
update public.meal_plan_entries e
set meal_section_id = coalesce(
  (select ms.id from public.meal_sections ms
   where ms.client_id = e.client_id and lower(btrim(ms.label)) = slot.label
   order by ms.sort_order, ms.created_at nulls first, ms.id limit 1),
  (select ms.id from public.meal_sections ms
   where ms.client_id = e.client_id and lower(btrim(ms.label)) = slot.diary_label
   order by ms.sort_order, ms.created_at nulls first, ms.id limit 1),
  (select s.id from (
     select ms.id,
            row_number() over (order by ms.sort_order, ms.created_at nulls first, ms.id) - 1 as pos,
            count(*) over () as n
     from public.meal_sections ms
     where ms.client_id = e.client_id
   ) s
   where s.pos = floor(slot.idx * s.n / 6.0)
   limit 1)
)
from (values
  ('breakfast', 0, 'breakfast', 'breakfast'),
  ('mid_morning_snack', 1, 'mid-morning snack', 'snacks'),
  ('lunch', 2, 'lunch', 'lunch'),
  ('afternoon_snack', 3, 'afternoon snack', 'snacks'),
  ('dinner', 4, 'dinner', 'dinner'),
  ('evening_snack', 5, 'evening snack', 'snacks')
) as slot(key, idx, label, diary_label)
where slot.key = e.section
  and e.meal_section_id is null
  and exists (select 1 from public.meal_sections ms where ms.client_id = e.client_id);

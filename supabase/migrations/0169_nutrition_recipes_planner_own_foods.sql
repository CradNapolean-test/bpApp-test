-- Nutrition decisions of 11 Nov 2026 (decision batch 7). Each change has its own before/after below:
--   1. D23c (NU17): a recipe logs as one diary line that opens to its ingredients.
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
-- PRE-FLIGHT (read-only):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'food_diary_entries' and column_name like 'recipe%';
-- Expected before: no rows.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT query again)
-- Expected after: recipe_log_id, recipe_name, recipe_servings.
--   select count(*) filter (where recipe_log_id is not null) as recipe_rows, count(*) as all_rows from public.food_diary_entries;
-- Expected right after applying: recipe_rows 0 (nothing existing is changed).
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'food_diary_entries_recipe_line';
-- Expected: one row (the check below).
-- Then, as a member: log a recipe from Add food > Recipes. The diary shows one line with the recipe's name that opens to its ingredients,
-- and the day's calories are the same as logging the ingredients one by one.
--
-- REVERSE: alter table public.food_diary_entries drop constraint food_diary_entries_recipe_line; drop index
--   idx_food_diary_entries_recipe_log_id; then drop the three columns (the rows stay, as separate lines).
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

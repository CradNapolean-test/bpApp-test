-- Quick Add: log calories/macros against food_diary_entries with no matching food-database
-- item (a restaurant meal, an estimate) -- food_id was already nullable, but nothing wrote a
-- null-food row until now. Inline columns rather than a separate table, same shape as
-- manual_macro_entries but scoped to this table so existing consumers (getFoodDiaryEntries,
-- entryMacros, syncFoodDiaryToLog) only need a null-check, not a second query/join.
alter table food_diary_entries
  add column quick_add_name text,
  add column quick_add_calories numeric,
  add column quick_add_protein numeric,
  add column quick_add_carbs numeric,
  add column quick_add_fat numeric;

-- Every existing row already has food_id set, so this passes immediately for current data --
-- guards against a future row with neither a resolved food nor quick-add fields, which
-- entryMacros/EntryRow have no sensible way to render.
alter table food_diary_entries
  add constraint food_diary_entries_food_or_quick_add
  check (food_id is not null or quick_add_name is not null);

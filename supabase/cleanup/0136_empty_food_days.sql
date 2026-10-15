-- Clean-up for fix brief 06 (M2, R12). NOT run by the brief; read it, then run it yourself, one step at a time, on the live database
-- after taking a backup.
--
-- M2: before this fix, deleting the last food of a day left that day's log at protein 0, carbs 0, fat 0. A 0 counts as "logged", so the
-- Weekly Log said "2 days of food logged" and halved the week's average. The app now writes nulls for a day with no entries; this makes
-- the old rows match.

-- STEP 1 (read-only): how many days are affected, and for whom.
select count(*) as empty_food_days, count(distinct l.client_id) as members
from public.daily_logs l
where l.protein = 0 and l.carbs = 0 and l.fat = 0
  and coalesce(l.fibre, 0) = 0
  and l.calories is null
  and not exists (select 1 from public.food_diary_entries e where e.daily_log_id = l.id)
  and not exists (select 1 from public.manual_macro_entries e where e.daily_log_id = l.id)
  and not exists (select 1 from public.food_photo_entries e where e.daily_log_id = l.id);

-- STEP 2 (read-only): the list, newest first. Anything here with nothing else logged on the day (no weight, steps, sleep, notes...) is a
-- row that exists only because someone opened the Food screen on that day.
select l.client_id, l.log_date, l.bodyweight, l.steps, l.sleep, l.water, l.notes
from public.daily_logs l
where l.protein = 0 and l.carbs = 0 and l.fat = 0
  and coalesce(l.fibre, 0) = 0
  and l.calories is null
  and not exists (select 1 from public.food_diary_entries e where e.daily_log_id = l.id)
  and not exists (select 1 from public.manual_macro_entries e where e.daily_log_id = l.id)
  and not exists (select 1 from public.food_photo_entries e where e.daily_log_id = l.id)
order by l.log_date desc
limit 200;

-- STEP 3 (changes data, commented out): turn those zeros into "nothing logged". Check the count it reports against step 1 before
-- committing.
-- begin;
--   update public.daily_logs l
--   set protein = null, carbs = null, fat = null, fibre = null
--   where l.protein = 0 and l.carbs = 0 and l.fat = 0
--     and coalesce(l.fibre, 0) = 0
--     and l.calories is null
--     and not exists (select 1 from public.food_diary_entries e where e.daily_log_id = l.id)
--     and not exists (select 1 from public.manual_macro_entries e where e.daily_log_id = l.id)
--     and not exists (select 1 from public.food_photo_entries e where e.daily_log_id = l.id);
-- commit;   -- or: rollback;

-- R12 (read-only): sleep recorded as exactly 0 hours. Before this fix, tabbing onto the Sleep slider saved 0. A real "0 hours" is
-- implausible, so these are almost all that bug. They are listed for you to judge; nothing in the steps above changes them.
select l.client_id, l.log_date, l.sleep, l.steps, l.bodyweight, l.notes
from public.daily_logs l
where l.sleep = 0
order by l.log_date desc
limit 200;
-- To clear one (for example the test member's row noted in docs/AUDIT_ROUND_2.md):
--   update public.daily_logs set sleep = null where id = '<the row id>';

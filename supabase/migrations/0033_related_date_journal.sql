-- Lets a coach's journal note reference a specific day's nutrition when left as feedback
-- from the food-diary view (Phase 3 of the nutrition-sync/coach-visibility work), without a
-- new table -- a plain "note" still works exactly as before when this is left null.
alter table client_journal_entries add column related_date date;

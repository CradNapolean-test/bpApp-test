-- Fixes a real race condition in lib/data/mealSections.ts's getOrCreateMealSections: it does
-- a plain check-then-insert with no locking (unlike book_class, which uses an advisory lock +
-- unique index for the exact same class of problem). Two concurrent calls for a client with no
-- sections yet both pass the "existing.length === 0" check before either commits, and both
-- insert the same 4 defaults -- confirmed in production data (a real client already has 8 rows
-- where 4 were expected, two of each default label) before this fix.

-- Step 1: de-duplicate existing data before the constraint can be added. For each
-- (client_id, label) group with more than one row, keep the earliest-created row and remap any
-- food_diary_entries pointing at a row about to be deleted onto the keeper -- defensive: as of
-- writing, zero food_diary_entries reference the known duplicates, but this makes the migration
-- safe to run regardless, and safe to re-run (idempotent) if it's ever applied twice.
with ranked as (
  select
    id,
    client_id,
    label,
    row_number() over (partition by client_id, label order by created_at asc, id asc) as rn
  from meal_sections
),
keepers as (
  select client_id, label, id as keeper_id
  from ranked
  where rn = 1
),
losers as (
  select r.id as loser_id, k.keeper_id
  from ranked r
  join keepers k on k.client_id = r.client_id and k.label = r.label
  where r.rn > 1
)
update food_diary_entries fde
set meal_section_id = losers.keeper_id
from losers
where fde.meal_section_id = losers.loser_id;

delete from meal_sections ms
using (
  select
    id,
    row_number() over (partition by client_id, label order by created_at asc, id asc) as rn
  from meal_sections
) ranked
where ms.id = ranked.id and ranked.rn > 1;

-- Step 2: prevent it from happening again. Unique per (client_id, label) rather than a
-- broader constraint: a client's sections are a personal, coach-or-client-editable list (see
-- 0022's own comment), and preventing two identically-labelled sections for the same client is
-- a reasonable floor without blocking legitimate distinctly-named custom sections.
alter table meal_sections
  add constraint meal_sections_client_label_unique unique (client_id, label);

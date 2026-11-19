-- Nutrition decisions of 11 Nov 2026 (decision batch 7). Each change has its own before/after below:
--   1. D23c (NU17): a recipe logs as one diary line that opens to its ingredients.
--   2. NU12: the Meal Planner uses the member's own diary sections, not six fixed meals.
--   3. NU18: members save their own foods (name, serving and macros), private to them and their gym's coaches, found in search.
-- (D23a "one result per brand" and D23b "tap a food, then choose the amount" are screen changes only: nothing here.)
--
-- Apply this BEFORE the web app (and phone app) of this batch is deployed: the new screens write the new columns, and a write naming a
-- column that does not exist yet fails.
--
-- Guard: before changing anything, the migration checks that search_foods and set_food_servings are the ones from 0155 and 0149 (or
-- already this file's), comparing their bodies with spaces and line breaks squeezed out, and that foods has no read rule other than
-- "authenticated users read foods". If not, nothing is changed and it stops with "... is not the one from migration ..." or "foods has
-- another read rule ...". Then send the PRE-FLIGHT's results to the developer instead.
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
-- 3. A member's own food is a row in foods (so it logs, plans and goes into recipes like any other) with source 'own' and owner_id the
--    member. Changes:
--    - foods.owner_id (new; deleting the member deletes their own foods) and source 'own' allowed; a check ties the two together.
--    - Read rule "authenticated users read foods": was every signed-in user reads every food; now the same for every shared food (no
--      owner), and an own food only by its owner, their own coach (owns_client) and the other coaches at their gym (is_same_gym_as_client,
--      read-only: the reach 0053 gives those coaches to the member's diary, recipes and plan, so a food logged there shows with its name
--      and figures, and the day adds up, for them too; the privacy policy lists saved foods among what they can read). No other member,
--      no coach at another gym and not the gym owner (0131) can read it, even by its id.
--    - New insert rule "members save their own foods": only as their own, no barcode, brand or everyday place, a name of 1-100
--      characters, and figures in range (per gram, or per serving when saved without a weight). The scanned-food insert rule is unchanged.
--    - Nobody can change an own food's figures afterwards (no update rule for them), so what was logged stays as it was. The member
--      removes one with the new remove_own_food(id): it is hidden from their search and lists; anything already logged keeps it.
--    - search_foods (0155): same results in the same order for shared foods, plus the caller's own foods, ahead of other plain foods. A
--      coach's search does not list their members' own foods. Still runs as the caller.
--    - set_food_servings (0149): a coach can set servings on a shared food, or on an own food of one of their own members, not anyone
--      else's. The member rules are unchanged (own foods are not among them).
--
-- PRE-FLIGHT (read-only):
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and ((table_name = 'food_diary_entries' and column_name like 'recipe%')
--      or (table_name = 'meal_plan_entries' and column_name = 'meal_section_id'));
-- Expected before: no rows.
--   select count(*) as planned_items, count(distinct client_id) as members,
--          count(*) filter (where exists (select 1 from public.meal_sections ms where ms.client_id = e.client_id)) as with_sections
--   from public.meal_plan_entries e;
-- Note the numbers: with_sections is how many items 2. moves into a section. (Read from the app on 19 Nov 2026: no planned items yet.)
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('search_foods', 'set_food_servings') order by 1;
-- Expected before: search_foods 399bab487195f9b0a3647e1ee5b056e4 false (0155's body), set_food_servings ef41941f04960d90ce7fdf3a1aace31a
-- true (0149's body).
--   select policyname, cmd, roles, qual from pg_policies where schemaname = 'public' and tablename = 'foods' order by 1;
-- Expected before: "authenticated users cache scanned foods" INSERT, "authenticated users read foods" SELECT (qual true), "coaches
-- correct scanned foods" UPDATE, "coaches delete scanned foods" DELETE.
--   select source, count(*) from public.foods group by 1 order by 1;
-- Expected before: no 'own' row.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: food_diary_entries recipe_log_id, recipe_name, recipe_servings; meal_plan_entries meal_section_id.
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'foods' and column_name = 'owner_id';
-- Expected after: one row.
--   (the PRE-FLIGHT's pg_proc query again)
-- Expected after: search_foods adc01f202d961b1744964e8e19305a70 false, set_food_servings fb26ff97e115758f4a6e0eb1132bd20b true (this
-- file's bodies).
--   (the PRE-FLIGHT's pg_policies query again)
-- Expected after: the same four, "authenticated users read foods" now with qual ((owner_id IS NULL) OR owns_client(owner_id) OR
-- is_same_gym_as_client(owner_id)), and "members save their own foods" INSERT.
--   select has_function_privilege('authenticated', 'public.remove_own_food(uuid)', 'execute') as members,
--          has_function_privilege('anon', 'public.remove_own_food(uuid)', 'execute') as anyone;
-- Expected: true, false.
--   node supabase/tests/food-search-check.cjs
-- Expected: passes, every search in 0.1-0.9 s as before (own foods are left out for the service role it runs as).
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
-- Write checks for 3. (test accounts): member A saves "Cafe wrap" (Add food > My foods), finds it by searching "wrap" and logs it; member
-- B (another coach) searching "wrap" does not get it and cannot read it by its id (select from foods where id = ...: no row); A's coach
-- sees it in A's diary and does not get it in their own search; another coach at A's gym opening A's page sees the logged line with its
-- name and calories (not "Unknown food 0 kcal") and does not get it in their own search; a coach at another gym cannot read it by its
-- id; A inserting a food with source 'own' and owner_id B, or with source 'seed', is refused; A updating its protein (update foods set
-- protein = ... where id = ...) changes nothing; remove_own_food(id) as B returns false, as A returns true and the food leaves A's
-- search while A's diary still shows the logged line.
--
-- REVERSE: 1. alter table public.food_diary_entries drop constraint food_diary_entries_recipe_line; drop index
--   idx_food_diary_entries_recipe_log_id; then drop the three columns (the rows stay, as separate lines).
-- 2. Items planned since have no old meal: delete them or give them one first (update public.meal_plan_entries set section = 'lunch'
--   where section is null), then: alter table public.meal_plan_entries alter column section set not null; drop index
--   idx_meal_plan_entries_meal_section_id; alter table public.meal_plan_entries drop column meal_section_id.
-- 3. Run search_foods' definition from migration 0155 and set_food_servings' from 0149 again (each from its "create or replace function"
--   line to its closing delimiter, with its grant lines). drop function public.remove_own_food(uuid); drop the insert rule "members save
--   their own foods" on foods. Keep the new read rule and owner_id: shared foods read exactly as before with it, and putting the old
--   "using (true)" back would show every member's own foods to everyone.
--
-- Safe to run again. No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
  v_other_reads text;
begin
  for v_check in
    select * from (values
      ('search_foods', '0155', array['399bab487195f9b0a3647e1ee5b056e4', 'adc01f202d961b1744964e8e19305a70']),
      ('set_food_servings', '0149', array['ef41941f04960d90ce7fdf3a1aace31a', 'fb26ff97e115758f4a6e0eb1132bd20b'])
    ) as t(name, migration, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is null or not (v_md5 = any (v_check.accepted)) then
      raise exception '% is not the one from migration % (body md5 %), so nothing was changed.', v_check.name, v_check.migration, coalesce(v_md5, 'missing');
    end if;
  end loop;

  -- An own food must be readable by its owner and their gym's coaches only: no other read rule on foods may let anyone else see it.
  select string_agg(policyname, ', ') into v_other_reads
  from pg_policies
  where schemaname = 'public' and tablename = 'foods' and cmd in ('SELECT', 'ALL') and policyname <> 'authenticated users read foods';
  if v_other_reads is not null then
    raise exception 'foods has another read rule (%), so nothing was changed.', v_other_reads;
  end if;
end
$guard$;

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

-- =====================================================================================================================================
-- 3. NU18: members save their own foods, private to them and their own coach
-- =====================================================================================================================================
alter table public.foods add column if not exists owner_id uuid references public.profiles(id) on delete cascade;

alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check check (source in ('seed', 'scan', 'off', 'cofid', 'own'));

-- A member's own food has its owner, and only an own food has one.
alter table public.foods drop constraint if exists foods_own_food_owner;
alter table public.foods add constraint foods_own_food_owner check ((source = 'own') = (owner_id is not null));

create index if not exists foods_owner_id_idx on public.foods (owner_id) where owner_id is not null;

-- Reading: the shared foods as before (every signed-in user), and an own food only by its owner, their own coach and, read-only, the
-- other coaches at their gym, who can already read the diary, recipes and plan it is in (0053). is_same_gym_as_client is false for a
-- member (they have no gym of their own as a coach) and for the gym owner (0131).
drop policy if exists "authenticated users read foods" on public.foods;
create policy "authenticated users read foods"
  on public.foods for select
  to authenticated
  using (owner_id is null or public.owns_client(owner_id) or public.is_same_gym_as_client(owner_id));

-- Saving one: only as their own, with no barcode, brand or everyday place, and figures in range (per gram as every other food, or per
-- serving for a food saved without a weight). Nobody can edit an own food's figures afterwards, so what was logged stays what it was.
drop policy if exists "members save their own foods" on public.foods;
create policy "members save their own foods"
  on public.foods for insert
  to authenticated
  with check (
    source = 'own'
    and owner_id = auth.uid()
    and barcode is null
    and brand is null
    and everyday_rank is null
    and coalesce(hidden, false) = false
    and char_length(btrim(name)) between 1 and 100
    and (fibre is null or fibre >= 0)
    and (
      (portion = '1 gram' and protein between 0 and 1 and carbs between 0 and 1 and fat between 0 and 1 and protein + carbs + fat <= 1.05)
      or (
        portion <> '1 gram' and char_length(btrim(portion)) between 1 and 40
        and protein between 0 and 1000 and carbs between 0 and 1000 and fat between 0 and 1000
      )
    )
  );

-- Removing one: it is hidden (it may already be in the diary, a recipe or the plan, which keep showing it), by its owner only.
create or replace function public.remove_own_food(p_food_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  changed int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.foods set hidden = true
  where id = p_food_id and source = 'own' and owner_id = auth.uid() and not hidden;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$fn$;

revoke execute on function public.remove_own_food(uuid) from public, anon;
grant execute on function public.remove_own_food(uuid) to authenticated;

-- The search (0155) with the member's own foods in it: the shared foods as before, plus the caller's own (a coach does not get their
-- members' own foods in their search, though the read rule lets them see them in a member's diary), own foods first among the plain
-- foods. It still runs as the caller, so the read rule above applies too. Everything else, the order included, is as in 0155.
create or replace function public.search_foods(p_query text, p_limit int default 25)
returns setof public.foods
language sql
stable
as $fn$
  select f.*
  from (
    select
      auth.uid() as me,
      lower(trim(p_query)) as typed,
      w.words,
      array(select '%' || t.x || '%' from unnest(w.words) as t(x)) as likes,
      -- the unusual words (a dish, or an unusual variant of the food) that the search did not ask for, as one pattern;
      -- null when the search names every one of them
      (
        select '\m(' || string_agg(u.word, '|') || ')(e?s)?\M'
        from unnest(array[
          'pie', 'cake', 'tart', 'pudding', 'biscuit', 'sandwich', 'soup', 'sushi', 'pate', 'croute', 'split', 'stuffed',
          'coated', 'breaded', 'breadcrumb', 'batter', 'battered', 'flavoured',
          'duck', 'quail', 'goose', 'sheeps', 'goats', 'human', 'channel', 'evaporated', 'condensed', 'yolk', 'wild',
          'lard', 'dripping', 'weighed', 'summer', 'winter', 'pickled'
        ]) as u(word)
        where lower(p_query) !~ ('\m' || u.word)
      ) as odd,
      -- "Potatoes, ..." for "potato": the name starts with exactly what was typed (cleaned to letters, digits and spaces)
      '^' || regexp_replace(lower(trim(p_query)), '[^a-z0-9 ]', '', 'g') || '(e?s)?,' as starts
    from (
      select array(
        select regexp_replace(q.word, '[^a-z0-9]', '', 'g')
        from unnest(string_to_array(lower(trim(p_query)), ' ')) as q(word)
        where regexp_replace(q.word, '[^a-z0-9]', '', 'g') <> ''
      ) as words
    ) as w
  ) as p
  cross join public.foods f
  -- `m.head` (as 0154): which comma-separated part of the name the typed words reach; 99 when a word is not a whole word of it
  cross join lateral (
    select case when bool_or(x.part is null) then 99 else coalesce(max(x.part), 99) end as head
    from (
      select (
        select min(s.i)
        from unnest(string_to_array(lower(f.name), ',')) with ordinality as s(text, i)
        where s.text ~ ('\m' || w.word || '(e?s)?\M')
      ) as part
      from unnest(p.words) as w(word)
    ) as x
  ) as m
  where not f.hidden
    -- the shared foods, and the caller's own (NU18)
    and (f.owner_id is null or f.owner_id = p.me)
    -- every typed word is somewhere in the food's search text (as 0076/0154)
    and f.search_text like all (p.likes)
  order by
    -- the name is exactly what was typed
    (lower(f.name) = p.typed) desc,
    -- every word typed is a whole word of the name ("oats" finds "Porridge oats" before "goats")
    (m.head < 99) desc,
    -- a dish or unusual variant the search did not ask for goes after the plain foods
    coalesce(lower(f.name) ~ p.odd, false) asc,
    -- the member's own foods, UK generic foods, then scanned products, then the Open Food Facts import
    case
      when f.source = 'own' then -1
      when f.source = 'cofid' then 0
      when f.source = 'seed' and f.name !~ ',' then 0
      when f.source = 'scan' then 1
      when f.source = 'off' then 2
      else 3
    end,
    -- the words typed are what the food is, not something it mentions
    m.head,
    -- everyday foods first, in their listed order
    f.everyday_rank asc nulls last,
    (lower(f.name) like p.typed || '%') desc,
    (lower(f.name) ~ p.starts) desc,
    (lower(f.name) ~ ',\s*(raw|boiled|baked|roast|roasted|grilled|steamed|poached|whole|flesh only|average)\M') desc,
    (f.name ~* '(homemade|made up|takeaway|restaurant|retail)') asc,
    length(f.name),
    f.name
  limit p_limit
$fn$;

grant execute on function public.search_foods(text, int) to authenticated;

-- Setting a food's servings (0149): as before, except that a coach can only set them on a shared food or on an own food of one of their
-- own members (the function runs as its owner, so the read rule above does not apply inside it).
create or replace function public.set_food_servings(p_food_id uuid, p_options jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.valid_serving_options(p_options) then
    raise exception 'Those servings are not valid';
  end if;

  if public.my_gym_id() is not null then
    update public.foods set serving_options = p_options
    where id = p_food_id and (owner_id is null or public.owns_client(owner_id));
  elsif p_options is not null then
    update public.foods set serving_options = p_options
    where id = p_food_id and source in ('scan', 'off') and serving_options is null;
  else
    return false;
  end if;

  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke execute on function public.set_food_servings(uuid, jsonb) from public, anon;
grant execute on function public.set_food_servings(uuid, jsonb) to authenticated;

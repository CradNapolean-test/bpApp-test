-- Food search ordering, round four (replaces the function from 0076).
--
-- Live searches in November 2026 put the wrong food first, so a member could easily log the wrong thing:
--   "rice"  -> ten raw varieties (red, wild, Thai, pudding...) before any cooked white rice, which was not in the top 12
--   "egg"   -> duck, quail and yolk before an ordinary hen's egg (6th)
--   "mince" -> mince pies first; "milk" -> UHT and sheep's milk before semi-skimmed (9th); "banana" -> banana bread 3rd
-- Within a tier the shorter name won, and the unusual variants have the shortest names.
--
-- Three changes, all only to the ORDER of results (nothing is hidden, every food still matches the same searches):
--   1. A food whose name has a word the search did not ask for that makes it a dish or an unusual variant (pie, cake, pudding,
--      coated, duck, quail, sheep's, condensed, "weighed with bones"...) goes after the plain foods. Searching for "mince pie" or
--      "duck egg" still puts those first, because the word is then part of the search. ("Homemade" and "retail" say where a
--      food was made, not that it is a different food, so they keep 0076's milder, later rule.)
--   2. The words typed should be what the food IS, not something it mentions. The UK tables name foods "Head, detail, detail",
--      so a name where the words are in its first part comes before one where they only turn up later: "Chicken, skin" before
--      "Eggs, chicken, whole"; "Milk, whole" before "Eggs, scrambled, without milk"; "Beef, mince" before "Noodles, egg".
--   3. foods.everyday_rank: a short list of everyday foods from the UK government tables (and one from the original seed),
--      each with a place. Among equally good matches, these come first, in that order. A coach can change a food's place with
--      a plain update; null means "not on the list".
--      The order inside the list follows the usual weighing habit: meat, fish and eggs are weighed raw (pack weight), so raw
--      comes first; rice, pasta, potatoes and other starches are weighed cooked on the plate, so cooked comes first, with the
--      dry/raw row straight after it.
--
-- PREVIEW (read-only; after applying, each should show an everyday food first):
--   select name from public.search_foods('rice', 5);   -- Rice, white, long grain, boiled in unsalted water
--   select name from public.search_foods('egg', 5);    -- Eggs, chicken, whole, raw
--   select name from public.search_foods('mince', 5);  -- Beef, mince, raw, extra lean
--   select name from public.search_foods('milk', 5);   -- Milk, semi-skimmed, pasteurised, average
-- Safe to run again.

alter table public.foods add column if not exists everyday_rank smallint;

comment on column public.foods.everyday_rank is
  'Place in the everyday-foods list (lower first). Among foods matching every search word these come first. Null = not on the list.';

-- ---- 1. the everyday list ----
update public.foods set everyday_rank = null where everyday_rank is not null;

update public.foods f
set everyday_rank = v.rank
from (values
  -- grains and starches: cooked first, then dry
  (100, 'cofid', 'Rice, white, long grain, boiled in unsalted water'),
  (101, 'cofid', 'Rice, white, long grain, raw'),
  (102, 'cofid', 'Rice, white, basmati, boiled in unsalted water'),
  (103, 'cofid', 'Rice, white, basmati, raw'),
  (104, 'cofid', 'Rice, brown, wholegrain, boiled in unsalted water'),
  (105, 'cofid', 'Rice, brown, wholegrain, raw'),
  (110, 'cofid', 'Pasta, white, dried, boiled in unsalted water'),
  (111, 'cofid', 'Pasta, white, dried, raw'),
  (112, 'cofid', 'Pasta, white, spaghetti, dried, boiled in unsalted water'),
  (120, 'cofid', 'Porridge oats, unfortified'),
  (130, 'cofid', 'Potatoes, old, boiled in unsalted water, flesh only'),
  (131, 'cofid', 'Potatoes, old, baked, flesh and skin'),
  (132, 'cofid', 'Potatoes, old, raw, flesh only'),
  (133, 'cofid', 'Potatoes, old, roasted in sunflower oil, flesh only'),
  (140, 'cofid', 'Sweet potato, baked'),
  (141, 'cofid', 'Sweet potato, raw, flesh only'),
  (150, 'cofid', 'Bread, white, sliced'),
  (151, 'cofid', 'Bread, wholemeal, average'),
  (152, 'cofid', 'Bread, brown, average'),
  (153, 'cofid', 'Bagels, plain'),
  (154, 'cofid', 'Tortilla, wheat, soft'),
  (160, 'cofid', 'Noodles, egg, medium, dried, boiled in unsalted water'),
  (161, 'cofid', 'Couscous, plain, cooked'),
  (162, 'cofid', 'Lentils, red, split, dried, boiled in unsalted water'),
  -- eggs: a whole hen's egg first, then the usual ways of cooking it, then egg whites
  (200, 'cofid', 'Eggs, chicken, whole, raw'),
  (201, 'cofid', 'Eggs, chicken, whole, boiled'),
  (202, 'cofid', 'Eggs, chicken, whole, scrambled, without milk'),
  (203, 'cofid', 'Eggs, chicken, whole, fried in sunflower oil'),
  (204, 'cofid', 'Eggs, chicken, whole, poached'),
  (205, 'cofid', 'Eggs, chicken, white, raw'),
  -- meat and fish: raw (pack weight) first, then cooked
  (300, 'cofid', 'Chicken, breast, grilled without skin, meat only'),
  (310, 'cofid', 'Beef, mince, raw, extra lean'),
  (311, 'cofid', 'Beef, mince, raw'),
  (312, 'cofid', 'Beef, mince, stewed'),
  (313, 'cofid', 'Turkey, mince, stewed'),
  (320, 'cofid', 'Turkey, breast, fillet, grilled, meat only'),
  (330, 'cofid', 'Beef, sirloin steak, raw, lean'),
  (331, 'cofid', 'Beef, rump steak, grilled, lean only'),
  (340, 'cofid', 'Bacon rashers, back, raw'),
  (341, 'cofid', 'Bacon rashers, back, grilled'),
  (350, 'cofid', 'Salmon, farmed, flesh only, raw'),
  (351, 'cofid', 'Salmon, farmed, flesh only, baked'),
  (360, 'cofid', 'Tuna, canned in brine, drained'),
  (370, 'cofid', 'Cod, flesh only, raw'),
  (371, 'cofid', 'Cod, flesh only, baked'),
  (380, 'cofid', 'Prawns, king, purchased cooked'),
  -- dairy
  (400, 'cofid', 'Milk, semi-skimmed, pasteurised, average'),
  (401, 'cofid', 'Milk, skimmed, pasteurised, average'),
  (402, 'cofid', 'Milk, whole, pasteurised, average'),
  (410, 'cofid', 'Yogurt, Greek style, plain'),
  (411, 'cofid', 'Yogurt, low fat, plain'),
  (420, 'cofid', 'Cheese, cottage, plain'),
  (421, 'cofid', 'Cheese, cottage, plain, reduced fat'),
  (430, 'cofid', 'Cheese, Cheddar, English'),
  (431, 'cofid', 'Cheese, Mozzarella, fresh'),
  (440, 'cofid', 'Butter, salted'),
  -- fruit (a whole medium banana from the seed first: it is logged as one banana, not grams)
  (500, 'seed', 'Medium Banana'),
  (501, 'cofid', 'Bananas, flesh only'),
  (510, 'cofid', 'Apples, eating, raw, flesh and skin'),
  (520, 'cofid', 'Oranges, flesh only'),
  (530, 'cofid', 'Blueberries'),
  (531, 'cofid', 'Strawberries, raw'),
  (532, 'cofid', 'Raspberries, raw'),
  (540, 'cofid', 'Grapes, average'),
  (550, 'cofid', 'Pineapple, flesh only, raw'),
  (560, 'cofid', 'Avocado, Hass, flesh only'),
  -- vegetables: raw first
  (600, 'cofid', 'Broccoli, green, raw'),
  (601, 'cofid', 'Broccoli, green, boiled in unsalted water'),
  (610, 'cofid', 'Spinach, baby, raw'),
  (620, 'cofid', 'Onions, raw'),
  (630, 'cofid', 'Tomatoes, standard, raw'),
  (631, 'cofid', 'Tomatoes, cherry, raw'),
  (632, 'cofid', 'Tomatoes, canned, whole contents'),
  (640, 'cofid', 'Carrots, old, raw'),
  (650, 'cofid', 'Peppers, capsicum, green, raw'),
  (660, 'cofid', 'Mushrooms, white, raw'),
  (670, 'cofid', 'Cucumber, raw, flesh and skin'),
  (680, 'cofid', 'Peas, frozen, boiled in unsalted water'),
  (690, 'cofid', 'Sweetcorn kernels, canned in water, drained'),
  (695, 'cofid', 'Baked beans, canned in tomato sauce'),
  -- fats, nuts, spreads
  (700, 'cofid', 'Oil, olive'),
  (701, 'cofid', 'Oil, vegetable, average'),
  (710, 'cofid', 'Peanut butter, smooth'),
  (720, 'cofid', 'Almonds, whole kernels'),
  (721, 'cofid', 'Walnuts, kernel only'),
  (730, 'cofid', 'Honey'),
  (740, 'cofid', 'Houmous'),
  (750, 'cofid', 'Mayonnaise, standard, retail')
) as v(rank, source, name)
where f.source = v.source
  and btrim(f.name) = v.name
  and not f.hidden;

-- ---- 2. the search ----
-- The where clause is unchanged from 0076.
-- `m.head` is which comma-separated part of the name the typed words reach: 1 when they are all in the first part
-- ("Eggs, chicken, whole" for "egg"), 2 when one is in the second ("Beef, mince" for "mince"), and so on; 99 when a word is not
-- a whole word of the name at all ("goats" for "oats"). Names without commas (shop products) are all one part.
create or replace function public.search_foods(p_query text, p_limit int default 25)
returns setof public.foods
language sql
stable
as $fn$
  select f.*
  from public.foods f
  cross join lateral (
    select case when bool_or(x.part is null) then 99 else coalesce(max(x.part), 99) end as head
    from (
      select (
        select min(s.i)
        from unnest(string_to_array(lower(f.name), ',')) with ordinality as s(text, i)
        where s.text ~ ('\m' || w.word || '(e?s)?\M')
      ) as part
      from (
        select regexp_replace(q.word, '[^a-z0-9]', '', 'g') as word
        from unnest(string_to_array(lower(trim(p_query)), ' ')) as q(word)
      ) as w
      where w.word <> ''
    ) as x
  ) as m
  where not f.hidden
    and not exists (
      select 1
      from unnest(string_to_array(lower(trim(p_query)), ' ')) as w(word)
      where regexp_replace(w.word, '[^a-z0-9]', '', 'g') <> ''
        and f.search_text not like '%' || regexp_replace(w.word, '[^a-z0-9]', '', 'g') || '%'
    )
  order by
    -- the name is exactly what was typed
    (lower(f.name) = lower(trim(p_query))) desc,
    -- every word typed is a whole word of the name ("oats" finds "Porridge oats" before "goats")
    (m.head < 99) desc,
    -- new: a dish or unusual variant the search did not ask for goes after the plain foods
    exists (
      select 1
      from unnest(array[
        'pie', 'cake', 'tart', 'pudding', 'biscuit', 'sandwich', 'soup', 'sushi', 'pate', 'croute', 'split', 'stuffed',
        'coated', 'breaded', 'breadcrumb', 'batter', 'battered', 'flavoured',
        'duck', 'quail', 'goose', 'sheeps', 'goats', 'human', 'channel', 'evaporated', 'condensed', 'yolk', 'wild',
        'lard', 'dripping', 'weighed', 'summer', 'winter', 'pickled'
      ]) as u(word)
      where lower(f.name) ~ ('\m' || u.word || '(e?s)?\M')
        and lower(p_query) !~ ('\m' || u.word)
    ) asc,
    -- UK generic foods, then scanned products, then the Open Food Facts import (as 0076)
    case
      when f.source = 'cofid' then 0
      when f.source = 'seed' and f.name !~ ',' then 0
      when f.source = 'scan' then 1
      when f.source = 'off' then 2
      else 3
    end,
    -- new: the words typed are what the food is, not something it mentions
    m.head,
    -- new: everyday foods first, in their listed order
    f.everyday_rank asc nulls last,
    (lower(f.name) like lower(trim(p_query)) || '%') desc,
    -- (the typed text is cleaned to letters, digits and spaces first: 0076 put it into the pattern as typed, so a search
    -- containing a bracket failed and the app fell back to its plain name search)
    (lower(f.name) ~ ('^' || regexp_replace(lower(trim(p_query)), '[^a-z0-9 ]', '', 'g') || '(e?s)?,')) desc,
    (lower(f.name) ~ ',\s*(raw|boiled|baked|roast|roasted|grilled|steamed|poached|whole|flesh only|average)\M') desc,
    (f.name ~* '(homemade|made up|takeaway|restaurant|retail)') asc,
    length(f.name),
    f.name
  limit p_limit
$fn$;

grant execute on function public.search_foods(text, int) to authenticated;


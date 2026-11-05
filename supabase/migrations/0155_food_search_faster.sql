-- Food search speed fix (replaces the function from 0154). Same results, in the same order: only how the order is worked out
-- changes.
--
-- After 0154 went live, every search took about 2.5 ms per matching food: "yogurt" (665 foods) 1.9 s, "cheese" (2,207) 5.5 s,
-- and "ch", "chi" and "chicken" (5,000 to 17,000 foods) hit the 8 s statement timeout, so the app fell back to its plain A-Z
-- name search on every letter typed.
--
-- The cause: Postgres keeps only the 32 most recent regular expressions compiled. 0154 tested each food against the 35 words of
-- its "unusual variant" list one pattern at a time (plus 35 more patterns against the typed text), about 40 different patterns
-- per food in turn, so every one was recompiled for every food. A read-only test on the live data showed the cliff: counting the
-- "chicken" foods while checking 32 patterns took 0.46 s, checking 34 took 3.3 s.
--
-- Now everything that depends only on the typed text is worked out once per search, in `p`:
--   * the cleaned words, and the LIKE patterns the foods must contain (the same filter as 0076/0154)
--   * the unusual words the search did NOT ask for, joined into one pattern: \m(pie|cake|...)(e?s)?\M
-- so each food meets about six patterns, which stay compiled.
--
-- CHECK after applying (read-only; prints each search's time and fails if one is slow or out of order):
--   node supabase/tests/food-search-check.cjs
-- Safe to run again. To go back, re-run the search_foods part of 0154.

create or replace function public.search_foods(p_query text, p_limit int default 25)
returns setof public.foods
language sql
stable
as $fn$
  select f.*
  from (
    select
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
    -- every typed word is somewhere in the food's search text (as 0076/0154)
    and f.search_text like all (p.likes)
  order by
    -- the name is exactly what was typed
    (lower(f.name) = p.typed) desc,
    -- every word typed is a whole word of the name ("oats" finds "Porridge oats" before "goats")
    (m.head < 99) desc,
    -- a dish or unusual variant the search did not ask for goes after the plain foods
    coalesce(lower(f.name) ~ p.odd, false) asc,
    -- UK generic foods, then scanned products, then the Open Food Facts import
    case
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

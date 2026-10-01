-- Better ordering for food search results (replaces the function from 0074):
--   1. exact name matches
--   2. UK generic foods, and the original simple seed names ("Chicken Breast") -- then scanned
--      products, then supermarket products, and the New Zealand seed entries last
--   3. names that start with the search ("Oats...") ahead of ones that merely contain it
--   4. ingredient-style names ("Egg, whole, boiled") ahead of dishes, and homemade/recipe items last
--   5. shorter names first

create or replace function public.search_foods(p_query text, p_limit int default 25)
returns setof public.foods
language sql
stable
as $fn$
  select f.*
  from public.foods f
  where not f.hidden
    and not exists (
      select 1
      from unnest(string_to_array(lower(trim(p_query)), ' ')) as w(word)
      where regexp_replace(w.word, '[^a-z0-9]', '', 'g') <> ''
        and f.search_text not like '%' || regexp_replace(w.word, '[^a-z0-9]', '', 'g') || '%'
    )
  order by
    (lower(f.name) = lower(trim(p_query))) desc,
    case
      when f.source = 'cofid' then 0
      when f.source = 'seed' and f.name !~ ',' then 0
      when f.source = 'scan' then 1
      when f.source = 'off' then 2
      else 3
    end,
    (lower(f.name) like lower(trim(p_query)) || '%') desc,
    (lower(f.name) ~ ('^' || lower(trim(p_query)) || 's?,')) desc,
    (f.name ~* '(homemade|made up|takeaway|restaurant|retail)') asc,
    length(f.name),
    f.name
  limit p_limit
$fn$;

grant execute on function public.search_foods(text, int) to authenticated;

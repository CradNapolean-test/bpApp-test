-- Food search ordering, round three (replaces the function from 0075):
--   * whole-word matches first, so "oats" finds "Porridge oats" before "goats" or "groats"
--   * plural-aware ingredient style: "Potatoes, boiled" counts as a plain ingredient for "potato"
--   * plain preparations (raw, boiled, baked, grilled, whole...) ahead of composite dishes

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
    not exists (
      select 1
      from unnest(string_to_array(lower(trim(p_query)), ' ')) as w(word)
      where regexp_replace(w.word, '[^a-z0-9]', '', 'g') <> ''
        and lower(f.name) !~ ('\m' || regexp_replace(w.word, '[^a-z0-9]', '', 'g') || '(e?s)?\M')
    ) desc,
    case
      when f.source = 'cofid' then 0
      when f.source = 'seed' and f.name !~ ',' then 0
      when f.source = 'scan' then 1
      when f.source = 'off' then 2
      else 3
    end,
    (lower(f.name) like lower(trim(p_query)) || '%') desc,
    (lower(f.name) ~ ('^' || lower(trim(p_query)) || '(e?s)?,')) desc,
    (lower(f.name) ~ ',\s*(raw|boiled|baked|roast|roasted|grilled|steamed|poached|whole|flesh only|average)\M') desc,
    (f.name ~* '(homemade|made up|takeaway|restaurant|retail)') asc,
    length(f.name),
    f.name
  limit p_limit
$fn$;

grant execute on function public.search_foods(text, int) to authenticated;

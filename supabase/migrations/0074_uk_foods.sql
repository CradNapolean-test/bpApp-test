-- UK food database: room for the supermarket / brand products and UK generic foods being imported,
-- fast multi-word search over tens of thousands of rows, and two fixes to the original seed data.

create extension if not exists pg_trgm with schema extensions;

alter table public.foods add column if not exists brand text;
alter table public.foods add column if not exists source text not null default 'seed';
alter table public.foods add column if not exists hidden boolean not null default false;

-- Where a row came from: the original spreadsheet seed, a member's barcode scan, the Open Food
-- Facts UK import, or the UK government's McCance and Widdowson tables (generic foods).
alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check check (source in ('seed', 'scan', 'off', 'cofid'));

update public.foods set source = 'scan' where barcode is not null and source = 'seed';

-- Lower-cased name + brand with punctuation removed, so "sainsburys" finds "Sainsbury's" and
-- "m&s" matches "M&S". Generated, so imports never have to fill it in.
alter table public.foods
  add column if not exists search_text text generated always as (
    regexp_replace(lower(name || ' ' || coalesce(brand, '')), '[^a-z0-9 ]', '', 'g')
  ) stored;

create index if not exists foods_search_trgm_idx on public.foods using gin (search_text gin_trgm_ops);
create index if not exists foods_source_idx on public.foods (source);

-- Data fixes in the seed. Butter had 10g protein and 10g carbs per 100g (real: about 0.5g / 0.6g).
update public.foods set protein = 0.005, carbs = 0.006, fat = 0.82 where name = 'Butter' and portion = '1 gram' and source = 'seed';
-- Fifteen rows all named "1 egg (size N, ...)" with different, unlabelled macros: keep them for
-- anyone who already logged one, but stop offering them in search (UK generics have proper eggs).
update public.foods set hidden = true where name ~* '^1 egg \(size' and source = 'seed';

-- Multi-word search: every word must appear in the name. Exact and starts-with matches first, then
-- UK generics, scanned/imported products, and last the old seed; shorter names before longer ones.
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
    (lower(f.name) like lower(trim(p_query)) || '%') desc,
    case f.source when 'cofid' then 0 when 'scan' then 1 when 'off' then 2 else 3 end,
    length(f.name),
    f.name
  limit p_limit
$fn$;

grant execute on function public.search_foods(text, int) to authenticated;

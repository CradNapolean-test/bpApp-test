-- Serving units: log "1 egg", "2 rasher" or "250 ml" instead of only grams.
--
-- Foods are stored per gram, so a unit is just a weight: 1 rasher of back bacon = 25 g. Two sources of units, shown together as buttons
-- next to the grams box:
--   1. foods.serving_options: typical units that come with the food (below: eggs, bacon, bread, butter, oil, peanut butter, milk).
--   2. member_food_units: a member's own units for a food ("my rasher = 30 g"), private to them.
-- What is logged is still grams, so every total and target works exactly as before.
--
-- The built-in weights are typical cooked/prepared weights and are shown as approximate. They only touch foods stored per gram, matched
-- by name, and only where the name makes the unit obvious; anything else is left for the member to add their own. Safe to run again.

-- ---- 1. built-in units ----

alter table public.foods add column if not exists serving_options jsonb;
alter table public.foods drop constraint if exists foods_serving_options_shape;
alter table public.foods
  add constraint foods_serving_options_shape check (serving_options is null or jsonb_typeof(serving_options) = 'array') not valid;

-- Whole eggs (boiled, poached, fried, scrambled, raw), egg whites and yolks.
update public.foods set serving_options = '[{"label":"egg","grams":50}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'egg, chicken, white & yolk%';
update public.foods set serving_options = '[{"label":"egg white","grams":33}]'::jsonb
where portion = '1 gram' and serving_options is null and (name ilike 'egg, chicken, white, %' or name ilike 'egg whites%');
update public.foods set serving_options = '[{"label":"egg yolk","grams":17}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'egg, chicken, yolk%';

-- Bacon: a rasher of back bacon, or of streaky (thinner).
update public.foods set serving_options = '[{"label":"rasher","grams":15}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'bacon, streaky%';
update public.foods set serving_options = '[{"label":"rasher","grams":25}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'bacon%' and name not ilike '%egg%' and name not ilike '%pie%' and name not ilike 'savoury%';

-- Sliced bread.
update public.foods set serving_options = '[{"label":"slice","grams":36}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'bread%' and name ilike '%sliced%';

-- Spreads and oils.
update public.foods set serving_options = '[{"label":"teaspoon","grams":5},{"label":"tablespoon","grams":14}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'butter%' and name not ilike '%peanut%';
update public.foods set serving_options = '[{"label":"teaspoon","grams":5},{"label":"tablespoon","grams":16}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike '%peanut butter%';
update public.foods set serving_options = '[{"label":"teaspoon","grams":4},{"label":"tablespoon","grams":13}]'::jsonb
where portion = '1 gram' and serving_options is null and (name ilike 'oil, olive%' or name ilike 'olive oil%');

-- Sliced cheese.
update public.foods set serving_options = '[{"label":"slice","grams":20}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'cheese%' and name ilike '%sliced%';

-- Fluid milk, by the millilitre (1 ml of milk weighs about 1.03 g).
update public.foods set serving_options = '[{"label":"ml","grams":1.03}]'::jsonb
where portion = '1 gram' and serving_options is null and name ilike 'milk, cow%' and name ilike '%fluid%';

-- ---- 2. a member's own units ----

create table if not exists public.member_food_units (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 30),
  grams numeric not null check (grams > 0 and grams <= 5000),
  created_at timestamptz not null default now()
);

create unique index if not exists member_food_units_unique on public.member_food_units (client_id, food_id, lower(btrim(label)));
create index if not exists member_food_units_client on public.member_food_units (client_id);

alter table public.member_food_units enable row level security;

drop policy if exists "select own or coached member_food_units" on public.member_food_units;
create policy "select own or coached member_food_units"
  on public.member_food_units for select
  using (owns_client(client_id));

drop policy if exists "client manages own member_food_units" on public.member_food_units;
create policy "client manages own member_food_units"
  on public.member_food_units for all
  using (is_self(client_id))
  with check (is_self(client_id));

-- A member can keep at most 300 units of their own.
create or replace function public.member_food_unit_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from member_food_units where client_id = new.client_id) >= 300 then
    raise exception 'You already have the most units allowed (300)';
  end if;
  return new;
end;
$$;

revoke execute on function public.member_food_unit_cap() from public, anon, authenticated;

drop trigger if exists member_food_unit_cap on public.member_food_units;
create trigger member_food_unit_cap
  before insert on public.member_food_units
  for each row execute function public.member_food_unit_cap();

-- Serving choices that come from the food itself, not from guesses.
--
-- 0147 seeded foods.serving_options by matching names ("anything called egg is 50 g"). That is a generalisation, not what the
-- food says, so it is cleared here. From now on a food's serving choices come from:
--   1. the pack: a scanned product keeps the serving Open Food Facts states for it ("1 biscuit (15 g)"), written when it is cached;
--   2. people who know the food: a coach can set the servings on any food, and a member can fill them in on a scanned food that has
--      none yet (so a product scanned before this change picks its serving up the next time anyone scans it).
-- Each choice is {label, grams} with an optional "default": true (the serving shown first, at 1). Grams stays available on every food.
-- A member's own units (member_food_units) are unchanged. Safe to run again.

-- ---- 1. clear the guessed servings ----
update public.foods set serving_options = null where serving_options is not null;

-- ---- 2. a proper shape check ----
-- At most 12 choices; each a label of 1-30 characters and a weight above 0 and up to 5000 g; at most one default.
create or replace function public.valid_serving_options(options jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select options is null or (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) <= 12
    and not exists (
      select 1 from jsonb_array_elements(options) o
      where jsonb_typeof(o) <> 'object'
        or jsonb_typeof(o -> 'label') <> 'string'
        or char_length(btrim(o ->> 'label')) not between 1 and 30
        or jsonb_typeof(o -> 'grams') <> 'number'
        or (o ->> 'grams')::numeric <= 0
        or (o ->> 'grams')::numeric > 5000
        or (o ? 'default' and jsonb_typeof(o -> 'default') <> 'boolean')
    )
    and (select count(*) from jsonb_array_elements(options) o where o -> 'default' = 'true'::jsonb) <= 1
  );
$$;

alter table public.foods drop constraint if exists foods_serving_options_shape;
alter table public.foods
  add constraint foods_serving_options_shape check (public.valid_serving_options(serving_options));

-- ---- 3. setting a food's servings ----
-- A coach can set (or clear, with null) the servings on any food. A member can only fill them in on a scanned food that has none yet,
-- so a wrong serving is never overwritten by a member. Returns whether anything changed.
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
    update public.foods set serving_options = p_options where id = p_food_id;
  elsif p_options is not null then
    update public.foods set serving_options = p_options
    where id = p_food_id and source = 'scan' and serving_options is null;
  else
    return false;
  end if;

  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke execute on function public.set_food_servings(uuid, jsonb) from public, anon;
grant execute on function public.set_food_servings(uuid, jsonb) to authenticated;

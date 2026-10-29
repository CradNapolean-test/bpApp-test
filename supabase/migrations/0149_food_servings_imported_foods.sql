-- Foods imported in bulk from Open Food Facts (source 'off') can take their pack's serving on the first scan, the same as a member's
-- own scanned products. Still only while the food has none, so a member never overwrites a serving that is already there.
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

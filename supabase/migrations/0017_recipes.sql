-- Client-authored recipes: a bundle of foods + quantities a client can log/plan in one
-- action instead of adding each ingredient separately. Expand-at-add-time design (see
-- lib/data/recipes.ts's logRecipeToDiary/addRecipeToMealPlan) -- logging a recipe fans out
-- into individual food_diary_entries/meal_plan_entries rows, so foodTotals.ts and both
-- diary/planner tabs need zero changes; recipes themselves are just a saved shopping list.
-- Personal to the client, mirroring the client-write-only pattern of food_diary_entries and
-- workout_logs (a coach can view, but not edit, a client's own recipes).

create table recipes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  food_id uuid references foods(id),
  portions numeric not null default 1
);

alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

create policy "select own or coached recipes"
  on recipes for select
  using (owns_client(client_id));

create policy "client manages own recipes"
  on recipes for all
  using (is_self(client_id))
  with check (is_self(client_id));

create policy "select own or coached recipe_ingredients"
  on recipe_ingredients for select
  using (
    exists (select 1 from recipes where recipes.id = recipe_ingredients.recipe_id and owns_client(recipes.client_id))
  );

create policy "client manages own recipe_ingredients"
  on recipe_ingredients for all
  using (
    exists (select 1 from recipes where recipes.id = recipe_ingredients.recipe_id and is_self(recipes.client_id))
  )
  with check (
    exists (select 1 from recipes where recipes.id = recipe_ingredients.recipe_id and is_self(recipes.client_id))
  );

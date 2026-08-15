-- Favorites: explicit per-client favoriting, alongside the derived "recently logged" query
-- (lib/data/foods.ts's getRecentlyLoggedFoods, no new table -- reads food_diary_entries
-- joined through daily_logs, which is cheaper and provably sufficient until proven otherwise).
create table food_favorites (
  client_id uuid not null references profiles(id) on delete cascade,
  food_id uuid not null references foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, food_id)
);

alter table food_favorites enable row level security;

create policy "select own or coached food_favorites"
  on food_favorites for select
  using (owns_client(client_id));

-- Client-owned only (a coach favoriting a food on a client's behalf isn't a real use case) --
-- same is_self-for-writes shape as daily_logs/progress_photos, not the broader "coach can also
-- manage" shape meal_sections uses.
create policy "client manages own food_favorites"
  on food_favorites for all
  using (is_self(client_id))
  with check (is_self(client_id));

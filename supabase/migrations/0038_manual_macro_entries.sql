-- Manual macro entry for nutrition_tracking_mode = 'manual_import' -- categories.ts previously
-- returned [] for this mode (no nutrition screen at all), which was the actual bug behind
-- "manual input should still have nutrition accessible". This table gives that mode a real
-- per-meal-section input: a client types calories/protein/carbs/fat per section per day instead
-- of using the full food-search diary. Same join-through-daily_logs shape as
-- food_diary_entries, so RLS mirrors it exactly (see schema.sql lines 282-321).
create table manual_macro_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references daily_logs(id) on delete cascade,
  meal_section_id uuid references meal_sections(id) on delete set null,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  created_at timestamptz not null default now()
);

alter table manual_macro_entries enable row level security;

create policy "select own or coached manual_macro_entries"
  on manual_macro_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = manual_macro_entries.daily_log_id
      and owns_client(daily_logs.client_id)
    )
  );

create policy "client writes own manual_macro_entries"
  on manual_macro_entries for insert
  with check (
    exists (
      select 1 from daily_logs
      where daily_logs.id = manual_macro_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

create policy "client updates own manual_macro_entries"
  on manual_macro_entries for update
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = manual_macro_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

create policy "client deletes own manual_macro_entries"
  on manual_macro_entries for delete
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = manual_macro_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

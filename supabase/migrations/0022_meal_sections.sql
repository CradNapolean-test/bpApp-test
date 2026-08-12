-- Customizable meal sections for food tracking (MyFitnessPal-style: presets or fully custom
-- names/order, per client). Deliberately separate from meal_plan_entries.section (a fixed
-- 6-value enum for the Meal Planner) -- different problem (forward planning vs. actual
-- day-of tracking), see plan notes for why they aren't merged in this pass.

create table meal_sections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table meal_sections enable row level security;

create policy "select own or coached meal_sections"
  on meal_sections for select
  using (owns_client(client_id));

-- Client self-manages sections; coach can also manage (same as e.g. client_exercise_maxes) --
-- unlike habits (coach-only writes), section naming is a personal-organization choice.
create policy "client or coach manages meal_sections"
  on meal_sections for all
  using (owns_client(client_id))
  with check (owns_client(client_id));

-- Nullable + on delete set null (not cascade): deleting a section is an organizational
-- action, not "erase everything I logged under that heading". Existing rows get NULL
-- automatically -- no backfill needed, the UI buckets these into a trailing "Other" group.
alter table food_diary_entries
  add column meal_section_id uuid references meal_sections(id) on delete set null;

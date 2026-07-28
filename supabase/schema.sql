-- Central Hub — initial schema
-- Assumes Supabase Auth is handling users; this extends with a profiles/roles table.
-- Run RLS policies carefully — client data privacy depends entirely on these, not the app UI.

-- ============ Roles ============
create type user_role as enum ('coach', 'client');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  coach_id uuid references profiles(id), -- for clients: which coach they belong to
  created_at timestamptz default now()
);

-- ============ Client Profile (Setup tab) ============
create table client_profiles (
  client_id uuid primary key references profiles(id) on delete cascade,
  name text not null,
  gender text,
  goal_description text,
  experience text,
  age numeric,
  body_fat_pct numeric,
  start_weight numeric not null,
  goal_weight numeric not null, -- required: see PROJECT_SPEC.md re: the ambiguity bug this fixes
  activity_level numeric default 1.5,
  diet_approach text default 'High Carb Low Fat',
  tier smallint default 1 check (tier in (1,2,3)),
  cycling boolean default false,
  meas_arm_start numeric, meas_arm_goal numeric,
  meas_chest_start numeric, meas_chest_goal numeric,
  meas_waist_start numeric, meas_waist_goal numeric,
  meas_hips_start numeric, meas_hips_goal numeric,
  meas_quad_start numeric, meas_quad_goal numeric,
  lift_db_press_start numeric, lift_db_press_goal numeric,
  lift_squats_start numeric, lift_squats_goal numeric,
  lift_pull_ups_start numeric, lift_pull_ups_goal numeric,
  lift_rdl_start numeric, lift_rdl_goal numeric,
  lift_hip_thrust_start numeric, lift_hip_thrust_goal numeric,
  updated_at timestamptz default now()
);

-- ============ Daily Logs (Weekly Log tab) ============
create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  protein numeric, carbs numeric, fat numeric, fibre numeric,
  water numeric, bodyweight numeric, steps integer, sleep numeric,
  gym_session boolean default false,
  day_type text default 'flat' check (day_type in ('flat','low','high')),
  hunger smallint check (hunger between 1 and 5),
  energy smallint check (energy between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  stress smallint check (stress between 1 and 5),
  period_started boolean default false,
  notes text,
  unique (client_id, log_date)
);

-- ============ Food database (seeded from data/foods.json) ============
create table foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  portion text,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  barcode text unique -- nullable; populated over time via barcode lookups
);

-- ============ Food diary entries (Food Tracking tab) ============
create table food_diary_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references daily_logs(id) on delete cascade,
  food_id uuid references foods(id),
  portions numeric not null default 1
);

-- ============ Activities (MET table, seeded from data/activities.json) ============
create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  met numeric not null
);

-- ============ Progress photos ============
create table progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  photo_date date not null,
  storage_path text not null, -- Supabase Storage path, bucket: progress-photos
  created_at timestamptz default now()
);

-- ============ Classes + Credits ============
create table classes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  name text not null,
  day_of_week smallint, -- 0-6
  start_time time,
  capacity integer not null,
  coach_note text
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  booking_date date not null,
  status text not null default 'booked' check (status in ('booked','waitlist','cancelled')),
  created_at timestamptz default now()
);

-- Append-only ledger — never a mutable balance column. Current balance = sum(delta).
-- No payment processor for now — top-ups are manual (coach action), reason = 'manual grant'.
-- Keeping this ledger-shaped means real payment processing later is just a new writer to
-- this same table, not a schema change.
create table credits_ledger (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  delta integer not null, -- positive = credit added, negative = credit spent
  reason text not null, -- e.g. 'manual grant', 'booking:{booking_id}', 'refund:{booking_id}'
  granted_by uuid references profiles(id), -- coach who manually granted, if applicable
  created_at timestamptz default now()
);

-- ============ Chat ============
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade, -- which client's thread
  sender_id uuid not null references profiles(id), -- coach or the client themself
  text text not null,
  created_at timestamptz default now()
);

-- ============ Workout Programs ============
create table workout_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table workout_program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references workout_programs(id) on delete cascade,
  week_num integer not null,
  day_label text not null
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references workout_program_days(id) on delete cascade,
  name text not null,
  sets integer,
  reps text, -- text to allow ranges like "8-10"
  load numeric,
  rpe numeric,
  notes text
);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid references workout_exercises(id),
  set_number integer,
  actual_reps integer,
  actual_load numeric,
  actual_rpe numeric,
  logged_at timestamptz default now()
);

-- ============ Row Level Security ============
-- Pattern: clients can only touch rows where client_id = auth.uid().
-- Coaches can touch rows belonging to clients where client_profiles/profiles.coach_id = auth.uid().
-- Below is illustrative for daily_logs; repeat the same pattern for every client-scoped table
-- (food_diary_entries via daily_logs join, progress_photos, bookings, credits_ledger,
-- chat_messages, workout_* tables).

alter table daily_logs enable row level security;

create policy "clients see own logs"
  on daily_logs for select
  using (client_id = auth.uid());

create policy "clients insert own logs"
  on daily_logs for insert
  with check (client_id = auth.uid());

create policy "clients update own logs"
  on daily_logs for update
  using (client_id = auth.uid());

create policy "coach sees their clients' logs"
  on daily_logs for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = daily_logs.client_id
      and profiles.coach_id = auth.uid()
    )
  );

-- Repeat equivalent select/insert/update policies for every other client-scoped table.
-- Do NOT skip this for any table containing client data — the PIN-gate prototype this
-- replaces was explicitly insecure; RLS is the actual privacy boundary now.

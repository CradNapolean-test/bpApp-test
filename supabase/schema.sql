-- Central Hub — initial schema
-- Assumes Supabase Auth is handling users; this extends with a profiles/roles table.
-- Run RLS policies carefully — client data privacy depends entirely on these, not the app UI.

-- ============ Roles ============
create type user_role as enum ('coach', 'client');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  email text not null, -- denormalized from auth.users: auth.users isn't exposed via the
                        -- client API/RLS, and the coach dashboard needs it without an
                        -- admin-API round trip per row
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

-- ============ Meal Planner (forward planning, not tied to a date) ============
create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  section text not null check (
    section in ('breakfast','mid_morning_snack','lunch','afternoon_snack','dinner','evening_snack')
  ),
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

-- Computed balance, never stored. security_invoker means it respects the querying user's
-- own RLS on credits_ledger rather than the view owner's privileges.
create view credits_balance
  with (security_invoker = true) as
  select client_id, coalesce(sum(delta), 0)::integer as balance
  from credits_ledger
  group by client_id;

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
-- Every client-scoped table follows the same shape: a client sees/writes their own rows,
-- their coach can see (read-only, mostly) the same rows. Two helper functions capture that
-- relationship so it isn't hand-copied per table. Both are security definer so the internal
-- lookup against `profiles` doesn't re-trigger `profiles`' own RLS policy (which would
-- otherwise recurse back into itself).

create function public.is_self(target_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_id = auth.uid();
$$;

create function public.is_coach_of(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where profiles.id = target_client_id
    and profiles.coach_id = auth.uid()
  );
$$;

create function public.owns_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_self(target_client_id) or public.is_coach_of(target_client_id);
$$;

-- ---- profiles ----
alter table profiles enable row level security;

create policy "select own or coached profile"
  on profiles for select
  using (owns_client(id));

-- No insert/update policy: profiles are created by the service-role backend
-- (scripts/create-coach.ts, app/api/coach/create-client) which bypasses RLS entirely.

-- ---- client_profiles ----
alter table client_profiles enable row level security;

create policy "select own or coached client_profiles"
  on client_profiles for select
  using (owns_client(client_id));

create policy "client creates own client_profiles"
  on client_profiles for insert
  with check (is_self(client_id));

create policy "client updates own client_profiles"
  on client_profiles for update
  using (is_self(client_id));

-- Coach account creation (app/api/coach/create-client) only creates the profiles row —
-- client_profiles is created by the client's own first Setup-tab save (an upsert), which
-- is why insert is client-self rather than service-role-only.

-- ---- daily_logs ----
alter table daily_logs enable row level security;

create policy "select own or coached daily_logs"
  on daily_logs for select
  using (owns_client(client_id));

create policy "client inserts own daily_logs"
  on daily_logs for insert
  with check (is_self(client_id));

create policy "client updates own daily_logs"
  on daily_logs for update
  using (is_self(client_id));

-- ---- food_diary_entries (no direct client_id — join through daily_logs) ----
alter table food_diary_entries enable row level security;

create policy "select own or coached food_diary_entries"
  on food_diary_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_diary_entries.daily_log_id
      and owns_client(daily_logs.client_id)
    )
  );

create policy "client writes own food_diary_entries"
  on food_diary_entries for insert
  with check (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_diary_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

create policy "client updates own food_diary_entries"
  on food_diary_entries for update
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_diary_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

create policy "client deletes own food_diary_entries"
  on food_diary_entries for delete
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_diary_entries.daily_log_id
      and is_self(daily_logs.client_id)
    )
  );

-- ---- meal_plan_entries ----
alter table meal_plan_entries enable row level security;

create policy "select own or coached meal_plan_entries"
  on meal_plan_entries for select
  using (owns_client(client_id));

create policy "client writes own meal_plan_entries"
  on meal_plan_entries for insert
  with check (is_self(client_id));

create policy "client updates own meal_plan_entries"
  on meal_plan_entries for update
  using (is_self(client_id));

create policy "client deletes own meal_plan_entries"
  on meal_plan_entries for delete
  using (is_self(client_id));

-- ---- foods / activities (shared reference data, seeded via service role) ----
alter table foods enable row level security;
alter table activities enable row level security;

create policy "authenticated users read foods"
  on foods for select
  to authenticated
  using (true);

create policy "authenticated users read activities"
  on activities for select
  to authenticated
  using (true);

-- ---- progress_photos ----
alter table progress_photos enable row level security;

create policy "select own or coached progress_photos"
  on progress_photos for select
  using (owns_client(client_id));

create policy "client uploads own progress_photos"
  on progress_photos for insert
  with check (is_self(client_id));

create policy "client deletes own progress_photos"
  on progress_photos for delete
  using (is_self(client_id));

-- ---- classes (coach-owned, client-readable for booking) ----
alter table classes enable row level security;

create policy "authenticated users read classes"
  on classes for select
  to authenticated
  using (true);

create policy "coach manages own classes"
  on classes for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- ---- bookings ----
alter table bookings enable row level security;

create policy "select own or coached bookings"
  on bookings for select
  using (owns_client(client_id));

create policy "client books for self"
  on bookings for insert
  with check (is_self(client_id));

create policy "client cancels own booking"
  on bookings for update
  using (is_self(client_id));

-- ---- credits_ledger ----
-- Deliberately no client-facing insert policy yet: booking/cancellation-driven ledger
-- writes (Phase 4) will go through a security-definer RPC that validates balance
-- atomically, not a raw table insert. For now, only manual coach grants are allowed.
alter table credits_ledger enable row level security;

create policy "select own or coached credits_ledger"
  on credits_ledger for select
  using (owns_client(client_id));

create policy "coach grants credits"
  on credits_ledger for insert
  with check (is_coach_of(client_id) and granted_by = auth.uid());

-- ---- chat_messages ----
alter table chat_messages enable row level security;

create policy "select own or coached chat_messages"
  on chat_messages for select
  using (owns_client(client_id));

create policy "client or coach posts into owned thread"
  on chat_messages for insert
  with check (owns_client(client_id) and sender_id = auth.uid());

-- ---- workout_programs (coach builds, client reads) ----
alter table workout_programs enable row level security;

create policy "select own or coached workout_programs"
  on workout_programs for select
  using (owns_client(client_id));

create policy "coach manages workout_programs"
  on workout_programs for all
  using (is_coach_of(client_id))
  with check (is_coach_of(client_id));

-- ---- workout_program_days (join workout_programs) ----
alter table workout_program_days enable row level security;

create policy "select own or coached workout_program_days"
  on workout_program_days for select
  using (
    exists (
      select 1 from workout_programs
      where workout_programs.id = workout_program_days.program_id
      and owns_client(workout_programs.client_id)
    )
  );

create policy "coach manages workout_program_days"
  on workout_program_days for all
  using (
    exists (
      select 1 from workout_programs
      where workout_programs.id = workout_program_days.program_id
      and is_coach_of(workout_programs.client_id)
    )
  )
  with check (
    exists (
      select 1 from workout_programs
      where workout_programs.id = workout_program_days.program_id
      and is_coach_of(workout_programs.client_id)
    )
  );

-- ---- workout_exercises (join workout_program_days -> workout_programs) ----
alter table workout_exercises enable row level security;

create policy "select own or coached workout_exercises"
  on workout_exercises for select
  using (
    exists (
      select 1 from workout_program_days
      join workout_programs on workout_programs.id = workout_program_days.program_id
      where workout_program_days.id = workout_exercises.program_day_id
      and owns_client(workout_programs.client_id)
    )
  );

create policy "coach manages workout_exercises"
  on workout_exercises for all
  using (
    exists (
      select 1 from workout_program_days
      join workout_programs on workout_programs.id = workout_program_days.program_id
      where workout_program_days.id = workout_exercises.program_day_id
      and is_coach_of(workout_programs.client_id)
    )
  )
  with check (
    exists (
      select 1 from workout_program_days
      join workout_programs on workout_programs.id = workout_program_days.program_id
      where workout_program_days.id = workout_exercises.program_day_id
      and is_coach_of(workout_programs.client_id)
    )
  );

-- ---- workout_logs (client logs actual performance) ----
alter table workout_logs enable row level security;

create policy "select own or coached workout_logs"
  on workout_logs for select
  using (owns_client(client_id));

create policy "client logs own workout performance"
  on workout_logs for insert
  with check (is_self(client_id));

create policy "client updates own workout_logs"
  on workout_logs for update
  using (is_self(client_id));

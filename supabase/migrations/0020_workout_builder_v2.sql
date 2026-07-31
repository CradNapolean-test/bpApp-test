-- Workout programme builder v2: synthesizes the strongest patterns from TrainHeroic,
-- TrueCoach, Trainerize, PT Distinction and CoachRx (see docs/WORKOUT_BUILDER_RESEARCH.md).
--
-- %1RM-based prescriptions, exercise-vs-circuit blocks, per-week load progression on
-- templates, phase/block labelling, per-set type on logs, and end-of-day session feedback.

-- ============ client_exercise_maxes ============
-- A periodic tested/estimated 1RM per client per library exercise -- mirrors
-- measurement_logs' pattern (0006): an append-only ledger, "current" = most recent row,
-- not a denormalized current-value column. Deliberately NOT reusing client_profiles' fixed
-- lift_*_start/goal fields -- those are a one-time baseline+target pair for 5 hardcoded
-- lifts, not a live/updatable max tied to the general exercise library.
create table client_exercise_maxes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_library_id uuid not null references exercise_library(id),
  tested_max numeric not null,
  is_estimated boolean not null default false,
  tested_date date not null default current_date,
  recorded_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz default now()
);

alter table client_exercise_maxes enable row level security;

create policy "select own or coached client_exercise_maxes"
  on client_exercise_maxes for select
  using (owns_client(client_id));

create policy "client or coach records exercise maxes"
  on client_exercise_maxes for insert
  with check (owns_client(client_id));

-- ============ workout_day_feedback ============
-- End-of-session RPE + notes (Trainerize's post-workout prompt). Upserted on
-- (client_id, program_day_id) -- one day can recur across the program's lifetime but we
-- only keep the latest feedback for it, mirroring dashboardBundle's getOrCreateDailyLog
-- upsert idiom. Surfaced inline on the day header (coach read-only, client submits) --
-- deliberately not building a coach notification channel for this; notifications has no
-- generic authenticated insert path today and that's a separate, larger feature.
create table workout_day_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  program_day_id uuid not null references workout_program_days(id) on delete cascade,
  feedback_date date not null default current_date,
  session_rpe smallint check (session_rpe between 1 and 10),
  notes text,
  created_at timestamptz default now(),
  unique (client_id, program_day_id)
);

alter table workout_day_feedback enable row level security;

create policy "select own or coached workout_day_feedback"
  on workout_day_feedback for select
  using (owns_client(client_id));

create policy "client submits own workout_day_feedback"
  on workout_day_feedback for insert
  with check (is_self(client_id));

create policy "client updates own workout_day_feedback"
  on workout_day_feedback for update
  using (is_self(client_id));

-- ============ workout_exercises / program_template_exercises ============
-- exercise_library_id is new on workout_exercises (program_template_exercises already has
-- it, added in 0013) -- this is what makes %1RM resolution and cross-program exercise
-- history possible for live program rows, not just templates.
alter table workout_exercises add column exercise_library_id uuid references exercise_library(id);
alter table workout_exercises add column block_type text not null default 'exercise'
  check (block_type in ('exercise', 'circuit'));
alter table workout_exercises add column prescription_type text not null default 'absolute'
  check (prescription_type in ('absolute', 'percent_1rm'));
alter table workout_exercises add column percent_1rm numeric;
alter table workout_exercises add constraint workout_exercises_percent_1rm_check
  check (prescription_type <> 'percent_1rm' or (percent_1rm is not null and exercise_library_id is not null));

alter table program_template_exercises add column block_type text not null default 'exercise'
  check (block_type in ('exercise', 'circuit'));
alter table program_template_exercises add column prescription_type text not null default 'absolute'
  check (prescription_type in ('absolute', 'percent_1rm'));
alter table program_template_exercises add column percent_1rm numeric;
alter table program_template_exercises add constraint program_template_exercises_percent_1rm_check
  check (prescription_type <> 'percent_1rm' or (percent_1rm is not null and exercise_library_id is not null));

-- Load-only progression (reps is a free-text range like "8-10", not cleanly incrementable).
-- Template-only -- a live program's per-week rows are already materialized per week.
alter table program_template_exercises add column progression_load_increment numeric;
alter table program_template_exercises add column progression_every_weeks integer not null default 1;

-- ============ workout_program_days / program_template_days ============
-- CoachRx-style phase/block label ("Hypertrophy Block 1") above the week list -- purely
-- organizational, coach-editable.
alter table workout_program_days add column phase_label text;
alter table program_template_days add column phase_label text;

-- ============ workout_logs ============
-- set_type distinguishes a warm-up/failure/drop set from a working set when logging (not on
-- the prescription side -- see plan notes on why prescribed sets aren't being normalized).
-- exercise_library_id is denormalized here (copied at log time by lib/data/workouts.ts'
-- logSet) rather than resolved via a join through workout_exercises, so cross-program
-- exercise history survives a coach later deleting or restructuring the exercise/program.
alter table workout_logs add column set_type text not null default 'working'
  check (set_type in ('working', 'warmup', 'failure', 'drop'));
alter table workout_logs add column exercise_library_id uuid references exercise_library(id);

-- Fixes a pre-existing gap: without an on delete clause here, deleting any exercise, day or
-- program that already has a logged set fails with a foreign-key violation, since
-- workout_logs was never part of the workout_programs -> ... -> workout_exercises cascade
-- chain the rest of the schema uses. Never explicitly named, so this is Postgres's default
-- auto-generated name for an inline `references` FK on this column -- if this errors because
-- the name differs, check the real name via `\d workout_logs` in the SQL editor first.
alter table workout_logs drop constraint if exists workout_logs_exercise_id_fkey;
alter table workout_logs
  add constraint workout_logs_exercise_id_fkey
  foreign key (exercise_id) references workout_exercises(id) on delete set null;

-- ============ instantiate_program_template: carry everything + apply progression ============
create or replace function public.instantiate_program_template(
  p_template_id uuid,
  p_client_id uuid,
  p_program_name text
)
returns workout_programs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template program_templates;
  v_program workout_programs;
  v_min_week integer;
  v_tday record;
  v_new_day_id uuid;
  v_tex record;
  v_week_offset integer;
  v_applied_load numeric;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.coach_id <> auth.uid() then
    raise exception 'Programme template not found';
  end if;

  select min(week_num) into v_min_week from program_template_days where template_id = p_template_id;

  insert into workout_programs (client_id, name)
  values (p_client_id, coalesce(nullif(p_program_name, ''), v_template.name))
  returning * into v_program;

  for v_tday in select * from program_template_days where template_id = p_template_id order by sort_order loop
    insert into workout_program_days (program_id, week_num, day_label, sort_order, phase_label)
    values (v_program.id, v_tday.week_num, v_tday.day_label, v_tday.sort_order, v_tday.phase_label)
    returning id into v_new_day_id;

    v_week_offset := v_tday.week_num - v_min_week;

    for v_tex in select * from program_template_exercises where template_day_id = v_tday.id order by sort_order loop
      v_applied_load := v_tex.load;
      if v_tex.progression_load_increment is not null and v_tex.load is not null then
        v_applied_load := v_tex.load
          + v_tex.progression_load_increment * floor(v_week_offset / v_tex.progression_every_weeks);
      end if;

      insert into workout_exercises (
        program_day_id, exercise_library_id, name, sets, reps, load, rpe,
        notes, video_url, superset_group, rest_seconds, sort_order,
        block_type, prescription_type, percent_1rm
      )
      values (
        v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_applied_load, v_tex.rpe,
        v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order,
        v_tex.block_type, v_tex.prescription_type, v_tex.percent_1rm
      );
    end loop;
  end loop;

  return v_program;
end;
$$;

grant execute on function public.instantiate_program_template(uuid, uuid, text) to authenticated;

-- ============ duplicate_program_template: carry the new columns raw ============
create or replace function public.duplicate_program_template(p_template_id uuid, p_new_name text)
returns program_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src program_templates;
  v_new program_templates;
  v_day record;
  v_new_day_id uuid;
  v_ex record;
begin
  select * into v_src from program_templates where id = p_template_id and coach_id = auth.uid();
  if v_src is null then
    raise exception 'Template not found';
  end if;

  insert into program_templates (coach_id, name)
  values (auth.uid(), coalesce(nullif(p_new_name, ''), v_src.name || ' (copy)'))
  returning * into v_new;

  for v_day in select * from program_template_days where template_id = p_template_id order by sort_order loop
    insert into program_template_days (template_id, week_num, day_label, sort_order, phase_label)
    values (v_new.id, v_day.week_num, v_day.day_label, v_day.sort_order, v_day.phase_label)
    returning id into v_new_day_id;

    for v_ex in select * from program_template_exercises where template_day_id = v_day.id order by sort_order loop
      insert into program_template_exercises (
        template_day_id, exercise_library_id, name, sets, reps, load, rpe,
        notes, video_url, superset_group, rest_seconds, sort_order,
        block_type, prescription_type, percent_1rm,
        progression_load_increment, progression_every_weeks
      )
      values (
        v_new_day_id, v_ex.exercise_library_id, v_ex.name, v_ex.sets, v_ex.reps, v_ex.load, v_ex.rpe,
        v_ex.notes, v_ex.video_url, v_ex.superset_group, v_ex.rest_seconds, v_ex.sort_order,
        v_ex.block_type, v_ex.prescription_type, v_ex.percent_1rm,
        v_ex.progression_load_increment, v_ex.progression_every_weeks
      );
    end loop;
  end loop;

  return v_new;
end;
$$;

grant execute on function public.duplicate_program_template(uuid, text) to authenticated;

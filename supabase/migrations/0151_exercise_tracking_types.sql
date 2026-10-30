-- Exercise tracking types (workout builder, step 1).
--
-- Until now every exercise was weight x reps. An exercise now says what is recorded for it:
--   weight_reps      kg and reps (squat, press)                       -- the default, so nothing existing changes
--   reps             reps only (push-ups, pull-ups)
--   weight_time      kg and time (loaded hold)
--   time             time (plank, wall sit)
--   distance         metres (broad jump, sled push)
--   distance_time    metres and time (400 m run, row for time)
--   calories         calories (bike, ski erg)
--   weight_distance  kg and metres (farmer's carry)
--   tick             done / not done (mobility)
--
-- The library entry holds the default; a programme or template row can override it. A row that is not
-- weight x reps can also carry a target time, distance or calorie count, and a logged set carries the matching result.
-- Distance is stored in metres and time in seconds.
--
-- PRE-FLIGHT: none. Every new column is nullable or has a default, so existing programmes, templates and logs are unchanged.
-- ROLLBACK: drop the columns added below; restore instantiate_template_core and duplicate_program_template from 0094 and 0093.

alter table exercise_library
  add column if not exists tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'reps', 'weight_time', 'time', 'distance', 'distance_time', 'calories', 'weight_distance', 'tick'));

alter table workout_exercises
  add column if not exists tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'reps', 'weight_time', 'time', 'distance', 'distance_time', 'calories', 'weight_distance', 'tick')),
  add column if not exists target_seconds integer check (target_seconds is null or target_seconds > 0),
  add column if not exists target_distance numeric check (target_distance is null or target_distance > 0),
  add column if not exists target_calories numeric check (target_calories is null or target_calories > 0);

alter table program_template_exercises
  add column if not exists tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'reps', 'weight_time', 'time', 'distance', 'distance_time', 'calories', 'weight_distance', 'tick')),
  add column if not exists target_seconds integer check (target_seconds is null or target_seconds > 0),
  add column if not exists target_distance numeric check (target_distance is null or target_distance > 0),
  add column if not exists target_calories numeric check (target_calories is null or target_calories > 0);

alter table workout_logs
  add column if not exists actual_seconds numeric check (actual_seconds is null or actual_seconds >= 0),
  add column if not exists actual_distance numeric check (actual_distance is null or actual_distance >= 0),
  add column if not exists actual_calories numeric check (actual_calories is null or actual_calories >= 0);

-- Copies a template into a client's programme (as 0094, plus the tracking type and targets).
create or replace function public.instantiate_template_core(
  p_template_id uuid,
  p_client_id uuid,
  p_program_name text,
  p_start date,
  p_rollout uuid
)
returns workout_programs
language plpgsql
security definer
set search_path = public
as $fn$
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
  select * into v_template from program_templates where id = p_template_id;
  if v_template is null then
    raise exception 'Programme template not found';
  end if;

  select min(week_num) into v_min_week from program_template_days where template_id = p_template_id;

  insert into workout_programs (client_id, name, start_date, rollout_id)
  values (p_client_id, coalesce(nullif(p_program_name, ''), v_template.name), p_start, p_rollout)
  returning * into v_program;

  for v_tday in select * from program_template_days where template_id = p_template_id order by sort_order loop
    insert into workout_program_days (program_id, week_num, day_label, sort_order, phase_label, day_position)
    values (v_program.id, v_tday.week_num, v_tday.day_label, v_tday.sort_order, v_tday.phase_label, v_tday.day_position)
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
        block_type, prescription_type, percent_1rm,
        section, block_no, block_format, block_part,
        tracking_type, target_seconds, target_distance, target_calories
      )
      values (
        v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_applied_load, v_tex.rpe,
        v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order,
        v_tex.block_type, v_tex.prescription_type, v_tex.percent_1rm,
        v_tex.section, v_tex.block_no, v_tex.block_format, v_tex.block_part,
        v_tex.tracking_type, v_tex.target_seconds, v_tex.target_distance, v_tex.target_calories
      );
    end loop;
  end loop;

  return v_program;
end;
$fn$;

revoke all on function public.instantiate_template_core(uuid, uuid, text, date, uuid) from public, anon, authenticated;

-- Duplicating a template copies the tracking type and targets too (as 0093, plus the new fields).
create or replace function public.duplicate_program_template(p_template_id uuid, p_new_name text)
returns program_templates
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_src program_templates;
  v_new program_templates;
  v_day record;
  v_new_day_id uuid;
  v_ex record;
begin
  select * into v_src from program_templates where id = p_template_id and gym_id = public.my_gym_id();
  if v_src is null then
    raise exception 'Template not found';
  end if;

  insert into program_templates (coach_id, gym_id, name)
  values (auth.uid(), public.my_gym_id(), coalesce(nullif(p_new_name, ''), v_src.name || ' (copy)'))
  returning * into v_new;

  for v_day in select * from program_template_days where template_id = p_template_id order by sort_order loop
    insert into program_template_days (template_id, week_num, day_label, sort_order, phase_label, day_position)
    values (v_new.id, v_day.week_num, v_day.day_label, v_day.sort_order, v_day.phase_label, v_day.day_position)
    returning id into v_new_day_id;

    for v_ex in select * from program_template_exercises where template_day_id = v_day.id order by sort_order loop
      insert into program_template_exercises (
        template_day_id, exercise_library_id, name, sets, reps, load, rpe,
        notes, video_url, superset_group, rest_seconds, sort_order,
        block_type, prescription_type, percent_1rm,
        progression_load_increment, progression_every_weeks,
        section, block_no, block_format, block_part,
        tracking_type, target_seconds, target_distance, target_calories
      )
      values (
        v_new_day_id, v_ex.exercise_library_id, v_ex.name, v_ex.sets, v_ex.reps, v_ex.load, v_ex.rpe,
        v_ex.notes, v_ex.video_url, v_ex.superset_group, v_ex.rest_seconds, v_ex.sort_order,
        v_ex.block_type, v_ex.prescription_type, v_ex.percent_1rm,
        v_ex.progression_load_increment, v_ex.progression_every_weeks,
        v_ex.section, v_ex.block_no, v_ex.block_format, v_ex.block_part,
        v_ex.tracking_type, v_ex.target_seconds, v_ex.target_distance, v_ex.target_calories
      );
    end loop;
  end loop;

  return v_new;
end;
$fn$;

-- Importing a template file reads the tracking type and targets too (as 0133, plus the new fields).
create or replace function public.import_program_template(p_json jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_name text;
  v_template uuid;
  v_day jsonb;
  v_ex jsonb;
  v_day_id uuid;
  v_week integer;
  v_ex_name text;
  v_library uuid;
  v_prescription text;
  v_percent numeric;
  v_video text;
  v_section text;
  v_block_type text;
  v_block_no integer;
  v_block_part text;
  v_tracking text;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can import a programme';
  end if;

  if p_json is null or jsonb_typeof(p_json) <> 'object'
     or coalesce(jsonb_typeof(p_json -> 'days'), '') <> 'array'
     or public._import_text(p_json, 'name', 100) is null then
    raise exception 'That file isn''t a recognised programme template export';
  end if;
  v_name := public._import_text(p_json, 'name', 100);

  if jsonb_array_length(p_json -> 'days') > 20 * 14 then
    raise exception 'That programme has too many days (up to 14 days a week for 20 weeks).';
  end if;

  -- Every day needs a week number and a label; limits per week and per day.
  for v_day in select value from jsonb_array_elements(p_json -> 'days') loop
    if jsonb_typeof(v_day) <> 'object'
       or public._import_int(v_day, 'week_num', 0, 1000) is null
       or public._import_text(v_day, 'day_label', 100) is null
       or coalesce(jsonb_typeof(v_day -> 'exercises'), '') <> 'array' then
      raise exception 'That file isn''t a recognised programme template export';
    end if;
    if jsonb_array_length(v_day -> 'exercises') > 60 then
      raise exception 'A day can have up to 60 exercises.';
    end if;
  end loop;

  if (select count(distinct public._import_int(d.value, 'week_num', 0, 1000)) from jsonb_array_elements(p_json -> 'days') d) > 20 then
    raise exception 'A programme can have up to 20 weeks.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_json -> 'days') d
    group by public._import_int(d.value, 'week_num', 0, 1000)
    having count(*) > 14
  ) then
    raise exception 'A week can have up to 14 days.';
  end if;

  insert into program_templates (coach_id, gym_id, name)
  values (auth.uid(), v_gym, v_name)
  returning id into v_template;

  for v_day in select value from jsonb_array_elements(p_json -> 'days') loop
    v_week := public._import_int(v_day, 'week_num', 0, 1000);

    insert into program_template_days (template_id, week_num, day_label, sort_order, phase_label, notes, day_position)
    values (
      v_template,
      v_week,
      public._import_text(v_day, 'day_label', 100),
      coalesce(public._import_int(v_day, 'sort_order', -100000, 100000), 0),
      public._import_text(v_day, 'phase_label', 100),
      public._import_text(v_day, 'notes', 2000),
      public._import_int(v_day, 'day_position', 0, 1000)
    )
    returning id into v_day_id;

    for v_ex in select value from jsonb_array_elements(v_day -> 'exercises') loop
      if jsonb_typeof(v_ex) <> 'object' or public._import_text(v_ex, 'name', 200) is null then
        raise exception 'That file isn''t a recognised programme template export';
      end if;
      v_ex_name := public._import_text(v_ex, 'name', 200);

      select l.id into v_library
      from exercise_library l
      where lower(btrim(l.name)) = lower(v_ex_name)
      order by l.is_active desc, l.created_at
      limit 1;

      v_prescription := case when v_ex ->> 'prescription_type' = 'percent_1rm' then 'percent_1rm' else 'absolute' end;
      v_percent := public._import_number(v_ex, 'percent_1rm');
      if v_percent is not null and (v_percent < 0 or v_percent > 200) then
        v_percent := null;
      end if;
      if v_prescription = 'percent_1rm' and (v_percent is null or v_library is null) then
        raise exception '"%" is prescribed as a percentage of 1RM, which needs a percentage and an entry in your exercise library.', v_ex_name;
      end if;

      v_video := public._import_text(v_ex, 'video_url', 500);
      if v_video is not null and v_video !~* '^https://' then
        v_video := null;
      end if;

      v_section := case when v_ex ->> 'section' in ('warmup', 'strong', 'conditioning') then v_ex ->> 'section' else 'lift' end;
      v_block_type := case when v_ex ->> 'block_type' = 'circuit' then 'circuit' else 'exercise' end;
      v_block_no := public._import_int(v_ex, 'block_no', 1, 2);
      v_block_part := case when v_ex ->> 'block_part' in ('upper', 'lower', 'breath', 'burn') then v_ex ->> 'block_part' end;
      v_tracking := case when v_ex ->> 'tracking_type' in ('weight_reps', 'reps', 'weight_time', 'time', 'distance', 'distance_time', 'calories', 'weight_distance', 'tick') then v_ex ->> 'tracking_type' else 'weight_reps' end;

      insert into program_template_exercises (
        template_day_id, exercise_library_id, name, sets, reps, load, rpe, notes, video_url, superset_group, rest_seconds, sort_order,
        block_type, prescription_type, percent_1rm, progression_load_increment, progression_every_weeks,
        section, block_no, block_format, block_part,
        tracking_type, target_seconds, target_distance, target_calories
      )
      values (
        v_day_id,
        v_library,
        v_ex_name,
        public._import_int(v_ex, 'sets', 0, 1000),
        public._import_text(v_ex, 'reps', 40),
        case when public._import_number(v_ex, 'load') between 0 and 10000 then public._import_number(v_ex, 'load') end,
        case when public._import_number(v_ex, 'rpe') between 0 and 10 then public._import_number(v_ex, 'rpe') end,
        public._import_text(v_ex, 'notes', 2000),
        v_video,
        public._import_text(v_ex, 'superset_group', 40),
        public._import_int(v_ex, 'rest_seconds', 0, 3600),
        coalesce(public._import_int(v_ex, 'sort_order', -100000, 100000), 0),
        v_block_type,
        v_prescription,
        v_percent,
        case when public._import_number(v_ex, 'progression_load_increment') between -1000 and 1000 then public._import_number(v_ex, 'progression_load_increment') end,
        coalesce(public._import_int(v_ex, 'progression_every_weeks', 1, 52), 1),
        v_section,
        v_block_no,
        public._import_text(v_ex, 'block_format', 60),
        v_block_part,
        v_tracking,
        public._import_int(v_ex, 'target_seconds', 1, 86400),
        case when public._import_number(v_ex, 'target_distance') between 0.01 and 1000000 then public._import_number(v_ex, 'target_distance') end,
        case when public._import_number(v_ex, 'target_calories') between 0.01 and 100000 then public._import_number(v_ex, 'target_calories') end
      );
    end loop;
  end loop;

  return v_template;
end;
$fn$;

revoke execute on function public.import_program_template(jsonb) from public, anon;
grant execute on function public.import_program_template(jsonb) to authenticated;

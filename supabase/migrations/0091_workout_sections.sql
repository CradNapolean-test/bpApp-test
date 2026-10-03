-- Workout sections. A session is Warm-up, Lift (12 min), then Strong or Conditioning (20 min, as two
-- 10-minute blocks). Each exercise now says which section it belongs to; Strong and Conditioning
-- exercises also say which of the two blocks, and the block can carry a format (AMRAP, EMOM, ...).
--
-- Existing exercises default to 'lift', so every programme and template already built keeps showing
-- exactly as it did until a coach moves exercises into other sections.

alter table workout_exercises
  add column if not exists section text not null default 'lift'
    check (section in ('warmup', 'lift', 'strong', 'conditioning')),
  add column if not exists block_no smallint check (block_no in (1, 2)),
  add column if not exists block_format text;

alter table program_template_exercises
  add column if not exists section text not null default 'lift'
    check (section in ('warmup', 'lift', 'strong', 'conditioning')),
  add column if not exists block_no smallint check (block_no in (1, 2)),
  add column if not exists block_format text;

-- Starting a programme from a template copies the new fields across.
create or replace function public.instantiate_program_template(
  p_template_id uuid,
  p_client_id uuid,
  p_program_name text
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
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.gym_id <> public.my_gym_id() then
    raise exception 'Programme template not found';
  end if;

  select min(week_num) into v_min_week from program_template_days where template_id = p_template_id;

  insert into workout_programs (client_id, name)
  values (p_client_id, coalesce(nullif(p_program_name, ''), v_template.name))
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
        section, block_no, block_format
      )
      values (
        v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_applied_load, v_tex.rpe,
        v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order,
        v_tex.block_type, v_tex.prescription_type, v_tex.percent_1rm,
        v_tex.section, v_tex.block_no, v_tex.block_format
      );
    end loop;
  end loop;

  return v_program;
end;
$fn$;

-- Duplicating a template copies the new fields across too.
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
        section, block_no, block_format
      )
      values (
        v_new_day_id, v_ex.exercise_library_id, v_ex.name, v_ex.sets, v_ex.reps, v_ex.load, v_ex.rpe,
        v_ex.notes, v_ex.video_url, v_ex.superset_group, v_ex.rest_seconds, v_ex.sort_order,
        v_ex.block_type, v_ex.prescription_type, v_ex.percent_1rm,
        v_ex.progression_load_increment, v_ex.progression_every_weeks,
        v_ex.section, v_ex.block_no, v_ex.block_format
      );
    end loop;
  end loop;

  return v_new;
end;
$fn$;

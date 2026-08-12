-- Classes-linked workout day + client self-check-in. A workout program becomes a rolling
-- block anchored to a real start_date; classes link to a day-position (stable across every
-- week of the block, e.g. "Monday's class" always means "Day 1") so a client can check into
-- today's booked class and land straight in the matching week's version of that day.

alter table workout_programs add column start_date date;
-- Nullable: existing/unset programs simply aren't resolvable for check-in purposes yet, but
-- remain fully usable for manual logging/editing exactly as today. Block length is derived
-- from max(week_num) across the program's own days, not stored -- self-correcting if a coach
-- later adds a week.

alter table workout_program_days add column day_position integer;
alter table program_template_days add column day_position integer;
-- New, explicitly coach-authored "slot" number, stable across every week by definition (every
-- week's Monday shares the same day_position). day_label is free text and sort_order defaults
-- to 0 everywhere -- neither is a reliable ordinal today, so this is purely additive; nothing
-- existing depends on it.

alter table classes add column linked_day_position integer;
-- Not a foreign key -- a day-position number is only meaningful combined with whichever
-- client's program is currently active (resolved client-side, see lib/utils/checkin.ts), never
-- a fixed row. classes' existing "coach manages own classes" policy already covers writes to
-- this column, no RLS change needed.

-- Carry day_position through instantiation/duplication, same seam as when phase_label/notes
-- were added in 0020/0021 -- a coach sets position once per template, every program
-- instantiated from it inherits it automatically.
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
    insert into program_template_days (template_id, week_num, day_label, sort_order, phase_label, day_position)
    values (v_new.id, v_day.week_num, v_day.day_label, v_day.sort_order, v_day.phase_label, v_day.day_position)
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

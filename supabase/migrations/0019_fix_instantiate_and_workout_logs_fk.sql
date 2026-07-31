-- Two bug fixes, unrelated to any new feature, found while researching the workout builder
-- redesign:
--
-- 1. instantiate_program_template (0013) only ever inserted
--    (program_day_id, name, sets, reps, load, rpe, notes, video_url) into workout_exercises,
--    silently dropping superset_group, rest_seconds, sort_order and exercise_library_id even
--    though those columns were added later (0016) -- every program started from a template
--    lost its superset grouping, rest timers, and manual ordering (day sort_order too, since
--    the day-insert loop never carried it either).
--
-- 2. workout_logs.exercise_id has no `on delete` clause (defaults to NO ACTION), so once a
--    client has logged any set, deleting that exercise/day/program fails with a foreign-key
--    violation -- workout_logs was never part of the workout_programs -> ... ->
--    workout_exercises cascade chain the rest of the schema uses.

-- ---- fix 2: allow deleting exercises/days/programs that already have logged sets ----
-- Never explicitly named, so this is Postgres's default auto-generated name for an inline
-- `references` FK on this column; if this errors because the name differs, check the real
-- name via `\d workout_logs` in the SQL editor and substitute it here before rerunning.
alter table workout_logs drop constraint if exists workout_logs_exercise_id_fkey;
alter table workout_logs
  add constraint workout_logs_exercise_id_fkey
  foreign key (exercise_id) references workout_exercises(id) on delete set null;

-- ---- fix 1: carry every column across when instantiating a template onto a client ----
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
  v_tday record;
  v_new_day_id uuid;
  v_tex record;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.coach_id <> auth.uid() then
    raise exception 'Programme template not found';
  end if;

  insert into workout_programs (client_id, name)
  values (p_client_id, coalesce(nullif(p_program_name, ''), v_template.name))
  returning * into v_program;

  for v_tday in select * from program_template_days where template_id = p_template_id order by sort_order loop
    insert into workout_program_days (program_id, week_num, day_label, sort_order)
    values (v_program.id, v_tday.week_num, v_tday.day_label, v_tday.sort_order)
    returning id into v_new_day_id;

    for v_tex in select * from program_template_exercises where template_day_id = v_tday.id order by sort_order loop
      insert into workout_exercises (
        program_day_id, exercise_library_id, name, sets, reps, load, rpe,
        notes, video_url, superset_group, rest_seconds, sort_order
      )
      values (
        v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_tex.load, v_tex.rpe,
        v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order
      );
    end loop;
  end loop;

  return v_program;
end;
$$;

grant execute on function public.instantiate_program_template(uuid, uuid, text) to authenticated;

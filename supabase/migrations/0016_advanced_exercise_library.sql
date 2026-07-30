-- Advanced exercise library / programme templates: tagging + filtering, richer per-exercise
-- detail, supersets/rest timers, and template duplication + manual reordering.

alter table exercise_library add column muscle_group text;
alter table exercise_library add column equipment text;
alter table exercise_library add column instructions text;
alter table exercise_library add column image_url text;
alter table exercise_library add column default_rest_seconds integer;

alter table workout_exercises add column superset_group text;
alter table workout_exercises add column rest_seconds integer;
alter table workout_exercises add column sort_order integer not null default 0;

alter table program_template_exercises add column superset_group text;
alter table program_template_exercises add column rest_seconds integer;
alter table program_template_exercises add column sort_order integer not null default 0;

alter table workout_program_days add column sort_order integer not null default 0;
alter table program_template_days add column sort_order integer not null default 0;

-- Duplicates a template (name, days, exercises) for the same coach -- mirrors
-- instantiate_program_template's copy-loop but stays within program_template_* tables
-- rather than materializing a real client program.
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
    insert into program_template_days (template_id, week_num, day_label, sort_order)
    values (v_new.id, v_day.week_num, v_day.day_label, v_day.sort_order)
    returning id into v_new_day_id;

    for v_ex in select * from program_template_exercises where template_day_id = v_day.id order by sort_order loop
      insert into program_template_exercises (
        template_day_id, exercise_library_id, name, sets, reps, load, rpe,
        notes, video_url, superset_group, rest_seconds, sort_order
      )
      values (
        v_new_day_id, v_ex.exercise_library_id, v_ex.name, v_ex.sets, v_ex.reps, v_ex.load, v_ex.rpe,
        v_ex.notes, v_ex.video_url, v_ex.superset_group, v_ex.rest_seconds, v_ex.sort_order
      );
    end loop;
  end loop;

  return v_new;
end;
$$;

grant execute on function public.duplicate_program_template(uuid, text) to authenticated;

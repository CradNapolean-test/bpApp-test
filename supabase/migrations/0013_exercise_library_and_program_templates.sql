-- Exercise library (shared global catalog -- deliberately open, unlike the coach-scoped
-- tables fixed in 0012) and programme templates (per-coach, snapshot-copied onto a client
-- via instantiate_program_template, same shape as assign_form/assign_membership).

create table exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_sets integer,
  default_reps text,
  default_rpe numeric,
  video_url text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table exercise_library enable row level security;

create policy "authenticated users read exercise_library"
  on exercise_library for select
  to authenticated
  using (true);

create policy "authenticated coaches manage exercise_library"
  on exercise_library for all
  to authenticated
  using (true)
  with check (created_by = auth.uid());

create table program_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  name text not null,
  created_at timestamptz default now()
);

create table program_template_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references program_templates(id) on delete cascade,
  week_num integer not null,
  day_label text not null
);

create table program_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_day_id uuid not null references program_template_days(id) on delete cascade,
  exercise_library_id uuid references exercise_library(id),
  name text not null,
  sets integer,
  reps text,
  load numeric,
  rpe numeric,
  notes text,
  video_url text
);

alter table program_templates enable row level security;
alter table program_template_days enable row level security;
alter table program_template_exercises enable row level security;

create policy "coach or own-coach's clients read program_templates"
  on program_templates for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

create policy "coach manages own program_templates"
  on program_templates for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "coach or own-coach's clients read program_template_days"
  on program_template_days for select
  to authenticated
  using (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and (program_templates.coach_id = auth.uid() or program_templates.coach_id = my_coach_id())
    )
  );

create policy "coach manages own program_template_days"
  on program_template_days for all
  using (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and program_templates.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and program_templates.coach_id = auth.uid()
    )
  );

create policy "coach or own-coach's clients read program_template_exercises"
  on program_template_exercises for select
  to authenticated
  using (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and (program_templates.coach_id = auth.uid() or program_templates.coach_id = my_coach_id())
    )
  );

create policy "coach manages own program_template_exercises"
  on program_template_exercises for all
  using (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and program_templates.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and program_templates.coach_id = auth.uid()
    )
  );

-- Copies a template onto a real client program -- a snapshot, not a live reference, so
-- editing the template afterward never touches clients who already got it (matches
-- assign_membership's "close out, don't mutate" precedent rather than form_assignments'
-- live-linked shape, since a workout program is something a client keeps editing/logging
-- against day to day).
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

  for v_tday in select * from program_template_days where template_id = p_template_id loop
    insert into workout_program_days (program_id, week_num, day_label)
    values (v_program.id, v_tday.week_num, v_tday.day_label)
    returning id into v_new_day_id;

    for v_tex in select * from program_template_exercises where template_day_id = v_tday.id loop
      insert into workout_exercises (program_day_id, name, sets, reps, load, rpe, notes, video_url)
      values (v_new_day_id, v_tex.name, v_tex.sets, v_tex.reps, v_tex.load, v_tex.rpe, v_tex.notes, v_tex.video_url);
    end loop;
  end loop;

  return v_program;
end;
$$;

grant execute on function public.instantiate_program_template(uuid, uuid, text) to authenticated;

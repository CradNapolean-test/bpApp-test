-- Programme rollouts: from a template, pick a start date and who gets it ("everyone at the gym" or
-- chosen members). On the start date each person gets their own copy, starting that day, and it
-- becomes their current programme (the one with the latest start date that has begun).
--
-- Old programmes are never touched, so every weight and rep already logged stays on file.

create table if not exists programme_rollouts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id) on delete cascade,
  template_id uuid not null references program_templates(id) on delete cascade,
  program_name text not null,
  start_date date not null,
  audience text not null check (audience in ('all', 'selected')),
  client_ids uuid[] not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table programme_rollouts enable row level security;

drop policy if exists "gym coaches manage programme_rollouts" on programme_rollouts;
create policy "gym coaches manage programme_rollouts"
  on programme_rollouts for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

alter table workout_programs add column if not exists rollout_id uuid references programme_rollouts(id) on delete set null;

-- Copies a template into a client's programme. No permission check of its own: only the functions
-- below call it, after they have checked.
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
        section, block_no, block_format, block_part
      )
      values (
        v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_applied_load, v_tex.rpe,
        v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order,
        v_tex.block_type, v_tex.prescription_type, v_tex.percent_1rm,
        v_tex.section, v_tex.block_no, v_tex.block_format, v_tex.block_part
      );
    end loop;
  end loop;

  return v_program;
end;
$fn$;

revoke all on function public.instantiate_template_core(uuid, uuid, text, date, uuid) from public, anon, authenticated;

-- Starting one client on a template now takes a start date (null keeps the old behaviour).
drop function if exists public.instantiate_program_template(uuid, uuid, text);

create or replace function public.instantiate_program_template(
  p_template_id uuid,
  p_client_id uuid,
  p_program_name text,
  p_start_date date default null
)
returns workout_programs
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_template program_templates;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.gym_id <> public.my_gym_id() then
    raise exception 'Programme template not found';
  end if;

  return public.instantiate_template_core(p_template_id, p_client_id, p_program_name, p_start_date, null);
end;
$fn$;

grant execute on function public.instantiate_program_template(uuid, uuid, text, date) to authenticated;

-- Gives a rollout to everyone it covers who does not have it yet. A coach at the gym can run it (for
-- "start today"); the daily job runs it with no user (auth.uid() is null).
create or replace function public.apply_programme_rollout(p_rollout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r programme_rollouts;
  v_client uuid;
  v_count integer := 0;
begin
  select * into v_r from programme_rollouts where id = p_rollout_id;
  if v_r.id is null then
    raise exception 'Rollout not found';
  end if;
  if auth.uid() is not null and v_r.gym_id <> public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if v_r.applied_at is not null then
    return 0;
  end if;

  for v_client in
    select c.id
    from profiles c
    where c.role = 'client'
      and exists (select 1 from profiles coach where coach.id = c.coach_id and coach.gym_id = v_r.gym_id)
      and (v_r.audience = 'all' or c.id = any(v_r.client_ids))
      and not exists (select 1 from workout_programs wp where wp.client_id = c.id and wp.rollout_id = v_r.id)
  loop
    perform public.instantiate_template_core(v_r.template_id, v_client, v_r.program_name, v_r.start_date, v_r.id);
    v_count := v_count + 1;
  end loop;

  update programme_rollouts set applied_at = now() where id = v_r.id;
  return v_count;
end;
$fn$;

grant execute on function public.apply_programme_rollout(uuid) to authenticated;

-- Daily job: applies every rollout whose start date has arrived in its gym's timezone.
create or replace function public.apply_due_programme_rollouts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r record;
  v_total integer := 0;
begin
  if auth.uid() is not null then
    raise exception 'Not authorized';
  end if;

  for v_r in
    select pr.id
    from programme_rollouts pr
    join gyms g on g.id = pr.gym_id
    where pr.applied_at is null
      and pr.start_date <= (now() at time zone g.timezone)::date
  loop
    v_total := v_total + public.apply_programme_rollout(v_r.id);
  end loop;

  return v_total;
end;
$fn$;

revoke all on function public.apply_due_programme_rollouts() from public, anon, authenticated;

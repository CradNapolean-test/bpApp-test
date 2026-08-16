-- Gym-shared libraries: classes, membership_packages, form_templates (+questions),
-- program_templates (+days/exercises), education_courses (+modules/lessons), client_groups
-- (+members) and scheduled_communications move from per-coach ownership to gym-wide sharing --
-- any coach at a gym can now see and manage all of these, not just the ones they personally
-- created. `coach_id` stays on each table (now just "created by", no longer access-gating).
--
-- exercise_library is deliberately left alone -- it was already app-wide shared before gyms
-- existed (see 0013's comment), which already exceeds what's needed here.

-- ============ classes ============
alter table classes add column gym_id uuid references gyms(id);
update classes set gym_id = (select gym_id from profiles where id = classes.coach_id);
alter table classes alter column gym_id set not null;

drop policy "coach or own-coach's clients read classes" on classes;
drop policy "coach manages own classes" on classes;

create policy "gym reads classes"
  on classes for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage classes"
  on classes for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ============ class_exceptions (join through classes) ============
drop policy "coach manages own class_exceptions" on class_exceptions;

create policy "gym coaches manage class_exceptions"
  on class_exceptions for all
  using (exists (select 1 from classes where classes.id = class_exceptions.class_id and classes.gym_id = public.my_gym_id()))
  with check (exists (select 1 from classes where classes.id = class_exceptions.class_id and classes.gym_id = public.my_gym_id()));

-- ============ membership_packages ============
alter table membership_packages add column gym_id uuid references gyms(id);
update membership_packages set gym_id = (select gym_id from profiles where id = membership_packages.coach_id);
alter table membership_packages alter column gym_id set not null;

drop policy "coach or own-coach's clients read membership_packages" on membership_packages;
drop policy "coach manages own membership_packages" on membership_packages;

create policy "gym reads membership_packages"
  on membership_packages for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage membership_packages"
  on membership_packages for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ============ form_templates + form_questions ============
alter table form_templates add column gym_id uuid references gyms(id);
update form_templates set gym_id = (select gym_id from profiles where id = form_templates.coach_id);
alter table form_templates alter column gym_id set not null;

-- Multiple coaches at the same gym may each have had their own default onboarding form (the
-- old index was per-coach) -- collapse to one default per gym before the new gym-scoped
-- unique index can be created, keeping the earliest-created one and unsetting the rest.
with ranked as (
  select id, row_number() over (partition by gym_id order by created_at) as rn
  from form_templates
  where is_default_onboarding
)
update form_templates
set is_default_onboarding = false
where id in (select id from ranked where rn > 1);

drop index one_default_onboarding_form_per_coach;
create unique index one_default_onboarding_form_per_gym
  on form_templates (gym_id)
  where is_default_onboarding;

drop policy "coach or own-coach's clients read form_templates" on form_templates;
drop policy "coach manages own form_templates" on form_templates;

create policy "gym reads form_templates"
  on form_templates for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage form_templates"
  on form_templates for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

drop policy "coach or own-coach's clients read form_questions" on form_questions;
drop policy "coach manages form_questions" on form_questions;

create policy "gym reads form_questions"
  on form_questions for select
  using (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and (form_templates.gym_id = public.my_gym_id() or form_templates.gym_id = public.client_gym_id(auth.uid()))
    )
  );

create policy "gym coaches manage form_questions"
  on form_questions for all
  using (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and form_templates.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and form_templates.gym_id = public.my_gym_id()
    )
  );

-- ============ program_templates + days + exercises ============
alter table program_templates add column gym_id uuid references gyms(id);
update program_templates set gym_id = (select gym_id from profiles where id = program_templates.coach_id);
alter table program_templates alter column gym_id set not null;

drop policy "coach or own-coach's clients read program_templates" on program_templates;
drop policy "coach manages own program_templates" on program_templates;

create policy "gym reads program_templates"
  on program_templates for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage program_templates"
  on program_templates for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

drop policy "coach or own-coach's clients read program_template_days" on program_template_days;
drop policy "coach manages own program_template_days" on program_template_days;

create policy "gym reads program_template_days"
  on program_template_days for select
  using (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and (program_templates.gym_id = public.my_gym_id() or program_templates.gym_id = public.client_gym_id(auth.uid()))
    )
  );

create policy "gym coaches manage program_template_days"
  on program_template_days for all
  using (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and program_templates.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from program_templates
      where program_templates.id = program_template_days.template_id
      and program_templates.gym_id = public.my_gym_id()
    )
  );

drop policy "coach or own-coach's clients read program_template_exercises" on program_template_exercises;
drop policy "coach manages own program_template_exercises" on program_template_exercises;

create policy "gym reads program_template_exercises"
  on program_template_exercises for select
  using (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and (program_templates.gym_id = public.my_gym_id() or program_templates.gym_id = public.client_gym_id(auth.uid()))
    )
  );

create policy "gym coaches manage program_template_exercises"
  on program_template_exercises for all
  using (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and program_templates.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from program_template_days
      join program_templates on program_templates.id = program_template_days.template_id
      where program_template_days.id = program_template_exercises.template_day_id
      and program_templates.gym_id = public.my_gym_id()
    )
  );

-- ============ education_courses + modules + lessons ============
alter table education_courses add column gym_id uuid references gyms(id);
update education_courses set gym_id = (select gym_id from profiles where id = education_courses.coach_id);
alter table education_courses alter column gym_id set not null;

drop policy "coach or own-coach's clients read education_courses" on education_courses;
drop policy "coach manages own education_courses" on education_courses;

create policy "gym reads education_courses"
  on education_courses for select
  using (gym_id = public.my_gym_id() or gym_id = public.client_gym_id(auth.uid()));

create policy "gym coaches manage education_courses"
  on education_courses for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

drop policy "coach or own-coach's clients read education_modules" on education_modules;
drop policy "coach manages own education_modules" on education_modules;

create policy "gym reads education_modules"
  on education_modules for select
  using (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and (education_courses.gym_id = public.my_gym_id() or education_courses.gym_id = public.client_gym_id(auth.uid()))
    )
  );

create policy "gym coaches manage education_modules"
  on education_modules for all
  using (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and education_courses.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and education_courses.gym_id = public.my_gym_id()
    )
  );

drop policy "coach or own-coach's clients read education_lessons" on education_lessons;
drop policy "coach manages own education_lessons" on education_lessons;

create policy "gym reads education_lessons"
  on education_lessons for select
  using (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and (education_courses.gym_id = public.my_gym_id() or education_courses.gym_id = public.client_gym_id(auth.uid()))
    )
  );

create policy "gym coaches manage education_lessons"
  on education_lessons for all
  using (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and education_courses.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and education_courses.gym_id = public.my_gym_id()
    )
  );

-- ============ client_groups + client_group_members ============
-- Coach-only on every operation, no client access -- unchanged in kind, just gym-wide now
-- instead of per-coach (matches this table's existing "clients never see their groups" intent).
alter table client_groups add column gym_id uuid references gyms(id);
update client_groups set gym_id = (select gym_id from profiles where id = client_groups.coach_id);
alter table client_groups alter column gym_id set not null;

drop policy "coach manages own client_groups" on client_groups;

create policy "gym coaches manage client_groups"
  on client_groups for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

drop policy "coach manages own client_group_members" on client_group_members;

create policy "gym coaches manage client_group_members"
  on client_group_members for all
  using (
    exists (
      select 1 from client_groups
      where client_groups.id = client_group_members.group_id
      and client_groups.gym_id = public.my_gym_id()
    )
  )
  with check (
    exists (
      select 1 from client_groups
      where client_groups.id = client_group_members.group_id
      and client_groups.gym_id = public.my_gym_id()
    )
  );

-- ============ scheduled_communications ============
-- Also coach-only, no client access -- gym-wide now.
alter table scheduled_communications add column gym_id uuid references gyms(id);
update scheduled_communications set gym_id = (select gym_id from profiles where id = scheduled_communications.coach_id);
alter table scheduled_communications alter column gym_id set not null;

drop policy "coach manages own scheduled_communications" on scheduled_communications;

create policy "gym coaches manage scheduled_communications"
  on scheduled_communications for all
  using (gym_id = public.my_gym_id())
  with check (gym_id = public.my_gym_id());

-- ============ RPC updates ============
-- Every RPC below did a direct `<table>.coach_id = auth.uid()` (or similar) ownership check
-- against a now gym-shared table. Swap each for the equivalent gym_id = my_gym_id() check --
-- signatures and bodies otherwise unchanged from their last definition (0041/0051/0008/0026/0024).

create or replace function public.mark_attendance(p_booking_id uuid, p_attended boolean)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1 from classes
    where classes.id = v_booking.class_id
    and classes.gym_id = public.my_gym_id()
  ) then
    raise exception 'Not authorized';
  end if;

  update bookings
  set attended = p_attended, attended_at = case when p_attended then now() else null end
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.mark_attendance_status(p_booking_id uuid, p_status text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  if p_status not in ('unmarked', 'attended', 'no_show') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1 from classes
    where classes.id = v_booking.class_id
    and classes.gym_id = public.my_gym_id()
  ) then
    raise exception 'Not authorized';
  end if;

  update bookings
  set
    attended = (p_status = 'attended'),
    no_show = (p_status = 'no_show'),
    attended_at = case when p_status = 'attended' then now() else null end
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_count integer := 0;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if v_class.gym_id != public.my_gym_id() then
    raise exception 'Not authorized';
  end if;

  insert into class_exceptions (class_id, occurrence_date, cancelled_by)
  values (p_class_id, p_date, auth.uid())
  on conflict (class_id, occurrence_date) do nothing;

  for v_booking in
    select id, client_id, status
    from bookings
    where class_id = p_class_id
    and booking_date = p_date
    and status in ('booked', 'waitlist')
  loop
    if v_booking.status = 'booked' then
      insert into credits_ledger (client_id, delta, reason)
      values (v_booking.client_id, v_class.credit_cost, 'Refunded ' || v_class.name || ' (cancelled)');
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (v_booking.client_id, 'Class cancelled: ' || v_class.name || ' on ' || p_date || '.');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.assign_form(p_template_id uuid, p_client_id uuid)
returns form_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template form_templates;
  v_assignment form_assignments;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from form_templates where id = p_template_id;
  if v_template is null or v_template.gym_id <> public.my_gym_id() then
    raise exception 'Form template not found';
  end if;

  insert into form_assignments (template_id, client_id)
  values (p_template_id, p_client_id)
  returning * into v_assignment;

  insert into notifications (client_id, message)
  values (p_client_id, 'You have a new form to fill out: ' || v_template.name);

  return v_assignment;
end;
$$;

create or replace function public.assign_education_course(p_course_id uuid, p_client_id uuid)
returns education_course_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course education_courses;
  v_assignment education_course_assignments;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_course from education_courses where id = p_course_id;
  if v_course is null or v_course.gym_id <> public.my_gym_id() then
    raise exception 'Course not found';
  end if;

  insert into education_course_assignments (course_id, client_id)
  values (p_course_id, p_client_id)
  returning * into v_assignment;

  insert into notifications (client_id, message)
  values (p_client_id, 'New course assigned: ' || v_course.title);

  return v_assignment;
end;
$$;

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

-- "all_clients" broadcasts now mean "every client at the gym", not just the sending coach's
-- own roster, since scheduled_communications is gym-shared -- resolve via the comm's own
-- gym_id (set at insert time) rather than v_comm.coach_id.
create or replace function public.send_due_communications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm record;
  v_client_id uuid;
  v_count integer := 0;
begin
  for v_comm in
    select id, coach_id, gym_id, message, target_type, target_group_id
    from scheduled_communications
    where sent_at is null and send_at <= now()
    for update skip locked
  loop
    if v_comm.target_type = 'all_clients' then
      for v_client_id in
        select client.id
        from profiles client
        join profiles coach on coach.id = client.coach_id
        where coach.gym_id = v_comm.gym_id
      loop
        insert into chat_messages (client_id, sender_id, text) values (v_client_id, v_comm.coach_id, v_comm.message);
        v_count := v_count + 1;
      end loop;
    else
      for v_client_id in select client_id from client_group_members where group_id = v_comm.target_group_id loop
        insert into chat_messages (client_id, sender_id, text) values (v_client_id, v_comm.coach_id, v_comm.message);
        v_count := v_count + 1;
      end loop;
    end if;
    update scheduled_communications set sent_at = now() where id = v_comm.id;
  end loop;
  return v_count;
end;
$$;

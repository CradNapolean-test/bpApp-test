-- Education rebuild: replaces the old flat education_content/education_assignments model
-- with a real course -> module -> lesson structure (ordering, per-lesson completion rolling
-- up to a course completion %, simple date-based unlock). No real production content exists
-- yet, so the old tables/functions are dropped rather than migrated.

drop function if exists public.mark_education_complete(uuid);
drop function if exists public.assign_education_content(uuid, uuid);
drop table if exists education_assignments;
drop table if exists education_content;

-- ============ education_courses ============
create table education_courses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  title text not null,
  description text,
  created_at timestamptz default now()
);

alter table education_courses enable row level security;

create policy "coach or own-coach's clients read education_courses"
  on education_courses for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

create policy "coach manages own education_courses"
  on education_courses for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- ============ education_modules ============
create table education_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references education_courses(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0
);

alter table education_modules enable row level security;

create policy "coach or own-coach's clients read education_modules"
  on education_modules for select
  to authenticated
  using (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and (education_courses.coach_id = auth.uid() or education_courses.coach_id = my_coach_id())
    )
  );

create policy "coach manages own education_modules"
  on education_modules for all
  using (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and education_courses.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from education_courses
      where education_courses.id = education_modules.course_id
      and education_courses.coach_id = auth.uid()
    )
  );

-- ============ education_lessons ============
create table education_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references education_modules(id) on delete cascade,
  title text not null,
  body text,
  link_url text,
  sort_order integer not null default 0,
  unlock_at date -- nullable; null = available as soon as the course is assigned
);

alter table education_lessons enable row level security;

create policy "coach or own-coach's clients read education_lessons"
  on education_lessons for select
  to authenticated
  using (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and (education_courses.coach_id = auth.uid() or education_courses.coach_id = my_coach_id())
    )
  );

create policy "coach manages own education_lessons"
  on education_lessons for all
  using (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and education_courses.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from education_modules
      join education_courses on education_courses.id = education_modules.course_id
      where education_modules.id = education_lessons.module_id
      and education_courses.coach_id = auth.uid()
    )
  );

-- ============ education_course_assignments ============
create table education_course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references education_courses(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  assigned_at timestamptz default now()
);

alter table education_course_assignments enable row level security;

create policy "select own or coached education_course_assignments"
  on education_course_assignments for select
  using (owns_client(client_id));

-- ============ education_lesson_completions ============
-- Plain client-owned insert/delete (is_self) -- unlike assignment, this needs no coach-side
-- write path or RPC, mirrors habit_logs' shape.
create table education_lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references education_lessons(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (lesson_id, client_id)
);

alter table education_lesson_completions enable row level security;

create policy "select own or coached education_lesson_completions"
  on education_lesson_completions for select
  using (owns_client(client_id));

create policy "client marks own education_lesson_completions"
  on education_lesson_completions for insert
  with check (is_self(client_id));

create policy "client unmarks own education_lesson_completions"
  on education_lesson_completions for delete
  using (is_self(client_id));

-- ============ assign_education_course ============
-- Direct port of the old assign_education_content RPC, pointed at courses instead.
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
  if v_course is null or v_course.coach_id <> auth.uid() then
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

grant execute on function public.assign_education_course(uuid, uuid) to authenticated;

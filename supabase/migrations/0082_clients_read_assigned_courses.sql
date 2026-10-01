-- Same problem 0079 fixed for forms: a member could only read an education course (and its modules
-- and lessons) if it belonged to their *current* gym. A course assigned to them from another gym
-- (or before they moved) came back as null and the whole Resources screen crashed. A member can now
-- always read a course assigned to them, plus its modules and lessons. This only widens read access
-- to courses they were given, never anyone else's.

drop policy if exists "clients read their assigned education_courses" on public.education_courses;
create policy "clients read their assigned education_courses"
  on public.education_courses for select
  using (
    exists (
      select 1 from public.education_course_assignments a
      where a.course_id = education_courses.id and a.client_id = auth.uid()
    )
  );

drop policy if exists "clients read their assigned education_modules" on public.education_modules;
create policy "clients read their assigned education_modules"
  on public.education_modules for select
  using (
    exists (
      select 1 from public.education_course_assignments a
      where a.course_id = education_modules.course_id and a.client_id = auth.uid()
    )
  );

drop policy if exists "clients read their assigned education_lessons" on public.education_lessons;
create policy "clients read their assigned education_lessons"
  on public.education_lessons for select
  using (
    exists (
      select 1
      from public.education_modules m
      join public.education_course_assignments a on a.course_id = m.course_id
      where m.id = education_lessons.module_id and a.client_id = auth.uid()
    )
  );

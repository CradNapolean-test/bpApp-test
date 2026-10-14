-- Members could read EVERY course, module and lesson in their gym, not just the ones assigned to them: the "gym reads"
-- policies from 0054 also matched gym_id = client_gym_id(auth.uid()). Members already get their assigned courses through
-- the "clients read their assigned ..." policies (and the web reads them only through that assignment join), so the
-- member branch is removed here. Coaches keep full read access through my_gym_id().

drop policy if exists "gym reads education_courses" on public.education_courses;
create policy "gym reads education_courses"
  on public.education_courses for select
  using (gym_id = public.my_gym_id());

drop policy if exists "gym reads education_modules" on public.education_modules;
create policy "gym reads education_modules"
  on public.education_modules for select
  using (exists (
    select 1 from public.education_courses c
    where c.id = education_modules.course_id and c.gym_id = public.my_gym_id()
  ));

drop policy if exists "gym reads education_lessons" on public.education_lessons;
create policy "gym reads education_lessons"
  on public.education_lessons for select
  using (exists (
    select 1 from public.education_modules m
    join public.education_courses c on c.id = m.course_id
    where m.id = education_lessons.module_id and c.gym_id = public.my_gym_id()
  ));

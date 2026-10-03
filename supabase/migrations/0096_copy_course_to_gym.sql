-- Copy an education course (modules and lessons, not assignments) into another gym the coach also belongs
-- to, as an independent copy that gym can edit. Refuses if that gym already has a course with the same title.

create or replace function public.copy_education_course_to_gym(p_course_id uuid, p_target_gym_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_course education_courses;
  v_new uuid;
  v_mod record;
  v_new_mod uuid;
begin
  select * into v_course from education_courses where id = p_course_id;
  if v_course.id is null or v_course.gym_id <> public.my_gym_id() then
    raise exception 'Course not found';
  end if;
  if p_target_gym_id = v_course.gym_id then
    raise exception 'That course is already in this gym';
  end if;
  if not exists (
    select 1 from coach_gym_memberships where coach_id = auth.uid() and gym_id = p_target_gym_id
  ) then
    raise exception 'You are not a coach at that gym';
  end if;
  if exists (select 1 from education_courses where gym_id = p_target_gym_id and title = v_course.title) then
    raise exception 'That gym already has a course called "%"', v_course.title;
  end if;

  insert into education_courses (coach_id, gym_id, title, description)
  values (auth.uid(), p_target_gym_id, v_course.title, v_course.description)
  returning id into v_new;

  for v_mod in select * from education_modules where course_id = p_course_id order by sort_order loop
    insert into education_modules (course_id, title, sort_order)
    values (v_new, v_mod.title, v_mod.sort_order)
    returning id into v_new_mod;

    insert into education_lessons (module_id, title, body, link_url, unlock_at, sort_order)
    select v_new_mod, title, body, link_url, unlock_at, sort_order
    from education_lessons
    where module_id = v_mod.id;
  end loop;

  return v_new;
end;
$fn$;

grant execute on function public.copy_education_course_to_gym(uuid, uuid) to authenticated;

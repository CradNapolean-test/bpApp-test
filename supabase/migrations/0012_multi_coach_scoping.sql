-- Multi-coach scoping: today "classes", "membership_packages", "form_templates" and
-- "form_questions" all have a select policy open to *any* authenticated user regardless of
-- which coach they belong to (fine for a single-coach app, a real leak once a second coach
-- exists). Every other client-data table is already properly scoped through
-- is_self/is_coach_of/owns_client -- this migration closes the remaining four gaps.

create function public.my_coach_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coach_id from profiles where id = auth.uid();
$$;

drop policy "authenticated users read classes" on classes;
create policy "coach or own-coach's clients read classes"
  on classes for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

drop policy "authenticated users read membership_packages" on membership_packages;
create policy "coach or own-coach's clients read membership_packages"
  on membership_packages for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

drop policy "authenticated users read form_templates" on form_templates;
create policy "coach or own-coach's clients read form_templates"
  on form_templates for select
  to authenticated
  using (coach_id = auth.uid() or coach_id = my_coach_id());

drop policy "authenticated users read form_questions" on form_questions;
create policy "coach or own-coach's clients read form_questions"
  on form_questions for select
  to authenticated
  using (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and (form_templates.coach_id = auth.uid() or form_templates.coach_id = my_coach_id())
    )
  );

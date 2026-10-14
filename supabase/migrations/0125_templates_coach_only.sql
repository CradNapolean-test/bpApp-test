-- Members could read every form template and every programme template in their gym: the "gym reads" policies from 0054
-- also matched gym_id = client_gym_id(auth.uid()). Members do not need that:
--   * forms they are given are readable through the "clients read their assigned form_*" policies;
--   * a programme is copied into the member's own workout_programs when a coach starts it (instantiate_* run as the
--     function owner and are coach-only), so members never read programme templates.
-- The member branch is removed. Coaches keep full access through my_gym_id().

drop policy if exists "gym reads form_templates" on public.form_templates;
create policy "gym reads form_templates"
  on public.form_templates for select
  using (gym_id = public.my_gym_id());

drop policy if exists "gym reads form_questions" on public.form_questions;
create policy "gym reads form_questions"
  on public.form_questions for select
  using (exists (
    select 1 from public.form_templates t
    where t.id = form_questions.template_id and t.gym_id = public.my_gym_id()
  ));

drop policy if exists "gym reads program_templates" on public.program_templates;
create policy "gym reads program_templates"
  on public.program_templates for select
  using (gym_id = public.my_gym_id());

drop policy if exists "gym reads program_template_days" on public.program_template_days;
create policy "gym reads program_template_days"
  on public.program_template_days for select
  using (exists (
    select 1 from public.program_templates t
    where t.id = program_template_days.template_id and t.gym_id = public.my_gym_id()
  ));

drop policy if exists "gym reads program_template_exercises" on public.program_template_exercises;
create policy "gym reads program_template_exercises"
  on public.program_template_exercises for select
  using (exists (
    select 1
    from public.program_template_days d
    join public.program_templates t on t.id = d.template_id
    where d.id = program_template_exercises.template_day_id and t.gym_id = public.my_gym_id()
  ));

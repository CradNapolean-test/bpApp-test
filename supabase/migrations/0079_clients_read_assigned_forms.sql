-- A member could only read a form template (and its questions) if it belonged to the gym of their
-- *current* coach. If a member moved sites, or their coach changed to one at another gym, forms
-- already assigned to them -- even ones they had completed -- silently disappeared from their Forms
-- tab ("No forms assigned yet"). A member can now always read the template and questions of any form
-- assigned to them. This only widens read access to forms they were given, never anyone else's.

drop policy if exists "clients read their assigned form_templates" on public.form_templates;
create policy "clients read their assigned form_templates"
  on public.form_templates for select
  using (
    exists (
      select 1 from public.form_assignments a
      where a.template_id = form_templates.id and a.client_id = auth.uid()
    )
  );

drop policy if exists "clients read their assigned form_questions" on public.form_questions;
create policy "clients read their assigned form_questions"
  on public.form_questions for select
  using (
    exists (
      select 1 from public.form_assignments a
      where a.template_id = form_questions.template_id and a.client_id = auth.uid()
    )
  );

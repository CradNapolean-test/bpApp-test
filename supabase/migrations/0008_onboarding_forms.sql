-- Client onboarding / intake forms. Coach builds a reusable form template
-- (form_templates + form_questions), assigns it to a client (form_assignments), the client
-- fills it out (form_responses). Mirrors the membership_packages / client_memberships shape:
-- a coach-global "thing" assigned per-client via a security-definer RPC.

-- ============ Form templates (coach-global, like membership_packages) ============
create table form_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id),
  name text not null,
  description text,
  is_default_onboarding boolean not null default false,
  created_at timestamptz default now()
);

-- At most one default onboarding form per coach.
create unique index one_default_onboarding_form_per_coach
  on form_templates (coach_id)
  where is_default_onboarding;

alter table form_templates enable row level security;

create policy "authenticated users read form_templates"
  on form_templates for select
  to authenticated
  using (true);

create policy "coach manages own form_templates"
  on form_templates for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- ============ Form questions ============
create table form_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  order_index integer not null,
  question_text text not null,
  question_type text not null check (
    question_type in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice')
  ),
  options jsonb, -- array of strings, only meaningful for single_choice/multi_choice
  required boolean not null default true
);

alter table form_questions enable row level security;

create policy "authenticated users read form_questions"
  on form_questions for select
  to authenticated
  using (true);

create policy "coach manages form_questions"
  on form_questions for all
  using (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and form_templates.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from form_templates
      where form_templates.id = form_questions.template_id
      and form_templates.coach_id = auth.uid()
    )
  );

-- ============ Form assignments (client-scoped, like client_memberships) ============
create table form_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  assigned_at timestamptz default now(),
  completed_at timestamptz -- null = pending
);

alter table form_assignments enable row level security;

-- Deliberately no client-facing write policy -- writes only ever happen via the admin
-- client (new-client auto-assignment) or the assign_form/submit_form_response RPCs below,
-- same reasoning notifications has no authenticated insert policy today.
create policy "select own or coached form_assignments"
  on form_assignments for select
  using (owns_client(client_id));

-- ============ Form responses ============
create table form_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references form_assignments(id) on delete cascade,
  question_id uuid not null references form_questions(id) on delete cascade,
  answer jsonb not null,
  unique (assignment_id, question_id)
);

alter table form_responses enable row level security;

-- Select-only -- only submit_form_response (security definer) writes these.
create policy "select own or coached form_responses"
  on form_responses for select
  using (
    exists (
      select 1 from form_assignments
      where form_assignments.id = form_responses.assignment_id
      and owns_client(form_assignments.client_id)
    )
  );

-- ============ RPCs ============

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
  if v_template is null or v_template.coach_id <> auth.uid() then
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

grant execute on function public.assign_form(uuid, uuid) to authenticated;

-- p_answers shape: jsonb array of {"question_id": uuid, "answer": <jsonb>}.
create or replace function public.submit_form_response(p_assignment_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment form_assignments;
  v_answer record;
begin
  select * into v_assignment from form_assignments where id = p_assignment_id;
  if v_assignment is null or not is_self(v_assignment.client_id) then
    raise exception 'Not authorized';
  end if;
  if v_assignment.completed_at is not null then
    raise exception 'Form already submitted';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, answer jsonb)
  loop
    insert into form_responses (assignment_id, question_id, answer)
    values (p_assignment_id, v_answer.question_id, v_answer.answer);
  end loop;

  update form_assignments set completed_at = now() where id = p_assignment_id;
end;
$$;

grant execute on function public.submit_form_response(uuid, jsonb) to authenticated;

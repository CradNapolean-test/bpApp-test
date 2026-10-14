-- Forms, onboarding and the daily check-in, for the phone app (slice 7b; see docs/SECURITY_DEFINER_AUDIT.md).
--
-- 1. submit_form_response took ANY question id and ANY answer. A member could attach an answer to a question of some other
--    form (the foreign key only checks that the question exists) and send answers of unlimited size. It now accepts only
--    questions that belong to the form assigned, no more answers than the form has questions, an answer of the right
--    shape for the question (text for text and single-choice, a number for a number, a list of text for multi-choice)
--    and no answer over 8,000 characters. Everything else it did is unchanged (own assignment only, once only).
--
-- 2. New members are handed their gym's default onboarding form when they finish onboarding. The web does that on its own
--    server with a service-role key; a phone has no such server and must not hold that key. assign_default_onboarding_form()
--    does the same thing for the SIGNED-IN member only: it never takes a member id, does nothing for coaches or owners,
--    does nothing if there is no default form or it was already assigned, and is not callable by anon.
--
-- 3. Limits on what a member can type, so a direct API call cannot store unbounded text or absurd figures:
--      daily_logs: sleep 0-24 h, steps 0-100,000, water 0-15 L, bodyweight 20-400 kg, notes up to 1,000 characters;
--      client_profiles: name 100, phone 30, address 300, emergency contact name 100 / number 30, goal 5,000, experience
--      2,000, health notes 2,000 characters; height 100-250 cm.
--    The app checks the same limits first and shows a friendly message. The constraints are NOT VALID: they apply to every
--    new and changed row, and leave rows already stored alone (an old out-of-range row can still be read, and is only
--    refused when someone saves it again).

-- ---- 1. form answers ----

create or replace function public.submit_form_response(p_assignment_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment form_assignments;
  v_answer record;
  v_question form_questions;
  v_questions integer;
begin
  select * into v_assignment from form_assignments where id = p_assignment_id;
  if v_assignment is null or not coalesce(is_self(v_assignment.client_id), false) then
    raise exception 'Not authorized';
  end if;
  if v_assignment.completed_at is not null then
    raise exception 'Form already submitted';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'The answers must be a list';
  end if;

  select count(*) into v_questions from form_questions where template_id = v_assignment.template_id;
  if jsonb_array_length(p_answers) > v_questions then
    raise exception 'More answers than the form has questions';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, answer jsonb)
  loop
    select * into v_question
    from form_questions
    where id = v_answer.question_id and template_id = v_assignment.template_id;
    if v_question is null then
      raise exception 'That question is not part of this form';
    end if;
    if v_answer.answer is null or jsonb_typeof(v_answer.answer) = 'null' then
      raise exception 'An answer cannot be empty';
    end if;
    if char_length(v_answer.answer::text) > 8000 then
      raise exception 'That answer is too long';
    end if;
    if v_question.question_type in ('short_text', 'long_text', 'single_choice') and jsonb_typeof(v_answer.answer) <> 'string' then
      raise exception 'That answer should be text';
    end if;
    if v_question.question_type = 'number' and jsonb_typeof(v_answer.answer) <> 'number' then
      raise exception 'That answer should be a number';
    end if;
    if v_question.question_type = 'multi_choice' and (
      jsonb_typeof(v_answer.answer) <> 'array'
      or exists (select 1 from jsonb_array_elements(v_answer.answer) e where jsonb_typeof(e) <> 'string')
    ) then
      raise exception 'That answer should be a list of choices';
    end if;

    insert into form_responses (assignment_id, question_id, answer)
    values (p_assignment_id, v_answer.question_id, v_answer.answer);
  end loop;

  update form_assignments set completed_at = now() where id = p_assignment_id;
end;
$$;

-- ---- 2. the default onboarding form for the member who just finished onboarding ----

create or replace function public.assign_default_onboarding_form()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_gym uuid;
  v_template form_templates;
begin
  if v_me is null then
    raise exception 'Not authorized';
  end if;

  -- Members only, in their own gym. Anyone else (coach, owner) quietly gets nothing.
  select gym_id into v_gym from profiles where id = v_me and role = 'client';
  if v_gym is null then
    return;
  end if;

  select * into v_template from form_templates where gym_id = v_gym and is_default_onboarding limit 1;
  if v_template is null then
    return;
  end if;

  -- Once only: whether it is still pending or already filled in.
  if exists (select 1 from form_assignments where template_id = v_template.id and client_id = v_me) then
    return;
  end if;

  insert into form_assignments (template_id, client_id) values (v_template.id, v_me);
  insert into notifications (client_id, message) values (v_me, 'Welcome! Please fill out: ' || v_template.name);
end;
$$;

revoke execute on function public.assign_default_onboarding_form() from public, anon;
grant execute on function public.assign_default_onboarding_form() to authenticated;

-- ---- 3. limits ----

alter table public.daily_logs drop constraint if exists daily_logs_sleep_range;
alter table public.daily_logs drop constraint if exists daily_logs_steps_range;
alter table public.daily_logs drop constraint if exists daily_logs_water_range;
alter table public.daily_logs drop constraint if exists daily_logs_bodyweight_range;
alter table public.daily_logs drop constraint if exists daily_logs_notes_length;
alter table public.daily_logs
  add constraint daily_logs_sleep_range check (sleep is null or (sleep >= 0 and sleep <= 24)) not valid,
  add constraint daily_logs_steps_range check (steps is null or (steps >= 0 and steps <= 100000)) not valid,
  add constraint daily_logs_water_range check (water is null or (water >= 0 and water <= 15)) not valid,
  add constraint daily_logs_bodyweight_range check (bodyweight is null or (bodyweight >= 20 and bodyweight <= 400)) not valid,
  add constraint daily_logs_notes_length check (notes is null or char_length(notes) <= 1000) not valid;

alter table public.client_profiles drop constraint if exists client_profiles_name_length;
alter table public.client_profiles drop constraint if exists client_profiles_phone_length;
alter table public.client_profiles drop constraint if exists client_profiles_address_length;
alter table public.client_profiles drop constraint if exists client_profiles_emergency_name_length;
alter table public.client_profiles drop constraint if exists client_profiles_emergency_phone_length;
alter table public.client_profiles drop constraint if exists client_profiles_goal_length;
alter table public.client_profiles drop constraint if exists client_profiles_experience_length;
alter table public.client_profiles drop constraint if exists client_profiles_health_notes_length;
alter table public.client_profiles drop constraint if exists client_profiles_height_range;
alter table public.client_profiles
  add constraint client_profiles_name_length check (name is null or char_length(name) <= 100) not valid,
  add constraint client_profiles_phone_length check (phone is null or char_length(phone) <= 30) not valid,
  add constraint client_profiles_address_length check (address is null or char_length(address) <= 300) not valid,
  add constraint client_profiles_emergency_name_length check (emergency_contact_name is null or char_length(emergency_contact_name) <= 100) not valid,
  add constraint client_profiles_emergency_phone_length check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 30) not valid,
  add constraint client_profiles_goal_length check (goal_description is null or char_length(goal_description) <= 5000) not valid,
  add constraint client_profiles_experience_length check (experience is null or char_length(experience) <= 2000) not valid,
  add constraint client_profiles_health_notes_length check (health_notes is null or char_length(health_notes) <= 2000) not valid,
  add constraint client_profiles_height_range check (height_cm is null or (height_cm >= 100 and height_cm <= 250)) not valid;

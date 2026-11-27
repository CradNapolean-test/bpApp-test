-- Library, bigger pieces (live review Build 9: LB11, LB22; 27 Nov 2026).
--
-- Before: an exercise's "used in" count (the exercise's sheet, and what Delete says) counted programme templates only, so an exercise only
-- members' own programmes used was offered for delete, and the delete then failed (LB11). Forms had five question types (short text, long
-- text, number, single choice, multiple choice); the PAR-Q's yes / no questions were single choice with two options (LB22).
--
-- New:
--   1. exercise_library_usage() -> table (exercise_library_id, templates, member_programmes). One read for the whole library: for each
--      exercise in use, how many programme templates and how many members' own programmes (workout_programs) use it, each counted once
--      however many weeks repeat it. It is "security INVOKER" on purpose (not definer): it runs as the coach who calls it, so the tables'
--      read rules decide what it counts, exactly what this coach can already read (their own members' programmes and their gym's, 0053).
--      It writes nothing. Signed-in users only (a member calling it counts only their own programme).
--   2. Two new form question types (LB22): yes_no (the answer is true or false) and scale (a whole number from 1 to 10; the question's
--      options may hold the words under 1 and under 10: none, or exactly two pieces of text of up to 60 characters, either may be empty).
--      form_questions' check on question_type takes them. A second check, form_questions_yes_no_scale_optional, keeps both types OPTIONAL
--      (required = false): the phone app as released draws no box for a type it doesn't know and holds back a form whose required question
--      is unanswered, so a required yes / no would stop a member on the phone sending the form. Optional, the phone sends the form without
--      that answer. When the phone app is updated, a later migration drops this check (and the app lets coaches tick Required again).
--      form_question_types() -> text[]: the types the database takes. The app offers yes / no and scale only when it lists them, so the
--      app deployed before this file never offers a type a save would refuse. Reads nothing, writes nothing.
--   3. submit_form_response: 0111's body with two answer checks added and nothing else changed (the caller checks, "Form already
--      submitted", the list and size checks are as they were): a yes_no answer must be true or false, a scale answer a whole number from
--      1 to 10. As before, the function never asks for every question: a question left out is simply not answered.
--   4. save_form_template: 0135's body with the two types allowed, a scale's words checked and kept (trimmed; none when both are empty),
--      and required saved as false for these two types whatever is sent. The caller checks are as they were.
--
-- Apply: BEFORE the deploy (either order is safe, but applied first, yes / no and scale are offered the moment the new app is live).
-- Applied first: the live app doesn't call the new functions, offers only the old five types, and every form saves and sends as before.
-- Deployed first: the app counts templates only (as today), doesn't offer yes / no or scale, and saves and sends forms as today.
--
-- Guard: the migration stops before changing anything when a table or column it uses is missing ("... is missing"), or when a function it
-- creates already exists with a different body ("... already exists and is not this file's"). Bodies are compared with spaces and line
-- breaks squeezed out. A second run finds this file's own bodies and passes. Safe to run twice: everything is "create or replace" with
-- the same bodies, and the grants are the same.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.exercise_library_usage()') is not null as usage_function,
--          to_regprocedure('public.form_question_types()') is not null as types_function,
--          to_regprocedure('public.submit_form_response(uuid, jsonb)') is not null as submit_function,
--          to_regprocedure('public.save_form_template(uuid, jsonb, jsonb)') is not null as save_function;
-- Expected before: false, false, true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_form_response', 'save_form_template') order by 1;
-- Expected before (0135's and 0111's bodies, the "was" values in the guard below):
--   save_form_template cdad3080d7aa3971d99b77dc6c2e9995
--   submit_form_response 4ab7b3bb873b97346f19b23124118bdb
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.form_questions'::regclass and contype = 'c' order by 1;
-- Expected before: one row, form_questions_question_type_check, CHECK ((question_type = ANY (ARRAY['short_text'::text, 'long_text'::text,
-- 'number'::text, 'single_choice'::text, 'multi_choice'::text]))).
--   select question_type, count(*) as questions, count(*) filter (where required) as required,
--          count(*) filter (where archived_at is not null) as archived
--   from public.form_questions group by 1 order by 1;
-- Note the rows: live on 27 Nov the PAR-Q alone had 9 single_choice and 2 long_text; no yes_no or scale rows are expected.
--   select (select count(*) from public.form_questions) as form_questions, (select count(*) from public.form_responses) as form_responses,
--          (select count(*) from public.form_assignments where completed_at is not null) as forms_sent_back;
-- Note all three (this file writes no question, answer or assignment).
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: true, true, true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef, p.provolatile, p.proconfig
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('exercise_library_usage', 'form_question_types', 'submit_form_response', 'save_form_template') order by 1;
-- Expected after (this file's bodies, the "now" values in the guard below), proconfig {search_path=public} on all four:
--   exercise_library_usage 91bf7b4c376cd596310940490eb0c17f, prosecdef false, provolatile s
--   form_question_types 27978289cd95f1f87db1e6b678ddc72b, prosecdef false, provolatile i
--   save_form_template 54409b569808bf0cff2cba13b681b45b, prosecdef true, provolatile v
--   submit_form_response 1cb9a17f7d51e2bb15c01f64ed802c56, prosecdef true, provolatile v
--   select f, has_function_privilege('authenticated', f, 'execute') as signed_in, has_function_privilege('anon', f, 'execute') as anyone
--   from unnest(array['public.exercise_library_usage()', 'public.form_question_types()', 'public.submit_form_response(uuid, jsonb)',
--                     'public.save_form_template(uuid, jsonb, jsonb)']) as f;
-- Expected: signed_in true, anyone false on all four (the same as before for the two forms functions).
--   (the PRE-FLIGHT's pg_constraint query again)
-- Expected after: two rows: form_questions_question_type_check with the seven types ('short_text', 'long_text', 'number',
-- 'single_choice', 'multi_choice', 'yes_no', 'scale'), and form_questions_yes_no_scale_optional
-- CHECK (((question_type <> ALL (ARRAY['yes_no'::text, 'scale'::text])) OR (NOT required))).
--   (the PRE-FLIGHT's count of form questions by type, and the three counts, again)
-- Expected after: exactly the same rows and numbers as before (no yes_no or scale rows yet; nothing written).
--   select public.form_question_types();
-- Expected: {short_text,long_text,number,single_choice,multi_choice,yes_no,scale}.
--   select count(*) as exercises_in_use, sum(templates) as template_uses, sum(member_programmes) as programme_uses
--   from public.exercise_library_usage();
-- In the SQL editor this runs as the owner and so counts everything; note the numbers (as a coach it counts only what they can read).
--
-- Write checks (test accounts, on a sandbox, not the live project): a form with a yes / no question and a 1-10 scale question, sent to a
-- test member. As that member: submit_form_response(assignment, '[{"question_id": <yes/no>, "answer": true}, {"question_id": <scale>,
-- "answer": 7}]') -> sent. Each of these is refused with nothing written: yes / no with "yes" or 1 ("That answer should be yes or no"),
-- scale with 0, 11, 7.5 or "7" ("That answer should be a whole number from 1 to 10"). Sending the form with neither question answered
-- ('[]', or only the other questions) -> sent. As the coach: save_form_template with a scale question and options ["  Not at all ", ""] ->
-- saved as ["Not at all", ""]; options ["a"] or three items, or a label of 61 characters -> refused; a yes_no question sent with
-- "required": true -> saved with required false. A direct insert of a required yes_no question -> refused by form_questions_yes_no_scale_optional.
--
-- REVERSE: only once no yes_no or scale question exists (delete them first, or the type check below fails):
--   drop function if exists public.exercise_library_usage(); drop function if exists public.form_question_types();
--   alter table public.form_questions drop constraint if exists form_questions_yes_no_scale_optional;
--   alter table public.form_questions drop constraint if exists form_questions_question_type_check;
--   alter table public.form_questions add constraint form_questions_question_type_check
--     check (question_type in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice'));
--   then run 0111's submit_form_response and 0135's save_form_template again (the app stops offering the types once
--   form_question_types() is gone).
--
-- No temporary tables.

do $guard$
declare
  v_md5 text;
  v_check record;
  v_name text;
begin
  for v_check in
    select * from (values
      ('exercise_library_usage', '91bf7b4c376cd596310940490eb0c17f'),
      ('form_question_types', '27978289cd95f1f87db1e6b678ddc72b')
    ) as t(name, accepted)
  loop
    v_md5 := null;
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and v_md5 <> v_check.accepted then
      raise exception '% already exists and is not this file''s (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  -- Replaced functions: must be there, with the body this file was written against (was) or this file's own (now, a second run).
  for v_check in
    select * from (values
      ('submit_form_response', '4ab7b3bb873b97346f19b23124118bdb', '1cb9a17f7d51e2bb15c01f64ed802c56'),
      ('save_form_template', 'cdad3080d7aa3971d99b77dc6c2e9995', '54409b569808bf0cff2cba13b681b45b')
    ) as t(name, was, now)
  loop
    v_md5 := null;
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is null then
      raise exception 'function % is missing, so nothing was changed.', v_check.name;
    end if;
    if v_md5 not in (v_check.was, v_check.now) then
      raise exception '% has changed since this file was written (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_form_response', 'save_form_template')) <> 2 then
    raise exception 'submit_form_response or save_form_template has more than one version, so nothing was changed.';
  end if;

  foreach v_name in array array['is_self', 'is_coach_in_gym'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception 'function % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  -- The only checks on form_questions' type this file expects: the type check (0008's, or this file's) and this file's optional check.
  for v_check in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.form_questions'::regclass and c.contype = 'c'
      and c.conname not in ('form_questions_question_type_check', 'form_questions_yes_no_scale_optional')
      and pg_get_constraintdef(c.oid) like '%question_type%'
  loop
    raise exception 'form_questions has another check on question_type (%), so nothing was changed.', v_check.conname;
  end loop;

  foreach v_name in array array['public.program_template_exercises', 'public.program_template_days', 'public.workout_exercises', 'public.workout_program_days',
                                'public.form_questions', 'public.form_responses', 'public.form_assignments', 'public.form_templates'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('program_template_exercises', 'exercise_library_id'), ('program_template_exercises', 'template_day_id'),
      ('program_template_days', 'id'), ('program_template_days', 'template_id'),
      ('workout_exercises', 'exercise_library_id'), ('workout_exercises', 'program_day_id'),
      ('workout_program_days', 'id'), ('workout_program_days', 'program_id'),
      ('form_questions', 'question_type'), ('form_questions', 'required'), ('form_questions', 'options'), ('form_questions', 'archived_at')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = v_check.tbl and column_name = v_check.col
    ) then
      raise exception 'column %.% is missing, so nothing was changed.', v_check.tbl, v_check.col;
    end if;
  end loop;
end
$guard$;

-- ---- 1. where each library exercise is used (LB11) ----

create or replace function public.exercise_library_usage()
returns table (exercise_library_id uuid, templates integer, member_programmes integer)
language sql
stable
security invoker
set search_path = public
as $fn$
  with t as (
    select e.exercise_library_id as id, count(distinct d.template_id)::integer as n
    from program_template_exercises e
    join program_template_days d on d.id = e.template_day_id
    where e.exercise_library_id is not null
    group by e.exercise_library_id
  ),
  p as (
    select e.exercise_library_id as id, count(distinct d.program_id)::integer as n
    from workout_exercises e
    join workout_program_days d on d.id = e.program_day_id
    where e.exercise_library_id is not null
    group by e.exercise_library_id
  )
  select coalesce(t.id, p.id), coalesce(t.n, 0), coalesce(p.n, 0)
  from t
  full join p on p.id = t.id
$fn$;

revoke execute on function public.exercise_library_usage() from public, anon;
grant execute on function public.exercise_library_usage() to authenticated;

-- ---- 2. the question types the database takes (LB22) ----

alter table public.form_questions drop constraint if exists form_questions_question_type_check;
alter table public.form_questions add constraint form_questions_question_type_check check (
  question_type in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice', 'yes_no', 'scale')
);

-- Optional until the phone app is updated (see 2. above). No row breaks it: no yes_no or scale question exists before this file.
alter table public.form_questions drop constraint if exists form_questions_yes_no_scale_optional;
alter table public.form_questions add constraint form_questions_yes_no_scale_optional check (
  question_type not in ('yes_no', 'scale') or not required
);

create or replace function public.form_question_types()
returns text[]
language sql
immutable
security invoker
set search_path = public
as $fn$
  select array['short_text', 'long_text', 'number', 'single_choice', 'multi_choice', 'yes_no', 'scale']
$fn$;

revoke execute on function public.form_question_types() from public, anon;
grant execute on function public.form_question_types() to authenticated;

-- ---- 3. form answers: yes / no and 1-10 scale (LB22). The body is 0111's with only the two answer checks added. ----

create or replace function public.submit_form_response(p_assignment_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
    -- Yes / no and 1-10 scale (0179). A missing answer is left out like any other: nothing here asks for every question.
    if v_question.question_type = 'yes_no' and jsonb_typeof(v_answer.answer) <> 'boolean' then
      raise exception 'That answer should be yes or no';
    end if;
    if v_question.question_type = 'scale' then
      if jsonb_typeof(v_answer.answer) <> 'number' then
        raise exception 'That answer should be a whole number from 1 to 10';
      end if;
      if (v_answer.answer #>> '{}')::numeric not between 1 and 10
         or (v_answer.answer #>> '{}')::numeric <> trunc((v_answer.answer #>> '{}')::numeric) then
        raise exception 'That answer should be a whole number from 1 to 10';
      end if;
    end if;

    insert into form_responses (assignment_id, question_id, answer)
    values (p_assignment_id, v_answer.question_id, v_answer.answer);
  end loop;

  update form_assignments set completed_at = now() where id = p_assignment_id;
end;
$fn$;

revoke execute on function public.submit_form_response(uuid, jsonb) from public, anon;
grant execute on function public.submit_form_response(uuid, jsonb) to authenticated;

-- ---- 4. saving a form: the new types, a scale's words, always optional for now (LB22). The body is 0135's with only those added. ----

create or replace function public.save_form_template(p_template_id uuid, p_fields jsonb, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_template form_templates;
  v_name text;
  v_description text;
  v_default boolean;
  v_item jsonb;
  v_options jsonb;
  v_text text;
  v_type text;
  v_required boolean;
  v_id uuid;
  v_existing form_questions;
  v_position integer := 0;
  v_kept uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  select * into v_template from form_templates where id = p_template_id for update;
  if v_template is null or not coalesce(public.is_coach_in_gym(v_template.gym_id), false) then
    raise exception 'Form template not found';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'That form could not be saved. Close it and try again.';
  end if;

  v_name := btrim(coalesce(p_fields ->> 'name', ''));
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'Give the form a name of up to 200 characters.';
  end if;
  v_description := nullif(btrim(coalesce(p_fields ->> 'description', '')), '');
  if char_length(coalesce(v_description, '')) > 2000 then
    raise exception 'The description can be up to 2,000 characters.';
  end if;
  v_default := coalesce(p_fields ->> 'is_default_onboarding', 'false') = 'true';

  if jsonb_array_length(p_questions) > 100 then
    raise exception 'A form can have up to 100 questions.';
  end if;

  -- Check every question before anything is written.
  for v_item in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'That form could not be saved. Close it and try again.';
    end if;
    v_text := btrim(coalesce(v_item ->> 'question_text', ''));
    if v_text = '' or char_length(v_text) > 500 then
      raise exception 'Every question needs some text (up to 500 characters).';
    end if;
    v_type := v_item ->> 'question_type';
    if v_type is null or v_type not in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice', 'yes_no', 'scale') then
      raise exception 'Choose a type for "%".', v_text;
    end if;
    if v_type in ('single_choice', 'multi_choice') then
      v_options := v_item -> 'options';
      if coalesce(jsonb_typeof(v_options), '') <> 'array' or jsonb_array_length(v_options) < 1 then
        raise exception 'The choice question "%" needs at least one option.', v_text;
      end if;
      if jsonb_array_length(v_options) > 30 then
        raise exception 'A choice question can have up to 30 options.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_options) e
        where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '' or char_length(e #>> '{}') > 200
      ) then
        raise exception 'The options of "%" must each have some text (up to 200 characters).', v_text;
      end if;
      if (select count(distinct e #>> '{}') from jsonb_array_elements(v_options) e) <> jsonb_array_length(v_options) then
        raise exception 'The options of "%" must all be different.', v_text;
      end if;
    end if;
    -- A 1-10 scale may carry the words under 1 and under 10 (0179): none, or a list of exactly two pieces of text of up to 60 characters.
    if v_type = 'scale' and coalesce(jsonb_typeof(v_item -> 'options'), 'null') <> 'null' then
      v_options := v_item -> 'options';
      if jsonb_typeof(v_options) <> 'array' then
        raise exception 'The words under 1 and 10 of "%" can be up to 60 characters each.', v_text;
      end if;
      if jsonb_array_length(v_options) <> 2
         or exists (select 1 from jsonb_array_elements(v_options) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 60) then
        raise exception 'The words under 1 and 10 of "%" can be up to 60 characters each.', v_text;
      end if;
    end if;
  end loop;

  -- At most one default onboarding form per gym.
  if v_default then
    update form_templates set is_default_onboarding = false
    where gym_id = v_template.gym_id and is_default_onboarding and id <> p_template_id;
  end if;
  update form_templates
  set name = v_name, description = v_description, is_default_onboarding = v_default
  where id = p_template_id;

  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_text := btrim(v_item ->> 'question_text');
    v_type := v_item ->> 'question_type';
    -- Yes / no and 1-10 scale are always optional until the phone app is updated (0179): the released phone app shows no box for them
    -- and would hold back a form whose required question it can't answer.
    v_required := coalesce(v_item ->> 'required', 'true') = 'true' and v_type not in ('yes_no', 'scale');
    v_options := case
      when v_type in ('single_choice', 'multi_choice') then v_item -> 'options'
      when v_type = 'scale' and coalesce(jsonb_typeof(v_item -> 'options'), 'null') = 'array'
           and (btrim(v_item -> 'options' ->> 0) <> '' or btrim(v_item -> 'options' ->> 1) <> '')
        then jsonb_build_array(btrim(coalesce(v_item -> 'options' ->> 0, '')), btrim(coalesce(v_item -> 'options' ->> 1, '')))
      else null
    end;
    v_id := nullif(v_item ->> 'id', '')::uuid;

    if v_id is not null then
      if v_id = any (v_kept) then
        raise exception 'That form could not be saved. Close it and try again.';
      end if;
      select * into v_existing from form_questions where id = v_id and template_id = p_template_id and archived_at is null;
      if v_existing.id is null then
        raise exception 'This form was changed by someone else. Close it and open it again.';
      end if;

      if v_existing.question_type is distinct from v_type
         and exists (select 1 from form_responses where question_id = v_id) then
        -- The old answers do not fit the new type: keep them on the old (archived) question and start a new one.
        update form_questions set archived_at = now() where id = v_id;
        insert into form_questions (template_id, order_index, question_text, question_type, options, required)
        values (p_template_id, v_position, v_text, v_type, v_options, v_required)
        returning id into v_id;
      else
        update form_questions
        set order_index = v_position, question_text = v_text, question_type = v_type, options = v_options, required = v_required
        where id = v_id;
      end if;
    else
      insert into form_questions (template_id, order_index, question_text, question_type, options, required)
      values (p_template_id, v_position, v_text, v_type, v_options, v_required)
      returning id into v_id;
    end if;

    v_kept := v_kept || v_id;
    v_position := v_position + 1;
  end loop;

  -- Questions the coach took out: gone if nobody answered them, archived (answers kept) if somebody did.
  delete from form_questions q
  where q.template_id = p_template_id and q.archived_at is null and q.id <> all (v_kept)
    and not exists (select 1 from form_responses r where r.question_id = q.id);

  update form_questions q set archived_at = now()
  where q.template_id = p_template_id and q.archived_at is null and q.id <> all (v_kept);

  return p_template_id;
end;
$fn$;

revoke execute on function public.save_form_template(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_template(uuid, jsonb, jsonb) to authenticated;

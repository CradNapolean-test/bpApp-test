-- Coach app fixes (fix brief 04): saving a form without losing its answers, and telling members when an event changes.
--
--  R3   Editing a form deleted every answer ever submitted: the editor deleted all of the form's questions and re-inserted them with
--       new ids, and form_responses.question_id is ON DELETE CASCADE. save_form_template updates questions in place, and a question
--       that has answers is archived instead of deleted, so the answers stay readable for the coach.
--  EV2  notify_event_signups: tell everyone signed up to an event that its time or place changed, or that it was cancelled.
--
-- Apply after 0133 (0143 stays last). Each section starts with a read-only PRE-FLIGHT query. Written to be re-run safely.

-- =====================================================================================================================
-- R3 (DECISION D14, recommended default: archive a question that has answers). Editing a form deleted every answer.
-- Proven live on 15 Oct with a throwaway form: one answer saved; after a one-word edit the question's id changed, the assignment still
-- said "Completed", and the answer count went from 1 to 0.
--
-- form_questions.archived_at: a question the coach removed (or whose type was changed) after it had answers. Archived questions are
-- hidden from the member's fill-out screen and from new assignments, but the coach still sees them, labelled, on a completed form so the
-- old answers stay readable. Nothing else about the table changes.
--
-- save_form_template(p_template_id, p_fields, p_questions) returns the template id, in ONE transaction:
--   * the caller must be a coach who works at the template's gym;
--   * updates the template (name 1 to 200 characters, description up to 2,000, the default-onboarding flag; setting the flag clears it
--     on the gym's other forms, as before);
--   * a payload question WITH an id is updated in place (text, type, options, required, order = its position in the payload); the id
--     must be one of the form's current questions, otherwise the save is refused with "This form was changed by someone else";
--   * a payload question WITHOUT an id is inserted;
--   * if the type of a question that has answers changes, the old question is archived and a new one inserted (the old answers do not
--     fit the new type); if it has no answers it is updated in place;
--   * every current question missing from the payload is deleted if it has no answers, or archived if it has;
--   * validation: at most 100 questions; every question has text (up to 500 characters) and a known type; a choice question needs
--     1 to 30 different non-empty options (up to 200 characters each) and other types keep none.
-- form_answer_counts(p_template_id) answers how many answers each of the form's questions has, for the editor ("3 answers").
--
-- PRE-FLIGHT (read-only; how many answers would be at risk from the OLD behaviour, and how many forms exist):
--   select t.name, count(distinct q.id) as questions, count(r.id) as answers
--   from public.form_templates t
--   left join public.form_questions q on q.template_id = t.id
--   left join public.form_responses r on r.question_id = q.id
--   group by 1 order by 3 desc;
-- =====================================================================================================================
alter table public.form_questions add column if not exists archived_at timestamptz;

create index if not exists form_questions_active_idx on public.form_questions (template_id) where archived_at is null;

create or replace function public.form_answer_counts(p_template_id uuid)
returns table (question_id uuid, answers bigint)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, count(r.id)
  from form_questions q
  join form_templates t on t.id = q.template_id
  left join form_responses r on r.question_id = q.id
  where q.template_id = p_template_id
    and coalesce(public.is_coach_in_gym(t.gym_id), false)
  group by q.id;
$$;

revoke execute on function public.form_answer_counts(uuid) from public, anon;
grant execute on function public.form_answer_counts(uuid) to authenticated;

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
    if v_type is null or v_type not in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice') then
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
    v_required := coalesce(v_item ->> 'required', 'true') = 'true';
    v_options := case when v_type in ('single_choice', 'multi_choice') then v_item -> 'options' else null end;
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

-- =====================================================================================================================
-- EV2. Changing or removing an event told nobody who had signed up.
-- notify_event_signups(p_event, p_message) writes one in-app notification to everyone signed up to the event (the message is built by
-- the app: the event's title and what changed), and answers how many were told. The caller must be a coach who works at the event's
-- gym. The app calls it before saving a changed time or place, and before deleting an event. Message: 1 to 300 characters.
--
-- PRE-FLIGHT (read-only; events with people signed up, which a change or delete would now notify):
--   select e.id, e.title, e.starts_at, count(s.client_id) as signed_up
--   from public.gym_events e left join public.event_signups s on s.event_id = e.id
--   where e.starts_at >= now() group by 1, 2, 3 order by 3 desc;
-- =====================================================================================================================
create or replace function public.notify_event_signups(p_event uuid, p_message text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event gym_events;
  v_message text := btrim(coalesce(p_message, ''));
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;
  select * into v_event from gym_events where id = p_event;
  if v_event is null or not coalesce(public.is_coach_in_gym(v_event.gym_id), false) then
    raise exception 'Event not found';
  end if;
  if char_length(v_message) < 1 or char_length(v_message) > 300 then
    raise exception 'The message must be 1 to 300 characters.';
  end if;

  insert into notifications (client_id, message)
  select s.client_id, v_message from event_signups s where s.event_id = p_event;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.notify_event_signups(uuid, text) from public, anon;
grant execute on function public.notify_event_signups(uuid, text) to authenticated;

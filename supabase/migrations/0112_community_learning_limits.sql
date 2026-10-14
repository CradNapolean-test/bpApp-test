-- Events, feedback, lessons, recipes, the meal plan and Big Dog scores, for the phone app (slice 7c; see
-- docs/SECURITY_DEFINER_AUDIT.md). Found with supabase/tests/security-audit/community-learning-check.cjs: row isolation holds
-- everywhere (a member reaches only their own rows and what their coach gave them), but the rules the web app enforces in its own
-- server code were not in the database, so a direct API call could skip them.
--
-- 1. Events. Capacity and "the event has not happened yet" were only checked by the web's server action. A direct insert could
--    sign a member up to a full event, or to one that was over. A BEFORE INSERT trigger now checks both, with the event row
--    locked so two people taking the last spot at the same moment cannot both get it. (Events stay listed for 6 hours after they
--    start, as the app shows them, so sign-up closes at the same point.)
--
-- 2. Lessons. A member could mark ANY lesson id complete, including lessons of courses they were never given and lessons the
--    coach has not unlocked yet (the unlock date was only checked by the page). A trigger now requires the lesson to be in a
--    course assigned to that member and, if it has an unlock date, that the date has come in the member's own timezone.
--
-- 3. Limits on what a member can type or send (NOT VALID: they apply to every new and changed row and leave stored rows alone):
--      member_feedback.comment up to 1,000 characters;
--      recipes.name up to 100 characters, servings 1-100;
--      recipe_ingredients and meal_plan_entries portions above 0 and up to 10,000 (grams or units);
--      big_dog_results: result_text up to 40 characters, result_value 0-100,000, exercise_key up to 40 characters.
--
-- 4. Big Dog self-reported scores may only be dated within the last year or up to tomorrow. A member can still only ever write
--    self-reported rows (the existing policy), and only VERIFIED rows count towards the T-shirt tier, so this is housekeeping: it
--    stops a self-reported row being back-dated or future-dated so that it sorts as the "latest" result.

-- ---- 1. events ----

create or replace function public.event_signup_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event gym_events;
begin
  select * into v_event from gym_events where id = new.event_id for update;
  if v_event is null then
    raise exception 'Event not found';
  end if;
  if v_event.starts_at < now() - interval '6 hours' then
    raise exception 'This event has already happened';
  end if;
  if v_event.capacity is not null
     and (select count(*) from event_signups where event_id = new.event_id) >= v_event.capacity then
    raise exception 'This event is full';
  end if;
  return new;
end;
$$;

revoke execute on function public.event_signup_rules() from public, anon, authenticated;

drop trigger if exists event_signup_rules on public.event_signups;
create trigger event_signup_rules
  before insert on public.event_signups
  for each row execute function public.event_signup_rules();

-- ---- 2. lessons ----

create or replace function public.lesson_completion_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unlock date;
  v_assigned boolean;
  v_tz text;
begin
  -- The system (service role, no signed-in member) is not held to the member's rules.
  if auth.uid() is null then
    return new;
  end if;

  select l.unlock_at,
         exists (
           select 1 from education_course_assignments a
           where a.course_id = m.course_id and a.client_id = new.client_id
         )
    into v_unlock, v_assigned
  from education_lessons l
  join education_modules m on m.id = l.module_id
  where l.id = new.lesson_id;

  if v_assigned is distinct from true then
    raise exception 'That lesson is not in a course assigned to you';
  end if;

  if v_unlock is not null then
    select coalesce(timezone, 'Europe/London') into v_tz from client_profiles where client_id = new.client_id;
    if v_unlock > (now() at time zone coalesce(v_tz, 'Europe/London'))::date then
      raise exception 'That lesson is not open yet';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.lesson_completion_rules() from public, anon, authenticated;

drop trigger if exists lesson_completion_rules on public.education_lesson_completions;
create trigger lesson_completion_rules
  before insert on public.education_lesson_completions
  for each row execute function public.lesson_completion_rules();

-- ---- 3. limits ----

alter table public.member_feedback drop constraint if exists member_feedback_comment_length;
alter table public.member_feedback
  add constraint member_feedback_comment_length check (comment is null or char_length(comment) <= 1000) not valid;

alter table public.recipes drop constraint if exists recipes_name_length;
alter table public.recipes drop constraint if exists recipes_servings_range;
alter table public.recipes
  add constraint recipes_name_length check (char_length(name) <= 100) not valid,
  add constraint recipes_servings_range check (servings >= 1 and servings <= 100) not valid;

alter table public.recipe_ingredients drop constraint if exists recipe_ingredients_portions_range;
alter table public.recipe_ingredients
  add constraint recipe_ingredients_portions_range check (portions > 0 and portions <= 10000) not valid;

alter table public.meal_plan_entries drop constraint if exists meal_plan_entries_portions_range;
alter table public.meal_plan_entries
  add constraint meal_plan_entries_portions_range check (portions > 0 and portions <= 10000) not valid;

alter table public.big_dog_results drop constraint if exists big_dog_results_text_length;
alter table public.big_dog_results drop constraint if exists big_dog_results_value_range;
alter table public.big_dog_results drop constraint if exists big_dog_results_key_length;
alter table public.big_dog_results
  add constraint big_dog_results_text_length check (result_text is null or char_length(result_text) <= 40) not valid,
  add constraint big_dog_results_value_range check (result_value is null or (result_value >= 0 and result_value <= 100000)) not valid,
  add constraint big_dog_results_key_length check (char_length(exercise_key) <= 40) not valid;

-- ---- 4. Big Dog self-reported dates ----

create or replace function public.big_dog_self_report_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.self_reported and (new.tested_date < current_date - 366 or new.tested_date > current_date + 1) then
    raise exception 'A score can only be dated within the last year';
  end if;
  return new;
end;
$$;

revoke execute on function public.big_dog_self_report_dates() from public, anon, authenticated;

drop trigger if exists big_dog_self_report_dates on public.big_dog_results;
create trigger big_dog_self_report_dates
  before insert on public.big_dog_results
  for each row execute function public.big_dog_self_report_dates();

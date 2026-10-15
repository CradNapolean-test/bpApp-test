-- Gym scoping, part 2 (fix brief 02): use the MEMBER's gym, and add the missing permission checks.
--
--  R38  A plan, form, course, programme or class from another gym can no longer be given to a member; coach views can read the
--       plans, forms, classes and courses their own members point at; broadcasts and the member-side "my gym" use the member's
--       own gym.
--  CM3  Null-safe check in apply_programme_rollout, no cancelling a session that has already happened, bounds on the gym name,
--       the default reminder days and the logo path.
--  CM4  Exercise library: authors edit their own entries, gym admins edit the seeded ones, entries can be retired (D4).
--  GA1  The last gym admin can no longer be demoted.
--
-- Each section starts with a read-only PRE-FLIGHT query: run them BEFORE applying this file. Apply after 0129. Written to be
-- re-run safely. Functions that were redefined keep their signatures; the latest definition before this file is named in each
-- comment so later work can start from this one.

-- =====================================================================================================================
-- R38 (database half). Objects from the wrong gym were accepted, and plan names were unreadable from the other gym.
--
-- Background: a coach has an ACTIVE gym (profiles.gym_id, what my_gym_id() returns); a member has one fixed gym (the same column
-- on their own row, read by client_gym_id()). A coach who works in two gyms was only right while their active gym happened to be
-- the member's. Checks below compare the object's gym with the MEMBER's gym, never the coach's.
--
-- Changed (latest definition before this file in brackets):
--   same_gym_as_client(gym, client)            new helper: true only when both are known and equal
--   start_membership, assign_membership        [0088, 0005]  the plan must belong to the member's gym
--   assign_form, assign_education_course       [0054]        the form / course must belong to the member's gym (was: the coach's active gym)
--   instantiate_program_template               [0094]        same for the programme template
--   book_class_for_client                      [0062]        the four checks book_class got in 0107 (same gym, not in the past, runs on that
--                                                            weekday or date, not cancelled by the coach)
--   communication_recipients                   [0097]        "whole gym" reaches the gym's MEMBERS (was: members whose coach's active gym matched)
--   my_scoping_gym_id                          [0052]        a member's gym is their own, not their coach's active gym
-- Read access: a coach can read the plan, form (and its questions), class and course rows that their OWN members' memberships,
-- assignments and bookings point at, whichever gym the coach has active. Before, a coach whose active gym was A saw "No plan" for
-- every member on a gym-B plan. gym_events was checked: no coach screen shows an event through a member, so it is left as it is.
-- The error text for a mismatch is 'That belongs to a different gym.'
--
-- PRE-FLIGHT (read-only; objects already given to a member from another gym. They keep working; new ones are refused):
--   select 'plan' as kind, count(*) from public.client_memberships m
--     join public.membership_packages p on p.id = m.package_id
--     where p.gym_id is distinct from public.client_gym_id(m.client_id)
--   union all
--   select 'form', count(*) from public.form_assignments a
--     join public.form_templates t on t.id = a.template_id
--     where t.gym_id is distinct from public.client_gym_id(a.client_id)
--   union all
--   select 'course', count(*) from public.education_course_assignments a
--     join public.education_courses c on c.id = a.course_id
--     where c.gym_id is distinct from public.client_gym_id(a.client_id)
--   union all
--   select 'booking', count(*) from public.bookings b
--     join public.classes c on c.id = b.class_id
--     where c.gym_id is distinct from public.client_gym_id(b.client_id);
-- =====================================================================================================================
create or replace function public.same_gym_as_client(p_gym uuid, p_client uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_gym is not null and p_gym = public.client_gym_id(p_client);
$$;

revoke execute on function public.same_gym_as_client(uuid, uuid) from public, anon, authenticated;

create or replace function public.start_membership(p_client_id uuid, p_package_id uuid, p_start date default null, p_end date default null)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_start date := coalesce(p_start, current_date);
  v_open client_memberships;
  v_new client_memberships;
  v_package_gym uuid;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;
  if p_end is not null and p_end < v_start then
    raise exception 'The end date is before the start date.';
  end if;

  select gym_id into v_package_gym from membership_packages where id = p_package_id;
  if not found then
    raise exception 'Plan not found';
  end if;
  if not public.same_gym_as_client(v_package_gym, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;

  select * into v_open from client_memberships where client_id = p_client_id and ended_at is null;
  if v_open.id is not null then
    if v_start > current_date then
      raise exception 'This member already has an active plan. End it first, or start the new plan today.';
    end if;
    update client_memberships set ended_at = current_date where id = v_open.id;
  end if;

  insert into client_memberships (client_id, package_id, started_at, scheduled_end)
  values (p_client_id, p_package_id, v_start, p_end)
  returning * into v_new;

  if v_start <= current_date then
    perform top_up_membership_credits(v_new.id);
  end if;
  return v_new;
end;
$fn$;

create or replace function public.assign_membership(p_client_id uuid, p_package_id uuid)
returns client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership client_memberships;
  v_package_gym uuid;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select gym_id into v_package_gym from membership_packages where id = p_package_id;
  if not found then
    raise exception 'Plan not found';
  end if;
  if not public.same_gym_as_client(v_package_gym, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;

  update client_memberships
  set ended_at = current_date
  where client_id = p_client_id and ended_at is null;

  insert into client_memberships (client_id, package_id)
  values (p_client_id, p_package_id)
  returning * into v_membership;

  return v_membership;
end;
$$;

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
  if v_template is null then
    raise exception 'Form template not found';
  end if;
  if not public.same_gym_as_client(v_template.gym_id, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;

  insert into form_assignments (template_id, client_id)
  values (p_template_id, p_client_id)
  returning * into v_assignment;

  insert into notifications (client_id, message)
  values (p_client_id, 'You have a new form to fill out: ' || v_template.name);

  return v_assignment;
end;
$$;

create or replace function public.assign_education_course(p_course_id uuid, p_client_id uuid)
returns education_course_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course education_courses;
  v_assignment education_course_assignments;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_course from education_courses where id = p_course_id;
  if v_course is null then
    raise exception 'Course not found';
  end if;
  if not public.same_gym_as_client(v_course.gym_id, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;

  insert into education_course_assignments (course_id, client_id)
  values (p_course_id, p_client_id)
  returning * into v_assignment;

  insert into notifications (client_id, message)
  values (p_client_id, 'New course assigned: ' || v_course.title);

  return v_assignment;
end;
$$;

create or replace function public.instantiate_program_template(p_template_id uuid, p_client_id uuid, p_program_name text, p_start_date date default null)
returns workout_programs
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_template program_templates;
begin
  if not is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null then
    raise exception 'Programme template not found';
  end if;
  if not public.same_gym_as_client(v_template.gym_id, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;

  return public.instantiate_template_core(p_template_id, p_client_id, p_program_name, p_start_date, null);
end;
$fn$;

create or replace function public.book_class_for_client(p_class_id uuid, p_client_id uuid, p_booking_date date)
returns bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_client_id uuid := p_client_id;
  v_capacity integer;
  v_cost integer;
  v_class_name text;
  v_class_gym uuid;
  v_dow integer;
  v_specific date;
  v_tz text;
  v_booked_count integer;
  v_membership_balance integer;
  v_bonus_balance integer;
  v_from_membership integer;
  v_from_bonus integer;
  v_status text;
  v_booking bookings;
begin
  if not public.is_coach_of(p_client_id) then
    raise exception 'Not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_class_id::text || p_booking_date::text));

  select capacity, credit_cost, name, gym_id, day_of_week, specific_date
  into v_capacity, v_cost, v_class_name, v_class_gym, v_dow, v_specific
  from classes where id = p_class_id;
  if v_capacity is null then
    raise exception 'Class not found';
  end if;

  -- The same four checks the member's own booking has had since 0107, plus the member's-gym check (which also covers a
  -- coach whose active gym is not the member's).
  -- 1. The class must be at the member's gym.
  if not public.same_gym_as_client(v_class_gym, p_client_id) then
    raise exception 'That belongs to a different gym.';
  end if;
  -- 2. Not in the past (the gym's own calendar day).
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class_gym;
  if p_booking_date < public.local_date(v_tz) then
    raise exception 'You can''t book a session in the past';
  end if;
  -- 3. The session must actually run on that date: its one-off date, or its weekday (0 = Sunday).
  if not (
    (v_specific is not null and p_booking_date = v_specific)
    or (v_specific is null and v_dow is not null and extract(dow from p_booking_date)::integer = v_dow)
  ) then
    raise exception 'That session doesn''t run on that date';
  end if;
  -- 4. And it must not have been cancelled by the coach.
  if exists (select 1 from class_exceptions where class_id = p_class_id and occurrence_date = p_booking_date) then
    raise exception 'That session has been cancelled';
  end if;

  select count(*) into v_booked_count
  from bookings
  where class_id = p_class_id and booking_date = p_booking_date and status = 'booked';

  if v_booked_count < v_capacity then
    select coalesce(sum(delta), 0) into v_membership_balance
    from credits_ledger where client_id = v_client_id and bucket = 'membership';
    select coalesce(sum(delta), 0) into v_bonus_balance
    from credits_ledger where client_id = v_client_id and bucket = 'bonus';

    if v_membership_balance + v_bonus_balance < v_cost then
      raise exception 'Not enough credits';
    end if;
    v_status := 'booked';
  else
    v_status := 'waitlist';
  end if;

  insert into bookings (class_id, client_id, booking_date, status)
  values (p_class_id, v_client_id, p_booking_date, v_status)
  returning * into v_booking;

  if v_status = 'booked' then
    v_from_membership := least(v_cost, greatest(v_membership_balance, 0));
    v_from_bonus := v_cost - v_from_membership;

    if v_from_membership > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
      values (v_client_id, -v_from_membership, 'Booked ' || v_class_name || ' (by coach)', 'membership', v_booking.id, auth.uid());
    end if;
    if v_from_bonus > 0 then
      insert into credits_ledger (client_id, delta, reason, bucket, booking_id, granted_by)
      values (v_client_id, -v_from_bonus, 'Booked ' || v_class_name || ' (by coach)', 'bonus', v_booking.id, auth.uid());
    end if;
  end if;

  return v_booking;
end;
$fn$;

-- "Whole gym" and "all clients" broadcasts reach the gym's members. The old test was "the member's coach has this gym ACTIVE",
-- so a coach in two gyms reached the wrong people (or nobody) depending on which gym they had switched to.
create or replace function public.communication_recipients(p_gym uuid, p_coach uuid, p_target text, p_group uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id
  from profiles c
  where c.role = 'client'
    and (
      (p_target = 'my_clients' and c.coach_id = p_coach)
      or (
        p_target in ('gym', 'all_clients')
        and p_gym is not null
        and public.client_gym_id(c.id) = p_gym
      )
      or (
        p_target = 'group'
        and exists (select 1 from client_group_members m where m.group_id = p_group and m.client_id = c.id)
      )
    );
$fn$;

revoke all on function public.communication_recipients(uuid, uuid, text, uuid) from public, anon, authenticated;

-- A member's scoping gym is their own gym. It was their coach's ACTIVE gym, so a member of a coach in two gyms was scoped to
-- whichever gym the coach had switched to.
create or replace function public.my_scoping_gym_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select gym_id from profiles where id = auth.uid() and role = 'coach'),
    (select gym_id from profiles where id = auth.uid() and role = 'client')
  );
$$;

-- Read-only access to the rows a coach's own members point at (the coach's active gym no longer decides it). Each helper only
-- answers "do I coach someone on this?", so it reveals nothing about anyone else. They are definer functions so the lookup is
-- a plain indexed join instead of a row-by-row policy call.
create or replace function public.coach_has_client_on_plan(p_package uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1 from client_memberships m join profiles p on p.id = m.client_id
    where m.package_id = p_package and p.coach_id = auth.uid()
  );
$$;

create or replace function public.coach_has_client_on_form(p_template uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1 from form_assignments a join profiles p on p.id = a.client_id
    where a.template_id = p_template and p.coach_id = auth.uid()
  );
$$;

create or replace function public.coach_has_client_on_course(p_course uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1 from education_course_assignments a join profiles p on p.id = a.client_id
    where a.course_id = p_course and p.coach_id = auth.uid()
  );
$$;

create or replace function public.coach_has_client_in_class(p_class uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1 from bookings b join profiles p on p.id = b.client_id
    where b.class_id = p_class and p.coach_id = auth.uid()
  );
$$;

revoke execute on function public.coach_has_client_on_plan(uuid) from public, anon;
revoke execute on function public.coach_has_client_on_form(uuid) from public, anon;
revoke execute on function public.coach_has_client_on_course(uuid) from public, anon;
revoke execute on function public.coach_has_client_in_class(uuid) from public, anon;
grant execute on function public.coach_has_client_on_plan(uuid) to authenticated;
grant execute on function public.coach_has_client_on_form(uuid) to authenticated;
grant execute on function public.coach_has_client_on_course(uuid) to authenticated;
grant execute on function public.coach_has_client_in_class(uuid) to authenticated;

drop policy if exists "coach reads plans of own clients" on public.membership_packages;
create policy "coach reads plans of own clients"
  on public.membership_packages for select
  to authenticated
  using (public.coach_has_client_on_plan(id));

drop policy if exists "coach reads forms assigned to own clients" on public.form_templates;
create policy "coach reads forms assigned to own clients"
  on public.form_templates for select
  to authenticated
  using (public.coach_has_client_on_form(id));

drop policy if exists "coach reads questions of forms assigned to own clients" on public.form_questions;
create policy "coach reads questions of forms assigned to own clients"
  on public.form_questions for select
  to authenticated
  using (public.coach_has_client_on_form(template_id));

drop policy if exists "coach reads courses assigned to own clients" on public.education_courses;
create policy "coach reads courses assigned to own clients"
  on public.education_courses for select
  to authenticated
  using (public.coach_has_client_on_course(id));

drop policy if exists "coach reads classes booked by own clients" on public.classes;
create policy "coach reads classes booked by own clients"
  on public.classes for select
  to authenticated
  using (public.coach_has_client_in_class(id));

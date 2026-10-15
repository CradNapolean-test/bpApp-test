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

-- =====================================================================================================================
-- CM3. Coach functions that skipped checks.
--  * apply_programme_rollout [0094]: "v_r.gym_id <> my_gym_id()" is NULL for anyone who is not a coach, so the check let a
--    member through (they would need a rollout's id). Now null-safe, and "everyone at the gym" picks members by their OWN gym
--    (it used to be "members whose coach has this gym active", the R38 pattern; brief 03 R5 can skip that part).
--  * cancel_class_occurrence [0105]: refuses a date before today at the gym (it would refund and cancel sessions people attended).
--    It still only writes an in-app notification; the push is brief 09.
--  * set_gym_name [0052]: 1 to 80 characters after trimming.
--  * set_default_checkin_reminder_days [0042]: 0 to 60.
--  * set_logo_path [0047]: only a path in the caller's own folder, shaped like the app's uploads ({id}/{file name}), or null to clear.
--  * set_gym_booking_settings [0069]: unchanged rules, now sharing one internal function with the owner version (0131).
-- The two gym-setting functions now call internal functions (_rename_gym, _set_gym_booking_settings) so that the owner's
-- versions in 0131 do exactly the same thing. Internal functions are not callable by anyone but other functions.
--
-- PRE-FLIGHT (read-only; existing values the new bounds would not have allowed. Nothing is changed in them):
--   select id, name from public.gyms where btrim(name) = '' or char_length(name) > 80;
--   select id, default_checkin_reminder_days from public.profiles where default_checkin_reminder_days > 60;
--   select id, logo_path from public.profiles
--   where logo_path is not null and logo_path !~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$');
-- =====================================================================================================================
create or replace function public.apply_programme_rollout(p_rollout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r programme_rollouts;
  v_client uuid;
  v_count integer := 0;
begin
  select * into v_r from programme_rollouts where id = p_rollout_id;
  if v_r.id is null then
    raise exception 'Rollout not found';
  end if;
  -- Signed in: must be a coach (my_gym_id() is null for everyone else) at the rollout's gym. No user = the daily job.
  if auth.uid() is not null and (public.my_gym_id() is null or v_r.gym_id is distinct from public.my_gym_id()) then
    raise exception 'Not authorized';
  end if;
  if v_r.applied_at is not null then
    return 0;
  end if;

  for v_client in
    select c.id
    from profiles c
    where c.role = 'client'
      and public.client_gym_id(c.id) is not distinct from v_r.gym_id
      and (v_r.audience = 'all' or c.id = any(v_r.client_ids))
      and not exists (select 1 from workout_programs wp where wp.client_id = c.id and wp.rollout_id = v_r.id)
  loop
    perform public.instantiate_template_core(v_r.template_id, v_client, v_r.program_name, v_r.start_date, v_r.id);
    v_count := v_count + 1;
  end loop;

  update programme_rollouts set applied_at = now() where id = v_r.id;
  return v_count;
end;
$fn$;

create or replace function public.cancel_class_occurrence(p_class_id uuid, p_date date, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_booking record;
  v_deduction record;
  v_count integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_tz text;
begin
  select * into v_class from classes where id = p_class_id;
  if v_class is null then
    raise exception 'Class not found';
  end if;
  if public.my_gym_id() is null or v_class.gym_id is distinct from public.my_gym_id() then
    raise exception 'Not authorized';
  end if;
  if p_date is null then
    raise exception 'Choose the date to cancel';
  end if;

  -- A session that has already happened can't be cancelled: that would refund credits for classes people attended.
  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_class.gym_id;
  if p_date < public.local_date(v_tz) then
    raise exception 'You can''t cancel a session that has already happened.';
  end if;

  insert into class_exceptions (class_id, occurrence_date, cancelled_by, reason)
  values (p_class_id, p_date, auth.uid(), v_reason)
  on conflict (class_id, occurrence_date) do update set reason = coalesce(excluded.reason, class_exceptions.reason);

  for v_booking in
    select id, client_id, status
    from bookings
    where class_id = p_class_id
    and booking_date = p_date
    and status in ('booked', 'waitlist')
  loop
    if v_booking.status = 'booked' then
      for v_deduction in
        select bucket, -delta as amount from credits_ledger where booking_id = v_booking.id and delta < 0
      loop
        insert into credits_ledger (client_id, delta, reason, bucket, booking_id)
        values (v_booking.client_id, v_deduction.amount, 'Refunded ' || v_class.name || ' (cancelled)', v_deduction.bucket, v_booking.id);
      end loop;
    end if;

    update bookings set status = 'cancelled' where id = v_booking.id;

    insert into notifications (client_id, message)
    values (
      v_booking.client_id,
      'Class cancelled: ' || v_class.name || ' on ' || p_date || '.' || case when v_reason is null then '' else ' ' || v_reason end
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Internal: rename a gym. Callers (set_gym_name here, owner_rename_gym in 0131) check who may.
create or replace function public._rename_gym(p_gym uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then
    raise exception 'Enter a name for the gym';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'The gym name can be at most 80 characters';
  end if;
  update gyms set name = v_name where id = p_gym;
  if not found then
    raise exception 'Gym not found';
  end if;
end;
$$;

revoke execute on function public._rename_gym(uuid, text) from public, anon, authenticated;

create or replace function public.set_gym_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_gym_id() is null
     or not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  perform public._rename_gym(public.my_gym_id(), p_name);
end;
$$;

-- Internal: booking rules for a gym (timezone and the overnight blackout window).
create or replace function public._set_gym_booking_settings(p_gym uuid, p_timezone text, p_blackout_start time, p_blackout_end time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception 'Choose a timezone';
  end if;

  -- Reject anything that isn't a real IANA timezone name (raises invalid_parameter_value).
  perform now() at time zone p_timezone;

  if (p_blackout_start is null) <> (p_blackout_end is null) then
    raise exception 'Set both the blackout start and end, or neither';
  end if;

  update gyms
  set timezone = p_timezone,
      blackout_start = p_blackout_start,
      blackout_end = p_blackout_end
  where id = p_gym;
  if not found then
    raise exception 'Gym not found';
  end if;
end;
$$;

revoke execute on function public._set_gym_booking_settings(uuid, text, time, time) from public, anon, authenticated;

create or replace function public.set_gym_booking_settings(p_timezone text, p_blackout_start time, p_blackout_end time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_gym_id() is null
     or not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_booking_settings(public.my_gym_id(), p_timezone, p_blackout_start, p_blackout_end);
end;
$$;

create or replace function public.set_default_checkin_reminder_days(p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_days is null or p_days < 0 or p_days > 60 then
    raise exception 'Days must be between 0 and 60';
  end if;
  update profiles set default_checkin_reminder_days = p_days where id = auth.uid();
end;
$$;

create or replace function public.set_logo_path(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;
  -- null clears the logo. Otherwise the path must be one file in the caller's own folder, like the app's uploads.
  if p_path is not null and p_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'That is not a valid logo path';
  end if;
  update profiles set logo_path = p_path where id = auth.uid();
end;
$$;

-- =====================================================================================================================
-- CM4 (DECISION D4, recommended default). The exercise library had no owner.
-- One library shared by the organisation, with an owner for each entry:
--   * an entry can be edited or deleted by its author (created_by = the coach);
--   * the seeded entries (created_by is null) can be edited or deleted by a gym admin only (profiles.is_gym_admin);
--   * nobody else can; everyone signed in can still read; only a coach can add, and the author is always the adder.
--   * is_active: an entry can be retired instead of deleted (an entry used by a programme cannot be deleted anyway: the
--     foreign keys from workout_exercises and the templates do not cascade). Retired entries are still readable so existing
--     programmes keep their names and videos; the coach pickers should hide them (brief 04).
--   * created_by cannot be changed afterwards, so nobody can adopt someone else's entry.
-- This replaces brief 01's single coach-only rule ("coaches manage exercise_library") with the finer ones below. If per-gym
-- libraries are wanted later, add gym_id and scope these rules; not now.
--
-- PRE-FLIGHT (read-only; who owns the library today):
--   select (created_by is null) as seeded, count(*) from public.exercise_library group by 1;
--   select p.display_name, p.email, count(*) from public.exercise_library l join public.profiles p on p.id = l.created_by group by 1, 2;
-- =====================================================================================================================
alter table public.exercise_library add column if not exists is_active boolean not null default true;

create or replace function public.can_edit_library_exercise(p_created_by uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and public.my_gym_id() is not null
    and (
      p_created_by = auth.uid()
      or (p_created_by is null and exists (select 1 from profiles where id = auth.uid() and is_gym_admin))
    );
$$;

revoke execute on function public.can_edit_library_exercise(uuid) from public, anon;
grant execute on function public.can_edit_library_exercise(uuid) to authenticated;

drop policy if exists "coaches manage exercise_library" on public.exercise_library;
drop policy if exists "coaches add to exercise_library" on public.exercise_library;
drop policy if exists "owners edit exercise_library" on public.exercise_library;
drop policy if exists "owners delete exercise_library" on public.exercise_library;

create policy "coaches add to exercise_library"
  on public.exercise_library for insert
  to authenticated
  with check (created_by = auth.uid() and public.my_gym_id() is not null);

create policy "owners edit exercise_library"
  on public.exercise_library for update
  to authenticated
  using (public.can_edit_library_exercise(created_by))
  with check (public.can_edit_library_exercise(created_by));

create policy "owners delete exercise_library"
  on public.exercise_library for delete
  to authenticated
  using (public.can_edit_library_exercise(created_by));

create or replace function public.exercise_library_protect_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.created_by is distinct from old.created_by then
    raise exception 'The author of a library entry cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function public.exercise_library_protect_author() from public, anon, authenticated;

drop trigger if exists exercise_library_protect_author on public.exercise_library;
create trigger exercise_library_protect_author
  before update on public.exercise_library
  for each row execute function public.exercise_library_protect_author();

-- =====================================================================================================================
-- GA1. The last admin could be demoted.
-- set_gym_admin [0056] now refuses a change that would leave the gym with no admin in coach_gym_memberships, takes a lock on
-- the gym row first (so two admins demoting each other at the same moment cannot both succeed), and says so if the person is
-- not a coach at the gym (it used to do nothing silently). The work is in _set_gym_admin so the owner version in 0131 behaves
-- identically. Message for the screen: 'A gym needs at least one admin. Make someone else an admin first.'
--
-- PRE-FLIGHT (read-only; gyms with no admin right now, which this migration does not change):
--   select g.id, g.name from public.gyms g
--   where not exists (select 1 from public.coach_gym_memberships m where m.gym_id = g.id and m.is_gym_admin);
-- =====================================================================================================================
create or replace function public._set_gym_admin(p_gym uuid, p_coach uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_gym is null or p_coach is null or p_is_admin is null then
    raise exception 'Choose a coach';
  end if;

  -- Serialise changes to one gym's admins.
  perform 1 from gyms where id = p_gym for update;
  if not found then
    raise exception 'Gym not found';
  end if;

  if not exists (select 1 from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym) then
    raise exception 'That coach does not work at this gym.';
  end if;

  if not p_is_admin
     and exists (select 1 from coach_gym_memberships where coach_id = p_coach and gym_id = p_gym and is_gym_admin)
     and not exists (select 1 from coach_gym_memberships where gym_id = p_gym and coach_id <> p_coach and is_gym_admin) then
    raise exception 'A gym needs at least one admin. Make someone else an admin first.';
  end if;

  update coach_gym_memberships set is_gym_admin = p_is_admin where coach_id = p_coach and gym_id = p_gym;
  -- profiles.is_gym_admin is the cache for the coach's ACTIVE gym; only touch it if this is their active gym.
  update profiles set is_gym_admin = p_is_admin where id = p_coach and gym_id = p_gym;
end;
$$;

revoke execute on function public._set_gym_admin(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.set_gym_admin(p_coach_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_gym_id() is null
     or not exists (select 1 from profiles where id = auth.uid() and is_gym_admin) then
    raise exception 'Not authorized';
  end if;
  perform public._set_gym_admin(public.my_gym_id(), p_coach_id, p_is_admin);
end;
$$;

-- Library: send a form to a group, remind who hasn't answered, and take a course off a member (live review Build 3: LB17, LB19, MX5;
-- 26 Nov 2026).
--
-- Before: a form went to one member at a time (assign_form), and nothing told a coach who had answered it; a course could be given
-- (assign_education_course) but never taken away, because coaches have no rule to delete education_course_assignments; and the
-- "New course assigned: <course>" notice stayed on the member's notifications (web and phone) after the course had gone, pointing to
-- nothing (MX5). Read-only check on 26 Nov 2026: 4 such notices for 3 members (3 x "Education Library", 1 x "ZZ edu test", 3 and 4 Oct),
-- none of whom has those courses; no member has a form yet and no group exists yet.
--
-- New:
--   1. assign_form_to_group(form, group) -> {"in_group", "sent", "already_open", "other_gym", "answered_before"}. Library > Forms > a
--      form's menu > Send to a group. Each member of the group at the gym gets the form and the same in-app notice as assign_form ("You
--      have a new form to fill out: <form>"). A member who already has that form open (sent, not answered yet) is skipped, so nobody has it
--      open twice; a member who answered it before gets it again (the screen says how many before it is sent). Group members who are at
--      another gym, and coaches, are skipped. Sends of one form wait for each other (a lock per form), so a double tap, or two coaches at
--      once, can't give a member the form twice.
--   2. remind_form(form, members) -> {"reminded", "recently_reminded", "not_waiting"}. Library > Forms > who has answered > Remind. Each of
--      the members given who is at the gym and still has the form open gets an in-app notice "Reminder: please fill in your form: <form>".
--      Anyone already reminded about that form in the last 12 hours is skipped (a second tap can't send it twice), and so is anyone who
--      has answered or doesn't have the form. At most 500 members a call. In-app only, like the notice when the form was sent (no push).
--   3. unassign_education_course(course, member) -> how many assignments were removed (0 when the member didn't have it). Library >
--      Education > a course > "N assigned" > Unassign. The member's progress (lessons marked done) is kept, so giving the course back
--      later shows it again.
--   4. A trigger on education_course_assignments (after delete, any route: unassign above, deleting the course, deleting the member) that
--      clears the member's "New course assigned" notice for it: the notice written with that assignment (assign_education_course writes
--      both in one transaction, so they carry the same time; checked live on 26 Nov 2026, the 1 assignment there has its notice at the
--      same time), or a notice with the course's title when the member has no other course of that title. Cleared = what a member's own
--      Clear does (cleared_at and read_at set): it leaves their list and the dot on the bell, on the web and the phone, which both read
--      notifications without cleared ones. Nothing is deleted.
--   5. Once, now: the same clean-up for notices already pointing to nothing: every "New course assigned" notice not cleared whose member
--      has no assignment from the same moment and no course of that title. Expected on 26 Nov 2026: the 4 notices above.
--
-- Who may: a coach working in the gym (their active gym, my_gym_id()) of the form, group or course, and only for members of that gym
-- (client_gym_id()). Members, coaches at another gym and anyone signed out are refused, and nothing is changed. Any coach at the gym, not
-- only the member's own coach: groups and forms are the gym's (0054), and coaches at a gym already read every member's forms and courses
-- there (0053). The functions run as the table owner because coaches have no rule to write form_assignments, delete
-- education_course_assignments or write a member's notifications; each checks the gym itself.
--
-- Apply: BEFORE the deploy. The new Library screens call these three functions. Deployed first, Send to a group, Remind and Unassign say
-- "This needs a database update (migration 0175) that hasn't been applied yet" and change nothing; everything else on the page works.
-- The app now live calls none of them, so it works the same with this applied (deleting a course now also clears its notices).
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... already exists and is not this file's"). A second run finds this
-- file's own bodies and passes. Safe to run twice: the trigger is replaced, and the clean-up in 5. only touches notices not cleared yet.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.assign_form_to_group(uuid, uuid)') is not null as group_send,
--          to_regprocedure('public.remind_form(uuid, uuid[])') is not null as remind,
--          to_regprocedure('public.unassign_education_course(uuid, uuid)') is not null as unassign,
--          to_regprocedure('public.clear_course_assigned_notice()') is not null as notice_trigger_fn,
--          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'cleared_at') as cleared_col,
--          to_regprocedure('public.my_gym_id()') is not null as needs_my_gym_id,
--          to_regprocedure('public.client_gym_id(uuid)') is not null as needs_client_gym_id;
-- Expected before: false, false, false, false, true, true, true.
--   select tgname from pg_trigger where tgrelid = 'public.education_course_assignments'::regclass and not tgisinternal;
-- Expected before: no rows.
--   -- The notices the clean-up in 5. will clear:
--   select n.client_id, substr(n.message, 22) as course, n.created_at::date
--   from public.notifications n
--   where n.cleared_at is null and left(n.message, 21) = 'New course assigned: '
--     and not exists (select 1 from public.education_course_assignments a where a.client_id = n.client_id and a.assigned_at = n.created_at)
--     and not exists (select 1 from public.education_course_assignments a join public.education_courses c on c.id = a.course_id
--                     where a.client_id = n.client_id and n.message = 'New course assigned: ' || c.title)
--   order by n.created_at;
-- Expected on 26 Nov 2026: 4 rows, 3 members: Education Library (3 Oct, twice), ZZ edu test (3 Oct), Education Library (4 Oct).
--   select count(*) filter (where cleared_at is null) as not_cleared, count(*) as all_notices from public.notifications;
-- Note both numbers (for AFTER).
--   select count(*) from public.form_assignments;  select count(*) from public.education_course_assignments;
-- Expected on 26 Nov 2026: 0 and 1. Note them (this file adds and removes none).
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's first query again)
-- Expected after: true, true, true, true, true, true, true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef
--   from pg_proc p where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('assign_form_to_group', 'remind_form', 'unassign_education_course', 'clear_course_assigned_notice')
--   order by 1;
-- Expected after: assign_form_to_group f216b6ce2bca0cd020e4c2146168f228 true, clear_course_assigned_notice
-- ecc004952ec3e8021a26bb1526aaf9d8 true, remind_form 42232c2e3a8dad504254d709c3ad6588 true, unassign_education_course
-- 1dd0f576c9e9462c210e9996a5c65962 true (this file's bodies: the values in the guard below).
--   select has_function_privilege('authenticated', 'public.assign_form_to_group(uuid, uuid)', 'execute') as coaches,
--          has_function_privilege('anon', 'public.assign_form_to_group(uuid, uuid)', 'execute') as anyone,
--          has_function_privilege('anon', 'public.remind_form(uuid, uuid[])', 'execute') as anyone_remind,
--          has_function_privilege('anon', 'public.unassign_education_course(uuid, uuid)', 'execute') as anyone_unassign,
--          has_function_privilege('authenticated', 'public.clear_course_assigned_notice()', 'execute') as trigger_callable;
-- Expected: true, false, false, false, false (signed-in users can call the three, and each refuses anyone but a coach at the gym).
--   (the PRE-FLIGHT's pg_trigger query again)
-- Expected after: education_course_assignments_clear_notice.
--   (the PRE-FLIGHT's clean-up query again)
-- Expected after: no rows.
--   (the PRE-FLIGHT's notifications count again)
-- Expected after: not_cleared 4 lower than before (on 26 Nov 2026), all_notices the same (nothing deleted).
--   (the PRE-FLIGHT's form_assignments and education_course_assignments counts again)
-- Expected after: the same (0 and 1 on 26 Nov 2026).
--
-- Write checks (test accounts, on a sandbox, not the live project): as a coach at gym A, with a group of members M1 (A, has the form
-- open), M2 (A, answered it before), M3 (A, never had it), M4 (gym B) and a coach: assign_form_to_group -> sent 2 (M2, M3), already_open
-- 1, other_gym 2, answered_before 1; M2 and M3 each have one new open assignment and one new notice; running it again -> sent 0,
-- already_open 3. As a coach at gym B, or a member, or with a form or group of gym B -> refused, nothing written. remind_form(form,
-- [M1, M2, M3, M4]) -> reminded M1 M2 M3 (all open now), not_waiting 1 (M4); again at once -> reminded 0, recently_reminded 3. As a coach at
-- gym B or a member -> refused. Give a test member a course (assign_education_course), then unassign_education_course -> 1, the
-- assignment is gone, their "New course assigned" notice has cleared_at and read_at set, their lessons marked done are still there;
-- again -> 0. As a coach at gym B, or the member themselves -> refused. Give the course again, then delete the course as its coach -> the
-- new notice is cleared too.
-- Then, in the app as a coach at a sandbox gym: Library > Forms > a form's menu > Send to a group; the form's "N sent · N answered" line
-- lists the members, Remind names them in the confirm; Library > Education > a course > "N assigned" > Unassign (confirm) -> the member's
-- notice leaves their notifications on the web and the phone (pull to refresh).
--
-- REVERSE: drop trigger if exists education_course_assignments_clear_notice on public.education_course_assignments;
--   drop function if exists public.clear_course_assigned_notice(); drop function if exists public.unassign_education_course(uuid, uuid);
--   drop function if exists public.remind_form(uuid, uuid[]); drop function if exists public.assign_form_to_group(uuid, uuid).
--   The notices cleared in 5. can be shown again with the PRE-FLIGHT's list of them: update public.notifications set cleared_at = null
--   where id in (<their ids>) (read_at stays set, so the bell's dot doesn't come back).
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
      ('assign_form_to_group', 'f216b6ce2bca0cd020e4c2146168f228'),
      ('remind_form', '42232c2e3a8dad504254d709c3ad6588'),
      ('unassign_education_course', '1dd0f576c9e9462c210e9996a5c65962'),
      ('clear_course_assigned_notice', 'ecc004952ec3e8021a26bb1526aaf9d8')
    ) as t(name, accepted)
  loop
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and v_md5 <> v_check.accepted then
      raise exception '% already exists and is not this file''s (body md5 %), so nothing was changed.', v_check.name, v_md5;
    end if;
  end loop;

  foreach v_name in array array['my_gym_id', 'client_gym_id'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name) then
      raise exception 'function % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  foreach v_name in array array['public.form_templates', 'public.form_assignments', 'public.client_groups', 'public.client_group_members',
                                'public.education_courses', 'public.education_course_assignments', 'public.notifications'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('notifications', 'cleared_at'), ('form_templates', 'gym_id'), ('form_assignments', 'completed_at'), ('client_groups', 'gym_id'),
      ('education_courses', 'gym_id'), ('education_course_assignments', 'assigned_at')
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

-- =====================================================================================================================================
-- 1. Send a form to a group
-- =====================================================================================================================================
create or replace function public.assign_form_to_group(p_template_id uuid, p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_template form_templates;
  v_group_gym uuid;
  v_group uuid[];
  v_here uuid[];
  v_send uuid[];
  v_answered_before integer;
begin
  -- my_gym_id() is the gym a coach is working in; it is empty for a member or anyone signed out
  if v_gym is null then
    raise exception 'Only a coach can send a form.';
  end if;

  select * into v_template from form_templates where id = p_template_id;
  if not found or v_template.gym_id is distinct from v_gym then
    raise exception 'That form isn''t at the gym you''re working in.';
  end if;

  select gym_id into v_group_gym from client_groups where id = p_group_id;
  if not found or v_group_gym is distinct from v_gym then
    raise exception 'That group isn''t at the gym you''re working in.';
  end if;

  -- one send of this form at a time, so a double tap or two coaches at once can't give a member the form twice
  perform pg_advisory_xact_lock(hashtextextended('form-send:' || p_template_id::text, 0));

  v_group := array(select distinct m.client_id from client_group_members m where m.group_id = p_group_id);
  -- members of this gym only (client_gym_id is empty for a coach)
  v_here := array(select x from unnest(v_group) as x where public.client_gym_id(x) = v_gym);
  -- not anyone who has this form open already
  v_send := array(
    select x from unnest(v_here) as x
    where not exists (
      select 1 from form_assignments a where a.template_id = p_template_id and a.client_id = x and a.completed_at is null
    )
  );
  select count(*) into v_answered_before
  from unnest(v_send) as x
  where exists (select 1 from form_assignments a where a.template_id = p_template_id and a.client_id = x and a.completed_at is not null);

  insert into form_assignments (template_id, client_id)
  select p_template_id, x from unnest(v_send) as x;

  insert into notifications (client_id, message)
  select x, 'You have a new form to fill out: ' || v_template.name from unnest(v_send) as x;

  return jsonb_build_object(
    'in_group', cardinality(v_group),
    'sent', cardinality(v_send),
    'already_open', cardinality(v_here) - cardinality(v_send),
    'other_gym', cardinality(v_group) - cardinality(v_here),
    'answered_before', v_answered_before
  );
end;
$fn$;

revoke execute on function public.assign_form_to_group(uuid, uuid) from public, anon;
grant execute on function public.assign_form_to_group(uuid, uuid) to authenticated;

-- =====================================================================================================================================
-- 2. Remind members who haven't answered a form
-- =====================================================================================================================================
create or replace function public.remind_form(p_template_id uuid, p_client_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_template form_templates;
  v_message text;
  v_asked uuid[];
  v_waiting uuid[];
  v_send uuid[];
begin
  if v_gym is null then
    raise exception 'Only a coach can send a reminder.';
  end if;

  select * into v_template from form_templates where id = p_template_id;
  if not found or v_template.gym_id is distinct from v_gym then
    raise exception 'That form isn''t at the gym you''re working in.';
  end if;

  v_asked := array(select distinct x from unnest(coalesce(p_client_ids, '{}'::uuid[])) as x where x is not null);
  if cardinality(v_asked) > 500 then
    raise exception 'Remind at most 500 members at a time.';
  end if;

  -- one reminder of this form at a time, so the 12-hour check below holds for a double tap too
  perform pg_advisory_xact_lock(hashtextextended('form-remind:' || p_template_id::text, 0));

  v_message := 'Reminder: please fill in your form: ' || v_template.name;
  -- members of this gym who still have the form open
  v_waiting := array(
    select x from unnest(v_asked) as x
    where public.client_gym_id(x) = v_gym
      and exists (select 1 from form_assignments a where a.template_id = p_template_id and a.client_id = x and a.completed_at is null)
  );
  -- not anyone reminded about this form in the last 12 hours
  v_send := array(
    select x from unnest(v_waiting) as x
    where not exists (
      select 1 from notifications n where n.client_id = x and n.message = v_message and n.created_at > now() - interval '12 hours'
    )
  );

  insert into notifications (client_id, message)
  select x, v_message from unnest(v_send) as x;

  return jsonb_build_object(
    'reminded', cardinality(v_send),
    'recently_reminded', cardinality(v_waiting) - cardinality(v_send),
    'not_waiting', cardinality(v_asked) - cardinality(v_waiting)
  );
end;
$fn$;

revoke execute on function public.remind_form(uuid, uuid[]) from public, anon;
grant execute on function public.remind_form(uuid, uuid[]) to authenticated;

-- =====================================================================================================================================
-- 3. Take a course off a member
-- =====================================================================================================================================
create or replace function public.unassign_education_course(p_course_id uuid, p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_course_gym uuid;
  v_removed integer;
begin
  if v_gym is null then
    raise exception 'Only a coach can take a course off a member.';
  end if;

  select gym_id into v_course_gym from education_courses where id = p_course_id;
  if not found or v_course_gym is distinct from v_gym then
    raise exception 'That course isn''t at the gym you''re working in.';
  end if;

  if public.client_gym_id(p_client_id) is distinct from v_gym then
    raise exception 'That member isn''t at the gym you''re working in.';
  end if;

  -- their lessons marked done stay; the trigger in 4. clears their "New course assigned" notice
  delete from education_course_assignments where course_id = p_course_id and client_id = p_client_id;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$fn$;

revoke execute on function public.unassign_education_course(uuid, uuid) from public, anon;
grant execute on function public.unassign_education_course(uuid, uuid) to authenticated;

-- =====================================================================================================================================
-- 4. A course taken away clears its "New course assigned" notice
-- =====================================================================================================================================
create or replace function public.clear_course_assigned_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_title text;
begin
  -- empty when the course itself is being deleted (its assignments go with it)
  select c.title into v_title from education_courses c where c.id = old.course_id;

  update notifications n
     set cleared_at = now(), read_at = coalesce(n.read_at, now())
   where n.client_id = old.client_id
     and n.cleared_at is null
     and left(n.message, 21) = 'New course assigned: '
     and (
       -- written with this assignment (assign_education_course writes both in one transaction)
       n.created_at = old.assigned_at
       or (
         v_title is not null
         and n.message = 'New course assigned: ' || v_title
         and not exists (
           select 1 from education_course_assignments a join education_courses c on c.id = a.course_id
           where a.client_id = old.client_id and c.title = v_title
         )
       )
     );
  return null;
end;
$fn$;

revoke execute on function public.clear_course_assigned_notice() from public, anon, authenticated;

drop trigger if exists education_course_assignments_clear_notice on public.education_course_assignments;
create trigger education_course_assignments_clear_notice
  after delete on public.education_course_assignments
  for each row execute function public.clear_course_assigned_notice();

-- =====================================================================================================================================
-- 5. Once: notices already pointing to a course the member no longer has
-- =====================================================================================================================================
update public.notifications n
   set cleared_at = now(), read_at = coalesce(n.read_at, now())
 where n.cleared_at is null
   and left(n.message, 21) = 'New course assigned: '
   and not exists (
     select 1 from public.education_course_assignments a where a.client_id = n.client_id and a.assigned_at = n.created_at
   )
   and not exists (
     select 1 from public.education_course_assignments a join public.education_courses c on c.id = a.course_id
     where a.client_id = n.client_id and n.message = 'New course assigned: ' || c.title
   );

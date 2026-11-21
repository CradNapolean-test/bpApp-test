-- Gym programmes (owner's list item 7, 19 Nov 2026; length fixed when it starts, owner's decision 21 Nov 2026): a programme given to
-- everyone at a gym is the gym's programme for a set number of weeks, and it reaches the members who join that gym later too, on the gym's
-- CURRENT week, so everyone does the same workout on the same day (the gym calendar of D9, migration 0167).
--
-- The owner's year, in their words: "We run in 12 week training programmes split into 4 week blocks, the 12th week is always peak week
-- (testing week, runs the same each time), so it goes 4 week block 4 week block 3 week block 1 week peak week." Each block is its own
-- template started for everyone at the gym: on 21 Nov 2026 Salford Quays is on November Weeks 9-11 (for everyone from Tue 10 Nov, so week 1
-- is Mon 9 Nov and its 3 weeks end Sun 29 Nov); peak week would follow from Mon 30 Nov to Sun 6 Dec.
--
-- Before: "Start a programme" -> "Everyone at the gym" (programme_rollouts.audience 'all', 0094 and 0133) gave each member at the gym their
-- own copy on the start date, once (apply_programme_rollout sets applied_at). Anyone who joined after that got nothing. Read-only check on
-- 20 Nov 2026: the 3 members who joined Salford Quays after November Weeks 9-11 started were each given a 3-week programme by hand as their
-- own 1:1 programme, so their weeks count from their own start (9, 10 and 16 Nov) instead of the gym's Monday 9 Nov.
--
-- New:
--   * Length. A start for everyone has a length in weeks, 1 to 12 (programme_rollouts.weeks, new), set when it is scheduled: Start a
--     programme -> Everyone at the gym shows a Length that starts at the template's number of weeks (4, 4, 3 or 1 for the owner's blocks)
--     and the dates it will run. Week 1 is the Monday of the start date's week (as week_one, 0167), so its last day is that Monday
--     + 7 x weeks - 1, a Sunday. It never moves when the template is edited, its weeks are added or deleted, or templates are deleted: only
--     a gym admin can change it (change_gym_programme, below). Existing starts for everyone get their template's weeks now (backfill below).
--     A start for chosen members has no length (weeks empty), as before.
--   * The gym's programme today (_gym_programme_today): the newest start for everyone at the gym that has been given out, whose start date
--     has arrived, that has not ended (programme_rollouts.ended_at, new) and whose last day has not passed. When a newer one is given out,
--     every older one at the gym that is still open ends (apply_programme_rollout, below), so an older one is never the gym's programme
--     again, even if the newer one's template is deleted later. Existing ones: each older one is ended as of the next one's start date
--     (backfill below).
--   * When a member at that gym finishes setting up their profile (client_profiles.onboarding_completed_at goes from empty to a date, on
--     the web or the phone: trigger client_profiles_gym_programme), they get their own copy of the template as it is now, starting today,
--     with week_one = the gym programme's Monday: the app counts their weeks from it (programWeekStart), so they are on the gym's current
--     week and do the same workout as everyone that day. The copy has the rollout's id, so it counts in "In use by" / "Apply to everyone
--     on this rollout" (D8) like everyone else's. The member gets an in-app notice. Nobody is given anything:
--       - who already has a copy from that rollout (never a second copy);
--       - who has another programme that runs over the same dates (a 1:1 programme their coach gave them, or a group one). Theirs is not
--         replaced: the member is listed on the template as "Not given" with the programme in their way, and their coach (or a gym admin)
--         picks "Give it to them" (it takes over from today; theirs stays on file, and any of theirs that has not started yet, or starts
--         today, now starts the Monday after the gym programme's last week, so it cannot take over part-way) or "Keep theirs"
--         (gym_programme_waiting, new). A programme with no workouts yet counts as one week long, so a 1:1 programme a coach has only just
--         made still counts;
--       - when the gym has no programme today.
--     Giving it can never stop a member finishing their profile: an error is caught, nothing is half-made, and the member is listed as
--     "Not given" with reason 'failed' so the coach can give it from the template.
--   * gym_programmes(): for the coach's template list, "Gym programme: Salford Quays · Mon 9 Nov - Sun 29 Nov (3 weeks) · 16 members":
--     the gym's programme today, or when it has none, the newest one that has ended while its last day has not passed (shown as
--     ended), with the members still on it (as programme_rollout_usage, 0167), how many joined later, and the members waiting (the coach's
--     own members; every one for a gym admin), each with every programme of theirs "Give it to them" would move, so the confirm names
--     them all. Coaches at that gym only.
--   * change_gym_programme(rollout, weeks, end): a gym admin only, at their gym. End it now (new members stop getting it; the members on it
--     keep it and nothing they logged changes; it cannot be opened again), or give it a new length, 1 to 12 weeks. A length that would end
--     it before today ends it today (its length becomes the weeks up to this one). One that has ended, or whose last day has passed, can't
--     be changed: start a new one for everyone. A start not given out yet can have its length changed, not be ended (cancel it instead).
--   * resolve_gym_programme_waiting(rollout, member, give): "Give it to them" / "Keep theirs" for a member listed as Not given. The member's
--     coach or a gym admin, at the member's gym, while it is the gym's programme.
--   * programme_rollouts rules: the one "for all" rule let any coach at the gym change a rollout straight through the API: end a gym
--     programme or change its length without being a gym admin, open an ended one again, or turn chosen members into everyone. Now a coach
--     can read their gym's rollouts and cancel one that has not been given out yet (what the app does, cancelProgrammeRollout), one for
--     everyone only as a gym admin; everything else goes through the functions (schedule_programme_rollout, apply_programme_rollout,
--     change_gym_programme), which run as the table owner.
--   * Deleting a template deletes its rollouts too (on delete cascade, 0094), past those rules. A new trigger on program_templates
--     (program_templates_refuse_gym_programme_delete) lets only a gym admin delete a template with a start for everyone that has not
--     started yet, or one whose last day has not passed and that has not ended, so a coach can't cancel a start for everyone or end the
--     gym programme that way (one that has ended can't be opened again, so deleting its template changes nothing). The app says so on
--     Delete template. Nothing else is needed: the length no longer comes from the template, and an older gym programme has always
--     ended, so deleting a template can't shorten, end or reopen anything else.
--   * set_programme_week_one (the start-date trigger of 0167) replaced: a late joiner's copy keeps its week 1 (the gym's Monday) when a
--     coach moves its start date within the copy's weeks, so the member stays on the gym's week instead of going back to week 1. Moved
--     past its last week, it starts again from week 1 as before (kept, it would be finished on the day it starts). A copy whose rollout
--     has gone (deleted with its template, so rollout_id is empty) still has its week 1 and is treated the same: before, its week 1 stayed
--     where it was whatever start date a coach gave it. Every other copy as before.
--   * apply_programme_rollout (0130) replaced: it can be called by any coach and only checked the gym, so a coach who isn't a gym admin
--     could give out a gym admin's scheduled start for everyone weeks early. After that nobody could cancel it, and members who joined
--     before its start date never got it. Signed in, it now gives out one for everyone only for a gym admin (as only a gym admin can
--     start one, 0133), and none before its start date at the gym (the daily job gives a later start out on its day), so Start a
--     programme with a later date can't start it now either. Giving out one for everyone ends every older one at the gym that is still
--     open (above); one that starts before a gym programme that has already started ends straight away, as it can never be the gym's
--     programme. Rollouts are given out one at a time per gym (a lock), so two given out at once (two gym admins, or one and the daily
--     job) can't both stay open, and one can't be given out twice.
--     The daily job, and everything else in it, as before.
--   * schedule_programme_rollout (0133) replaced by one that also takes the length (p_weeks, 1 to 12; empty = the template's weeks, so
--     the app before this deploy still works). Everything else as in 0133.
--
-- Not changed: apply_due_programme_rollouts, instantiate_template_core (called as it is), apply_template_to_rollout,
-- programme_rollout_usage, and members' week numbering (week_one and programWeekStart). The migration itself gives nobody a programme and
-- changes no member's programme: late joiners are given it from the next profile set up. The 3 members above stay on their own programmes.
--
-- Apply: BEFORE the deploy. The new app starts a programme with a length (schedule_programme_rollout with p_weeks), which the database
-- does not have until this is applied, and reads the length of scheduled starts (programme_rollouts.weeks). The app now live works with it
-- applied: its Start a programme gets the template's weeks as the length.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... is not the one from migration 0172"), or a function it replaces is not
-- the live one it was written against: set_programme_week_one from 0167, apply_programme_rollout from 0130, schedule_programme_rollout
-- from 0133 ("... is not the one from migration 0167"). A second run finds this file's own bodies and passes. Safe to run twice.
--
-- PRE-FLIGHT (read-only):
--   select to_regclass('public.gym_programme_waiting') is not null as waiting_table,
--          to_regprocedure('public.gym_programmes()') is not null as list_fn,
--          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'programme_rollouts' and column_name = 'ended_at') as ended_col,
--          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'programme_rollouts' and column_name = 'weeks') as weeks_col,
--          to_regprocedure('public._rollout_live_copies(uuid)') is not null as needs_0167,
--          to_regprocedure('public.instantiate_template_core(uuid, uuid, text, date, uuid)') is not null as needs_0152,
--          to_regprocedure('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean)') is not null as schedule_0133;
-- Expected before: false, false, false, false, true, true, true.
--
--   -- 1. Every start for everyone, with its template's weeks now (the length the backfill gives it):
--   select g.name, r.program_name, r.start_date, r.applied_at is not null as given_out,
--          r.start_date - (extract(isodow from r.start_date)::integer - 1) as week_one,
--          (select max(d.week_num) from public.program_template_days d where d.template_id = r.template_id) as template_weeks,
--          (select count(*) from public.workout_programs wp where wp.rollout_id = r.id) as copies
--   from public.programme_rollouts r join public.gyms g on g.id = r.gym_id
--   where r.audience = 'all' order by g.name, r.start_date;
-- Expected on 21 Nov 2026: two rows, both Salford Quays: October Weeks 5-8, start 10 Oct, given out, week_one 5 Oct, 3 weeks, 3 copies;
-- November Weeks 9-11, start 10 Nov, given out, week_one 9 Nov, 3 weeks, 16 copies. Worsley has none, and none is scheduled.
--
--   -- 2. Members at that gym who have finished setting up and have no copy (the migration gives them nothing; listed for comparison):
--   select count(*) from public.profiles c join public.client_profiles cp on cp.client_id = c.id
--   where c.role = 'client' and cp.onboarding_completed_at is not null
--     and c.gym_id = (select gym_id from public.programme_rollouts where program_name = 'November Weeks 9-11' and audience = 'all')
--     and not exists (select 1 from public.workout_programs wp join public.programme_rollouts r on r.id = wp.rollout_id
--                     where wp.client_id = c.id and r.program_name = 'November Weeks 9-11' and r.audience = 'all');
-- Expected on 20 Nov 2026: 3. And every member has finished setting up:
--   select count(*) from public.client_profiles where onboarding_completed_at is null;
-- Expected: 0.
--
--   -- 3. The rules on programme_rollouts, and every rollout copy (to compare after):
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'programme_rollouts' order by 1;
-- Expected before: "gym coaches manage programme_rollouts", ALL.
--   select count(*) from public.workout_programs where rollout_id is not null;
-- Expected on 21 Nov 2026: 23.
--
--   -- 4. Rollouts already given out ahead of their start date (apply_programme_rollout no longer does that when someone is signed in;
--   --    any listed here stay as they are, and end nothing until their start date):
--   select g.name, r.program_name, r.audience, r.start_date, r.applied_at
--   from public.programme_rollouts r join public.gyms g on g.id = r.gym_id
--   where r.applied_at is not null and r.start_date > public.local_date(coalesce(nullif(g.timezone, ''), 'UTC'));
-- Expected on 21 Nov 2026: none (and no rollout is waiting to be given out).
--
-- AFTER (read-only):
--   select to_regprocedure('public.gym_programmes()') is not null, to_regprocedure('public.change_gym_programme(uuid, integer, boolean)') is not null,
--          to_regprocedure('public.resolve_gym_programme_waiting(uuid, uuid, boolean)') is not null,
--          (select relrowsecurity from pg_class where oid = 'public.gym_programme_waiting'::regclass),
--          (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gym_programme_waiting'),
--          exists (select 1 from pg_trigger where tgrelid = 'public.client_profiles'::regclass and tgname = 'client_profiles_gym_programme'),
--          exists (select 1 from pg_trigger where tgrelid = 'public.program_templates'::regclass and tgname = 'program_templates_refuse_gym_programme_delete'),
--          to_regprocedure('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer)') is not null,
--          to_regprocedure('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean)') is null;
-- Expected: true, true, true, true, 0, true, true, true, true (the waiting list has no rules: only the functions read and write it).
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'programme_rollouts' order by 1;
-- Expected: "gym coaches cancel scheduled programme_rollouts" DELETE, "gym coaches read programme_rollouts" SELECT.
--   select p.prosrc like '%given out on that day, not before%' from pg_proc p
--   where p.pronamespace = 'public'::regnamespace and p.proname = 'apply_programme_rollout';
-- Expected: true.
--   -- Every rollout's length, last day and end:
--   select r.program_name, r.audience, r.start_date, r.weeks,
--          r.start_date - (extract(isodow from r.start_date)::integer - 1) + 7 * r.weeks - 1 as last_day, r.ended_at
--   from public.programme_rollouts r order by r.start_date, r.created_at;
-- Expected on 21 Nov 2026: the four for chosen members (September Weeks 1-4 twice, test 2, October Weeks 5-8 from 19 Oct) have no weeks,
-- no last day and no end; October Weeks 5-8 (all, 10 Oct): 3 weeks, last day Sun 25 Oct, ended 2026-11-10 00:00:00+00 (midnight in
-- London as November Weeks 9-11 started); November Weeks 9-11 (all, 10 Nov): 3 weeks, last day Sun 29 Nov, not ended.
--   select g.name, t.program_name, t.week_one, t.weeks, t.last_day from public.gyms g cross join lateral public._gym_programme_today(g.id) t;
-- Expected on 21 Nov 2026: Salford Quays, November Weeks 9-11, 9 Nov, 3, 29 Nov (one row; Worsley has none).
--   -- Nobody was given anything: the rollout-copy count from PRE-FLIGHT 3 is the same (23), and the waiting list is empty:
--   select count(*) from public.workout_programs where rollout_id is not null;  select count(*) from public.gym_programme_waiting;
-- Then, signed in as a gym admin in the app: Library -> Programmes shows "Gym programme: Salford Quays · Mon 9 Nov - Sun 29 Nov
-- (3 weeks) · 16 members" on November Weeks 9-11, and the template shows when new members stop getting it (Sun 29 Nov), a Length and
-- an "End gym programme" button. Start a programme on the peak week template -> Everyone at the gym shows Starts Mon 30 Nov ("the day
-- after November Weeks 9-11 ends") and Length 1 week, Mon 30 Nov - Sun 6 Dec (close the sheet without starting it).
--
-- Write tests to run with test accounts on a sandbox project (not the live one): a gym admin schedules a start for everyone with length 3
-- -> weeks 3; with no length -> the template's weeks (16 weeks -> 12, none -> 1); length 0 or 13 -> refused; for chosen members -> no
-- weeks; the template's weeks added, deleted or the template of another rollout deleted -> the gym programme's last day is the same;
-- a new member at a gym with a gym programme finishes onboarding -> one copy, start today, week_one = the gym programme's Monday, a
-- notice; finishing again (or a second save) -> no second copy; a member with a running 1:1 programme -> no copy, listed for their coach,
-- "Give it to them" -> copy, "Keep theirs" -> off the list; a member whose 1:1 starts next Monday -> listed, "Give it to them" -> copy,
-- and the 1:1 now starts the Monday after the gym programme; a late joiner's copy (3 weeks, week_one 9 Nov) moved to start 23 Nov ->
-- week_one stays 9 Nov, moved to 30 Nov -> week_one 30 Nov, and the same once its template (so its rollout) is deleted; the daily job
-- gives out the next block on its start date -> the one before it is ended (ended_at set); then that block's template deleted by a gym
-- admin -> the gym has no programme and a new member is given nothing (the older one is not opened again); a start for everyone given
-- out with a start date before the gym programme's -> ended straight away, the gym programme stays; two starts for everyone given out at
-- once at one gym (two sessions, the first left uncommitted) -> the second waits for it and only the newer one stays open, and the same
-- rollout given out in both -> one set of copies; change_gym_programme by a gym admin:
-- weeks 4 -> last day a week later; a length ending before today -> ended today with weeks = the current week; end -> ended; on an ended
-- one or one whose last day has passed -> refused; on a scheduled one: length changed, end refused; by a coach who isn't a gym admin, or
-- a member -> refused, nothing changed; a non-admin coach cannot change ended_at or weeks by a direct update, nor cancel a scheduled start
-- for everyone (direct delete), but can cancel one for chosen members; a non-admin coach cannot delete the template of the gym programme
-- or of a scheduled start for everyone (refused, nothing deleted), but can delete one whose last day has passed or that has ended
-- before its last day (End gym programme, or a newer one given out), and a gym admin can
-- delete either; a non-admin coach calling apply_programme_rollout on a scheduled start for everyone -> refused, still not given out and
-- still cancellable by a gym admin; a gym admin calling it on one that starts next week, or on one for chosen members that starts tomorrow
-- -> refused; Start a programme for today (schedule_programme_rollout, start now) -> given out as before; the daily job on the start
-- date -> given out as before; a member cannot call gym_programmes, change_gym_programme or resolve_gym_programme_waiting.
--
-- ROLLBACK: run set_programme_week_one's definition from migration 0167 again (its trigger stays);
--           run apply_programme_rollout's definition from migration 0130 again;
--           drop function public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer); then run
--           schedule_programme_rollout's definition, revoke and grant from migration 0133 again (the app must be the one before this
--           deploy, which does not send a length);
--           drop trigger client_profiles_gym_programme on public.client_profiles; drop function public.client_profiles_join_gym_programme();
--           drop trigger program_templates_refuse_gym_programme_delete on public.program_templates;
--           drop function public.program_templates_refuse_gym_programme_delete();
--           drop function public.resolve_gym_programme_waiting(uuid, uuid, boolean); drop function public.change_gym_programme(uuid, integer, boolean);
--           drop function public.gym_programmes(); drop function public._give_gym_programme(uuid, uuid, boolean);
--           drop function public._gym_programme_today(uuid); drop table public.gym_programme_waiting;
--           alter table public.programme_rollouts drop constraint programme_rollouts_weeks_check, drop column weeks, drop column ended_by,
--             drop column ended_at;
--           drop policy "gym coaches read programme_rollouts" on public.programme_rollouts;
--           drop policy "gym coaches cancel scheduled programme_rollouts" on public.programme_rollouts;
--           create policy "gym coaches manage programme_rollouts" on public.programme_rollouts for all
--             using (gym_id = public.my_gym_id()) with check (gym_id = public.my_gym_id());
--           Copies already given to late joiners stay (they are ordinary programmes).

do $guard$
declare
  v_md5 text;
  v_check record;
begin
  if to_regclass('public.programme_rollouts') is null then raise exception 'programme_rollouts is missing (migration 0094)'; end if;
  if to_regclass('public.notifications') is null then raise exception 'notifications is missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workout_programs' and column_name = 'week_one') then
    raise exception 'workout_programs.week_one is missing (migration 0167)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_profiles' and column_name = 'onboarding_completed_at') then
    raise exception 'client_profiles.onboarding_completed_at is missing (migration 0083)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_gym_admin') then
    raise exception 'profiles.is_gym_admin is missing';
  end if;
  if to_regprocedure('public.instantiate_template_core(uuid, uuid, text, date, uuid)') is null then raise exception 'instantiate_template_core is missing (migration 0152)'; end if;
  if to_regprocedure('public._rollout_live_copies(uuid)') is null then raise exception '_rollout_live_copies is missing (migration 0167)'; end if;
  if to_regprocedure('public.local_date(text, timestamptz)') is null then raise exception 'local_date is missing (migration 0129)'; end if;
  if to_regprocedure('public.client_gym_id(uuid)') is null then raise exception 'client_gym_id is missing (migration 0056)'; end if;
  if to_regprocedure('public.same_gym_as_client(uuid, uuid)') is null then raise exception 'same_gym_as_client is missing'; end if;
  if to_regprocedure('public.is_coach_of(uuid)') is null then raise exception 'is_coach_of is missing'; end if;
  if to_regprocedure('public.my_gym_id()') is null then raise exception 'my_gym_id is missing (migration 0052)'; end if;
  if to_regprocedure('public.is_admin_of_gym(uuid)') is null then raise exception 'is_admin_of_gym is missing (migration 0056)'; end if;
  if to_regprocedure('public.set_programme_week_one()') is null then raise exception 'set_programme_week_one is missing (migration 0167)'; end if;
  if to_regprocedure('public.apply_programme_rollout(uuid)') is null then raise exception 'apply_programme_rollout is missing (migration 0130)'; end if;
  if to_regprocedure('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean)') is null
     and to_regprocedure('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer)') is null then
    raise exception 'schedule_programme_rollout is missing (migration 0133)';
  end if;

  -- Each function by its exact arguments: one this migration creates may not exist yet with another body (a second run finds its own);
  -- one it replaces must be the live one from the migration named, or this file's (a second run). schedule_programme_rollout with six
  -- arguments is 0133's, dropped below for the one with the length.
  for v_check in
    select * from (values
      ('public._gym_programme_today(uuid)', '0172', array['08e2c4c120f99bef5a4dff1db2abdd65']),
      ('public._give_gym_programme(uuid, uuid, boolean)', '0172', array['8c0223f2c26910f01cb6e9282dd70228']),
      ('public.client_profiles_join_gym_programme()', '0172', array['19aeeaa8b34ebaacc1e89f916606e059']),
      ('public.gym_programmes()', '0172', array['ca288df17e58e17a32e96232021e09de']),
      ('public.change_gym_programme(uuid, integer, boolean)', '0172', array['b1bf35bbe58d97c3f66a5584f8ecadef']),
      ('public.resolve_gym_programme_waiting(uuid, uuid, boolean)', '0172', array['74c0f34c0813d2b78153984e38ae8950']),
      ('public.program_templates_refuse_gym_programme_delete()', '0172', array['a340d90d42dde1df1975ad4a93644df0']),
      ('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer)', '0172', array['b345d01bb68a6f0ff0af21281feffded']),
      -- replaced: the live one from the migration named, or this file's (a second run)
      ('public.set_programme_week_one()', '0167', array['e9b3fd49f3e6b99de8c7b1cd5f0708b3', '9dddcac25cab66b400ec4103de9fda99']),
      ('public.apply_programme_rollout(uuid)', '0130', array['da6b647aab04cf17547cbc66dd7c81d2', '621d401c82367fa7706020118574d33a']),
      ('public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean)', '0133', array['118628ede882f193a8c7aa544a2244b4'])
    ) as t(signature, migration, accepted)
  loop
    v_md5 := null;
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.oid = to_regprocedure(v_check.signature)::oid;
    if v_md5 is not null and not (v_md5 = any (v_check.accepted)) then
      raise exception '% is not the one from migration % (body md5 %), so nothing was changed.', v_check.signature, v_check.migration, v_md5;
    end if;
  end loop;
end
$guard$;


-- Tables -----------------------------------------------------------------------------------------------------------------------------------

alter table programme_rollouts add column if not exists ended_at timestamptz;
alter table programme_rollouts add column if not exists ended_by uuid references profiles(id) on delete set null;
alter table programme_rollouts add column if not exists weeks integer;
comment on column programme_rollouts.ended_at is
  'A gym programme (audience all) that has ended: a gym admin ended it, or a newer one for everyone at the gym was given out. Members who join the gym after this are not given it. The members on it keep it (migration 0172).';
comment on column programme_rollouts.weeks is
  'How many weeks a start for everyone (audience all) runs, 1 to 12, set when it is scheduled: its last day is the Monday of the start date''s week + 7 x weeks - 1. Only a gym admin changes it (change_gym_programme); editing the template never does. Empty for chosen members (migration 0172).';

-- Backfill: every start for everyone gets its template's weeks now (1 to 12; a template with no workouts counts as one week).
update programme_rollouts r
set weeks = greatest(1, least(12, coalesce((select max(d.week_num) from program_template_days d where d.template_id = r.template_id), 1)))
where r.audience = 'all' and r.weeks is null;

alter table programme_rollouts drop constraint if exists programme_rollouts_weeks_check;
alter table programme_rollouts add constraint programme_rollouts_weeks_check
  check ((audience = 'all' and weeks is not null and weeks between 1 and 12) or (audience <> 'all' and weeks is null));

-- Backfill: every older start for everyone that has been given out and is still open ends as of the next one's start date at its gym (the
-- next one given out whose start date has arrived), as apply_programme_rollout now does when it gives out a newer one.
update programme_rollouts r
set ended_at = nx.ends
from (
  select o.id,
         (select n.start_date::timestamp at time zone coalesce(nullif(g.timezone, ''), 'UTC')
          from programme_rollouts n
          join gyms g on g.id = n.gym_id
          where n.gym_id = o.gym_id and n.audience = 'all' and n.applied_at is not null and n.id <> o.id
            and (n.start_date > o.start_date or (n.start_date = o.start_date and n.created_at > o.created_at))
            and n.start_date <= public.local_date(coalesce(nullif(g.timezone, ''), 'UTC'))
          order by n.start_date, n.created_at
          limit 1) as ends
  from programme_rollouts o
  where o.audience = 'all' and o.applied_at is not null and o.ended_at is null
) nx
where r.id = nx.id and nx.ends is not null;

-- Members a gym programme was not given to when they finished setting up, for their coach to decide. No rules: only the functions below
-- read and write it (Row Level Security on, nothing allowed straight through the API).
create table if not exists gym_programme_waiting (
  rollout_id uuid not null references programme_rollouts(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  -- 'own_programme': another programme of theirs runs over the same dates; 'failed': giving it raised an error.
  reason text not null check (reason in ('own_programme', 'failed')),
  other_program_id uuid references workout_programs(id) on delete set null,
  detail text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  resolution text check (resolution in ('given', 'kept')),
  primary key (rollout_id, client_id)
);

alter table gym_programme_waiting enable row level security;

create index if not exists gym_programme_waiting_client on gym_programme_waiting (client_id);


-- programme_rollouts rules ------------------------------------------------------------------------------------------------------------------

drop policy if exists "gym coaches manage programme_rollouts" on programme_rollouts;

drop policy if exists "gym coaches read programme_rollouts" on programme_rollouts;
create policy "gym coaches read programme_rollouts"
  on programme_rollouts for select
  using (gym_id = public.my_gym_id());

-- One for everyone at the gym only by a gym admin, as only a gym admin can start one (0133) or change one (change_gym_programme).
drop policy if exists "gym coaches cancel scheduled programme_rollouts" on programme_rollouts;
create policy "gym coaches cancel scheduled programme_rollouts"
  on programme_rollouts for delete
  using (gym_id = public.my_gym_id() and applied_at is null and (audience <> 'all' or public.is_admin_of_gym(gym_id)));


-- Functions --------------------------------------------------------------------------------------------------------------------------------

-- The gym's programme today: its newest start for everyone that has been given out, whose start date has arrived, that has not ended and
-- whose last day has not passed (none when it has none). Week 1 is the Monday of the start date's week (as week_one, 0167); its last day
-- is the Sunday of its last week, from its own length (weeks), never from its template.
create or replace function public._gym_programme_today(p_gym_id uuid)
returns table (rollout_id uuid, template_id uuid, program_name text, start_date date, week_one date, weeks integer, last_day date,
               today date)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.id, r.template_id, r.program_name, r.start_date, r.week_one, r.weeks, r.week_one + 7 * r.weeks - 1, t.today
  from gyms g
  cross join lateral (select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today) t
  cross join lateral (
    select x.*, w.week_one
    from programme_rollouts x
    cross join lateral (select x.start_date - (extract(isodow from x.start_date)::integer - 1) as week_one) w
    where x.gym_id = g.id and x.audience = 'all' and x.applied_at is not null and x.ended_at is null and x.start_date <= t.today
      and t.today <= w.week_one + 7 * x.weeks - 1
    order by x.start_date desc, x.created_at desc
    limit 1
  ) r
  where g.id = p_gym_id;
$fn$;

revoke all on function public._gym_programme_today(uuid) from public, anon, authenticated;

-- Deleting a template deletes its rollouts with it (programme_rollouts.template_id is on delete cascade, 0094), and a cascade skips the
-- rules above: by deleting the template, any coach at the gym could cancel a start for everyone or end the gym programme, which only a gym
-- admin can do. Only a gym admin (or nobody signed in: the SQL editor, the service role) can delete a template with a start for everyone
-- that has not started yet (scheduled, or given out ahead of its start date), or whose last day has not passed. One that has ended is
-- skipped: it can't be opened again and members keep their own copies, so deleting its template changes nothing for anyone. Each start
-- is decided from its own dates and end, which deleting other templates or weeks never changes.
create or replace function public.program_templates_refuse_gym_programme_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r record;
begin
  if auth.uid() is null then
    return old;
  end if;
  for v_r in
    select r.gym_id, r.program_name, r.start_date, r.applied_at,
           r.start_date - (extract(isodow from r.start_date)::integer - 1) + 7 * r.weeks - 1 as last_day,
           public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today
    from programme_rollouts r
    join gyms g on g.id = r.gym_id
    where r.template_id = old.id and r.audience = 'all' and r.ended_at is null
    order by r.start_date
  loop
    continue when public.is_admin_of_gym(v_r.gym_id);
    if v_r.applied_at is null or v_r.start_date > v_r.today then
      raise exception '“%” is set to start for everyone at the gym on %, so only a gym admin can delete this template.',
        v_r.program_name, to_char(v_r.start_date, 'Dy FMDD Mon');
    end if;
    if v_r.today <= v_r.last_day then
      raise exception '“%” runs for everyone at the gym until %, so only a gym admin can delete this template.',
        v_r.program_name, to_char(v_r.last_day, 'Dy FMDD Mon');
    end if;
  end loop;
  return old;
end;
$fn$;

revoke all on function public.program_templates_refuse_gym_programme_delete() from public, anon, authenticated;

drop trigger if exists program_templates_refuse_gym_programme_delete on program_templates;
create trigger program_templates_refuse_gym_programme_delete
  before delete on program_templates
  for each row execute function public.program_templates_refuse_gym_programme_delete();

-- A rollout copy follows the gym's week: week 1 is the Monday-to-Sunday week it starts in (0167). A late joiner's copy of a gym programme
-- (_give_gym_programme below) has its week 1 on the gym's Monday, before the week it started in: when a coach moves its start date, it keeps
-- that week 1 while the new start is still within the copy's weeks (on or after that Monday, up to the Sunday of its last week; a copy with
-- no workouts counts as one week), so the member stays on the gym's week. A new start after its last week starts again from week 1, as in
-- 0167: keeping the gym's Monday would make it finished on the day it starts. A copy whose rollout has gone (deleted with its template:
-- rollout_id emptied, week_one kept) is still a copy and follows the same rules. Every other copy is as in 0167.
create or replace function public.set_programme_week_one()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- A rollout copy, or one whose rollout has gone (only a rollout copy has a week 1).
  if (new.rollout_id is not null or (tg_op = 'UPDATE' and old.week_one is not null)) and new.start_date is not null
     and ((tg_op = 'INSERT' and new.week_one is null) or (tg_op = 'UPDATE' and new.start_date is distinct from old.start_date)) then
    if tg_op = 'UPDATE' and old.week_one is not null and old.start_date is not null
       and old.week_one < old.start_date - (extract(isodow from old.start_date)::integer - 1)
       and new.start_date >= old.week_one
       and new.start_date <= old.week_one
         + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = new.id), 0), 1) - 1 then
      new.week_one := old.week_one;
    else
      new.week_one := new.start_date - (extract(isodow from new.start_date)::integer - 1);
    end if;
  end if;
  return new;
end;
$fn$;

-- Gives a member the gym programme their gym is on today, as their own copy of its template as it is now, starting today on the gym's
-- current week. No permission check of its own: the trigger below (the member's own profile) and resolve_gym_programme_waiting (after its
-- checks) call it. p_force: give it even when another programme of theirs runs over the same dates (the coach chose "Give it to them").
-- Answers: 'given'; 'has_it' (a copy from this rollout already); 'own_programme' (listed as waiting instead); 'closed' (not the gym's
-- programme today, or the member is not at that gym).
create or replace function public._give_gym_programme(p_rollout_id uuid, p_client_id uuid, p_force boolean)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.client_gym_id(p_client_id);
  v_g record;
  v_other uuid;
  v_program workout_programs;
begin
  if v_gym is null then
    return 'closed';
  end if;
  select * into v_g from public._gym_programme_today(v_gym);
  if v_g.rollout_id is null or v_g.rollout_id is distinct from p_rollout_id then
    return 'closed';
  end if;

  -- One at a time per member, so two saves at once can't make two copies.
  perform pg_advisory_xact_lock(hashtext('gym-programme:' || p_client_id::text));

  if exists (select 1 from workout_programs wp where wp.client_id = p_client_id and wp.rollout_id = p_rollout_id) then
    update gym_programme_waiting set resolved_at = now(), resolved_by = nullif(auth.uid(), p_client_id), resolution = 'given'
    where rollout_id = p_rollout_id and client_id = p_client_id and resolved_at is null;
    return 'has_it';
  end if;

  if coalesce(p_force, false) then
    -- "Give it to them". A programme of theirs that starts today or later, before the gym programme's last day, would take over from it
    -- on its start date (the app's programme is the latest start that has arrived; starting the same day, the two would tie), so it now
    -- starts the Monday after the gym programme's last week. The coach is told so before they give it (giveWaitingConfirmation).
    update workout_programs wp set start_date = v_g.last_day + 1
    where wp.client_id = p_client_id
      and wp.start_date is not null
      and wp.rollout_id is distinct from p_rollout_id
      and wp.start_date >= v_g.today
      and wp.start_date <= v_g.last_day;
  else
    -- Another programme of theirs that runs over the same dates (today to the gym programme's last day), counted as the app counts weeks
    -- (programWeekStart): from week_one when it is set and not after the start date, else the start date. One with no workouts yet counts
    -- as one week.
    select wp.id into v_other
    from workout_programs wp
    cross join lateral (
      select least(coalesce(wp.week_one, wp.start_date), wp.start_date)
             + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = wp.id), 0), 1) - 1 as last_day
    ) e
    where wp.client_id = p_client_id
      and wp.start_date is not null
      and wp.rollout_id is distinct from p_rollout_id
      and wp.start_date <= v_g.last_day
      and e.last_day >= v_g.today
    order by wp.start_date desc
    limit 1;

    if v_other is not null then
      insert into gym_programme_waiting (rollout_id, client_id, reason, other_program_id)
      values (p_rollout_id, p_client_id, 'own_programme', v_other)
      on conflict (rollout_id, client_id) do update
        set reason = excluded.reason, other_program_id = excluded.other_program_id, detail = null
        where gym_programme_waiting.resolved_at is null;
      return 'own_programme';
    end if;
  end if;

  -- Starts today; week 1 is the gym programme's Monday, so the member is on the gym's current week (the start-date trigger of 0167 sets
  -- the Monday of today's week, which this replaces).
  v_program := public.instantiate_template_core(v_g.template_id, p_client_id, v_g.program_name, v_g.today, p_rollout_id);
  update workout_programs set week_one = v_g.week_one where id = v_program.id;

  update gym_programme_waiting set resolved_at = now(), resolved_by = nullif(auth.uid(), p_client_id), resolution = 'given'
  where rollout_id = p_rollout_id and client_id = p_client_id and resolved_at is null;
  return 'given';
end;
$fn$;

revoke all on function public._give_gym_programme(uuid, uuid, boolean) from public, anon, authenticated;

-- A member finishing their profile (onboarding) is given their gym's programme. It never stops the save: any error is caught (nothing
-- half-made stays) and the member is listed as waiting for their coach instead.
create or replace function public.client_profiles_join_gym_programme()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid;
  v_g record;
  v_outcome text;
begin
  if new.onboarding_completed_at is null or (tg_op = 'UPDATE' and old.onboarding_completed_at is not null) then
    return null;
  end if;

  begin
    v_gym := public.client_gym_id(new.client_id);
    if v_gym is null then
      return null;
    end if;
    select * into v_g from public._gym_programme_today(v_gym);
    if v_g.rollout_id is null then
      return null;
    end if;

    v_outcome := public._give_gym_programme(v_g.rollout_id, new.client_id, false);
    if v_outcome = 'given' then
      insert into notifications (client_id, message)
      values (new.client_id, 'You''re on the gym programme “' || left(v_g.program_name, 60) || '” from today, on the same week as everyone at the gym. Open Training to see your workouts.');
    end if;
  exception when others then
    begin
      insert into gym_programme_waiting (rollout_id, client_id, reason, detail)
      values (v_g.rollout_id, new.client_id, 'failed', left(sqlerrm, 300))
      on conflict (rollout_id, client_id) do update
        set reason = 'failed', detail = excluded.detail
        where gym_programme_waiting.resolved_at is null;
    exception when others then
      null;
    end;
  end;
  return null;
end;
$fn$;

revoke all on function public.client_profiles_join_gym_programme() from public, anon, authenticated;

drop trigger if exists client_profiles_gym_programme on client_profiles;
create trigger client_profiles_gym_programme
  after insert or update of onboarding_completed_at on client_profiles
  for each row execute function public.client_profiles_join_gym_programme();

-- For the coach's template list: the gym's programme today (as _gym_programme_today picks it), or when it has none, the newest one that
-- has ended and whose last day has not passed (is_open false), so the template still says it ended and who is on it.
create or replace function public.gym_programmes()
returns table (rollout_id uuid, template_id uuid, program_name text, gym_name text, start_date date, week_one date, weeks integer,
               last_day date, today date, current_week integer, is_open boolean, ended_at timestamptz, members integer,
               joined_later integer, waiting jsonb)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_gym uuid := public.my_gym_id();
  v_admin boolean;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can see this';
  end if;
  v_admin := exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin);
  return query
    select r.id, r.template_id, r.program_name, g.name, r.start_date, r.week_one, r.weeks, r.last_day, r.today,
           ((r.today - r.week_one) / 7 + 1)::integer, r.ended_at is null, r.ended_at, u.n, u.later, coalesce(w.list, '[]'::jsonb)
    from gyms g
    cross join lateral (select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today) t
    cross join lateral (
      select x.id, x.template_id, x.program_name, x.start_date, x.weeks, x.ended_at, t.today, xw.week_one,
             xw.week_one + 7 * x.weeks - 1 as last_day
      from programme_rollouts x
      cross join lateral (select x.start_date - (extract(isodow from x.start_date)::integer - 1) as week_one) xw
      where x.gym_id = g.id and x.audience = 'all' and x.applied_at is not null and x.start_date <= t.today
        and t.today <= xw.week_one + 7 * x.weeks - 1
      order by (x.ended_at is null) desc, x.start_date desc, x.created_at desc
      limit 1
    ) r
    cross join lateral (
      select count(distinct c.client_id)::integer as n,
             count(distinct c.client_id) filter (where wp.start_date > r.start_date)::integer as later
      from public._rollout_live_copies(r.id) c
      join workout_programs wp on wp.id = c.program_id
    ) u
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
               'client_id', q.client_id,
               'name', coalesce(nullif(btrim(cp.name), ''), p.email, 'A member'),
               'reason', q.reason,
               'other_program_id', op.id,
               'other_program', op.name,
               'other_starts', op.start_date,
               'other_until', case when op.id is null then null else
                 least(coalesce(op.week_one, op.start_date), op.start_date)
                 + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = op.id), 0), 1) - 1 end,
               -- Every programme of theirs "Give it to them" moves to the Monday after the gym programme (as _give_gym_programme picks
               -- them), so the confirm can name each one, not only the one in the way.
               'moves', (
                 select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'starts', x.start_date)
                                           order by x.start_date, x.created_at), '[]'::jsonb)
                 from workout_programs x
                 where x.client_id = q.client_id
                   and x.start_date is not null
                   and x.rollout_id is distinct from r.id
                   and x.start_date >= r.today
                   and x.start_date <= r.last_day)
             ) order by q.created_at) as list
      from gym_programme_waiting q
      join profiles p on p.id = q.client_id
      left join client_profiles cp on cp.client_id = q.client_id
      left join workout_programs op on op.id = q.other_program_id
      where q.rollout_id = r.id
        and q.resolved_at is null
        and r.ended_at is null
        and public.client_gym_id(q.client_id) is not distinct from v_gym
        and not exists (select 1 from workout_programs x where x.client_id = q.client_id and x.rollout_id = r.id)
        and (v_admin or coalesce(public.is_coach_of(q.client_id), false))
    ) w
    where g.id = v_gym;
end;
$fn$;

revoke all on function public.gym_programmes() from public, anon;
grant execute on function public.gym_programmes() to authenticated;

-- A gym admin ends a gym programme now (p_end), or gives a start for everyone a new length (p_weeks, 1 to 12). Ending stops new members
-- getting it; the members on it keep it and nothing they logged changes, and it can't be opened again. A length that would end it before
-- today ends it today, its length the weeks up to this one. Answers 'ended' or 'changed'.
create or replace function public.change_gym_programme(p_rollout_id uuid, p_weeks integer, p_end boolean)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_r programme_rollouts;
  v_today date;
  v_week_one date;
  v_started boolean;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can change a gym programme';
  end if;
  -- One change at a time: a second waits for the first and sees what it did.
  select * into v_r from programme_rollouts where id = p_rollout_id for update;
  if v_r.id is null or v_r.gym_id is distinct from v_gym or v_r.audience <> 'all' then
    raise exception 'Gym programme not found';
  end if;
  if not public.is_admin_of_gym(v_r.gym_id) then
    raise exception 'Only a gym admin can end a gym programme or change its length.';
  end if;
  if v_r.ended_at is not null then
    raise exception 'It has ended, so it can''t be changed. To give the gym a programme again, start one for everyone.';
  end if;
  select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) into v_today from gyms g where g.id = v_r.gym_id;
  v_week_one := v_r.start_date - (extract(isodow from v_r.start_date)::integer - 1);
  v_started := v_r.applied_at is not null and v_r.start_date <= v_today;
  if v_started and v_today > v_week_one + 7 * v_r.weeks - 1 then
    raise exception 'It finished on %, so it can''t be changed. To give the gym a programme again, start one for everyone.',
      to_char(v_week_one + 7 * v_r.weeks - 1, 'Dy FMDD Mon');
  end if;

  if coalesce(p_end, false) then
    if not v_started then
      raise exception 'It hasn''t started yet: cancel the scheduled start instead.';
    end if;
    update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_r.id;
    return 'ended';
  end if;

  if p_weeks is null or p_weeks < 1 or p_weeks > 12 then
    raise exception 'Choose a length of 1 to 12 weeks.';
  end if;
  if v_started and v_week_one + 7 * p_weeks - 1 < v_today then
    update programme_rollouts set weeks = (v_today - v_week_one) / 7 + 1, ended_at = now(), ended_by = auth.uid() where id = v_r.id;
    return 'ended';
  end if;
  update programme_rollouts set weeks = p_weeks where id = v_r.id;
  return 'changed';
end;
$fn$;

revoke all on function public.change_gym_programme(uuid, integer, boolean) from public, anon;
grant execute on function public.change_gym_programme(uuid, integer, boolean) to authenticated;

-- Gives a rollout out: everyone it covers gets their own copy from its start date (0094, 0130). The daily job calls it on the start date
-- (nobody signed in), and Start a programme for a start today or earlier (schedule_programme_rollout, signed in as the coach). It is
-- callable by any coach and only checked the gym, so a coach who isn't a gym admin could give out a gym admin's scheduled start for
-- everyone weeks early: after that nobody could cancel it (only a rollout not given out yet can be cancelled), and a member who joined
-- before its start date never got it (a gym programme only reaches a new member once its start date has arrived). Now, signed in: one for
-- everyone only by a gym admin, as only a gym admin can start one (0133), and none before its start date at the gym, for everyone or for
-- chosen members (the daily job gives a later start out on its day). So Start a programme with a later date can't start it now either.
-- Giving out one for everyone ends every older one at the gym that is still open: a newer gym programme takes over, and an older one is
-- never the gym's programme again. One older than a gym programme already given out ends too, as it can never be the gym's programme.
-- Given out one at a time per gym, so two at once see each other. The daily job, and everything else, as in 0130.
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
  v_today date;
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
  select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) into v_today from gyms g where g.id = v_r.gym_id;
  -- Signed in: one for everyone only by a gym admin, and none before its start date at the gym.
  if auth.uid() is not null then
    if v_r.audience = 'all' and not exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin) then
      raise exception 'Only a gym admin can start a programme for everyone.';
    end if;
    if v_today is null or v_r.start_date > v_today then
      raise exception '“%” starts on %, so it is given out on that day, not before.',
        v_r.program_name, to_char(v_r.start_date, 'Dy FMDD Mon');
    end if;
  end if;
  -- One at a time per gym. Two given out at once (two gym admins, a gym admin and the daily job, a doubled call) would each miss the
  -- other's applied_at, not committed yet, so neither would end the other and both would stay open; and the same one could be given out
  -- twice. Read again under the lock: one given out (or cancelled) in the meantime is left as it is.
  perform pg_advisory_xact_lock(hashtext('gym-programme-apply:' || v_r.gym_id::text));
  select * into v_r from programme_rollouts where id = p_rollout_id for update;
  if v_r.id is null or v_r.applied_at is not null then
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

  -- A newer gym programme takes over: every older one at the gym that is still open ends now. And this one ends straight away when a
  -- newer one has already started (given out, its start date arrived): it would never be the gym's programme.
  if v_r.audience = 'all' then
    update programme_rollouts x set ended_at = now(), ended_by = auth.uid()
    where x.gym_id = v_r.gym_id and x.audience = 'all' and x.id <> v_r.id and x.applied_at is not null and x.ended_at is null
      and (x.start_date < v_r.start_date or (x.start_date = v_r.start_date and x.created_at < v_r.created_at));
    if exists (
      select 1 from programme_rollouts x
      where x.gym_id = v_r.gym_id and x.audience = 'all' and x.id <> v_r.id and x.applied_at is not null and x.start_date <= v_today
        and (x.start_date > v_r.start_date or (x.start_date = v_r.start_date and x.created_at > v_r.created_at))
    ) then
      update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_r.id;
    end if;
  end if;
  return v_count;
end;
$fn$;

revoke all on function public.apply_programme_rollout(uuid) from public, anon;
grant execute on function public.apply_programme_rollout(uuid) to authenticated;

-- Start a programme (R5, 0133): the rollout is saved and, if it starts now, given out in the same transaction. As in 0133, with the
-- length of a start for everyone: p_weeks, 1 to 12, or empty for the template's weeks (1 to 12; a template with no workouts counts as one
-- week), so the app before this deploy, which sends no length, still works. A start for chosen members has no length.
drop function if exists public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean);

create or replace function public.schedule_programme_rollout(
  p_template_id uuid,
  p_program_name text,
  p_start date,
  p_audience text,
  p_client_ids uuid[],
  p_starts_now boolean,
  p_weeks integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_admin boolean;
  v_template program_templates;
  v_name text;
  v_tz text;
  v_today date;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_count integer;
  v_weeks integer;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can start a programme';
  end if;
  v_admin := exists (select 1 from profiles where id = auth.uid() and is_gym_admin);

  if p_audience is null or p_audience not in ('all', 'selected') then
    raise exception 'Choose who the programme is for';
  end if;
  if p_audience = 'all' and not v_admin then
    raise exception 'Only a gym admin can start a programme for everyone.';
  end if;

  select * into v_template from program_templates where id = p_template_id;
  if v_template is null or v_template.gym_id is distinct from v_gym then
    raise exception 'Programme template not found';
  end if;

  v_name := left(coalesce(nullif(btrim(coalesce(p_program_name, '')), ''), v_template.name), 100);

  select coalesce(nullif(timezone, ''), 'UTC') into v_tz from gyms where id = v_gym;
  v_today := public.local_date(v_tz);
  if p_start is null or p_start < v_today - 30 or p_start > v_today + 365 then
    raise exception 'Choose a start date within the next year.';
  end if;

  if p_audience = 'all' then
    if p_weeks is null then
      select greatest(1, least(12, coalesce(max(d.week_num), 1))) into v_weeks from program_template_days d where d.template_id = p_template_id;
    elsif p_weeks < 1 or p_weeks > 12 then
      raise exception 'Choose a length of 1 to 12 weeks.';
    else
      v_weeks := p_weeks;
    end if;
  end if;

  if p_audience = 'selected' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_client_ids, '{}'::uuid[])) x;
    if cardinality(v_ids) < 1 then
      raise exception 'Choose at least one member.';
    end if;
    if cardinality(v_ids) > 500 then
      raise exception 'Choose up to 500 members at a time.';
    end if;
    if exists (select 1 from unnest(v_ids) i where not public.same_gym_as_client(v_gym, i)) then
      raise exception 'That belongs to a different gym.';
    end if;
    if not v_admin and exists (select 1 from unnest(v_ids) i where not coalesce(public.is_coach_of(i), false)) then
      raise exception 'You can only start a programme for your own members.';
    end if;
  end if;

  insert into programme_rollouts (gym_id, template_id, program_name, start_date, audience, client_ids, created_by, weeks)
  values (v_gym, p_template_id, v_name, p_start, p_audience, v_ids, auth.uid(), v_weeks)
  returning id into v_id;

  if coalesce(p_starts_now, false) then
    v_count := public.apply_programme_rollout(v_id);
  elsif p_audience = 'all' then
    select count(*) into v_count from profiles c where c.role = 'client' and public.client_gym_id(c.id) is not distinct from v_gym;
  else
    v_count := cardinality(v_ids);
  end if;

  return v_count;
end;
$fn$;

revoke execute on function public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer) from public, anon;
grant execute on function public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer) to authenticated;

-- "Give it to them" (p_give) or "Keep theirs" for a member the gym programme was not given to. Answers 'given', 'has_it' or 'kept'.
create or replace function public.resolve_gym_programme_waiting(p_rollout_id uuid, p_client_id uuid, p_give boolean)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_r programme_rollouts;
  v_outcome text;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can do this';
  end if;
  select * into v_r from programme_rollouts where id = p_rollout_id;
  if v_r.id is null or v_r.gym_id is distinct from v_gym or v_r.audience <> 'all' then
    raise exception 'Gym programme not found';
  end if;
  if public.client_gym_id(p_client_id) is distinct from v_gym then
    raise exception 'That belongs to a different gym.';
  end if;
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin) and not coalesce(public.is_coach_of(p_client_id), false) then
    raise exception 'You can only do this for your own members.';
  end if;
  if not exists (
    select 1 from gym_programme_waiting q where q.rollout_id = p_rollout_id and q.client_id = p_client_id and q.resolved_at is null
  ) then
    raise exception 'That member isn''t waiting for this programme any more.';
  end if;

  if coalesce(p_give, false) then
    v_outcome := public._give_gym_programme(p_rollout_id, p_client_id, true);
    if v_outcome not in ('given', 'has_it') then
      raise exception 'This gym programme has ended, so it can''t be given now.';
    end if;
    return v_outcome;
  end if;

  update gym_programme_waiting set resolved_at = now(), resolved_by = auth.uid(), resolution = 'kept'
  where rollout_id = p_rollout_id and client_id = p_client_id and resolved_at is null;
  return 'kept';
end;
$fn$;

revoke all on function public.resolve_gym_programme_waiting(uuid, uuid, boolean) from public, anon;
grant execute on function public.resolve_gym_programme_waiting(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Gym programmes (owner's list item 7, 19 Nov 2026): a programme given to everyone at a gym from a start date now reaches the members who
-- join that gym later too. Owner's decision: a late joiner starts on the gym's CURRENT week, so everyone does the same workout on the same
-- day (the gym calendar of D9, migration 0167).
--
-- Before: "Start a programme" -> "Everyone at the gym" (programme_rollouts.audience 'all', 0094 and 0133) gave each member at the gym their
-- own copy on the start date, once (apply_programme_rollout sets applied_at). Anyone who joined after that got nothing. Read-only check on
-- 20 Nov 2026: the 3 members who joined Salford Quays after November Weeks 9-11 started (10 Nov) were each given a 3-week programme by hand
-- as their own 1:1 programme, so their weeks count from their own start (9, 10 and 16 Nov) instead of the gym's Monday 9 Nov.
--
-- New:
--   * A whole-gym rollout is the gym's programme ("gym programme"). The one a gym is on today (_gym_programme_today) is its newest whole-gym
--     rollout that has been given out and whose start date has arrived. It is open to new members until its last week ends, or until a
--     coach ends it (programme_rollouts.ended_at, new). Week 1 is the Monday of the start date's week (as week_one, 0167), so its last day
--     is that Monday + 7 x the template's weeks - 1 (a Sunday). A newer gym programme takes over from an older one, and an older one is
--     never opened again: when the newest has ended, nobody is given anything.
--   * When a member at that gym finishes setting up their profile (client_profiles.onboarding_completed_at goes from empty to a date, on
--     the web or the phone: trigger client_profiles_gym_programme), they get their own copy of the template, starting today, with
--     week_one = the gym programme's Monday: the app counts their weeks from it (programWeekStart), so they are on the gym's current week and
--     do the same workout as everyone that day. The copy has the rollout's id, so it counts in "In use by" / "Apply to everyone on this
--     rollout" (D8) like everyone else's. The member gets an in-app notice. Nobody is given anything:
--       - who already has a copy from that rollout (never a second copy);
--       - who has another programme that runs over the same dates (a 1:1 programme their coach gave them, or a group one). Theirs is not
--         replaced: the member is listed on the template as "Not given" with the programme in their way, and their coach (or a gym admin)
--         picks "Give it to them" (it takes over from today; theirs stays on file, and any of theirs that has not started yet, or starts today, now
--         starts the Monday after the gym programme's last week, so it cannot take over part-way) or "Keep theirs" (gym_programme_waiting,
--         new). A programme with no workouts yet counts as one week long, so a 1:1 programme a coach has only just made still counts;
--       - when the gym programme has ended or the gym has none.
--     Giving it can never stop a member finishing their profile: an error is caught, nothing is half-made, and the member is listed as
--     "Not given" with reason 'failed' so the coach can give it from the template.
--   * gym_programmes(): for the coach's template list, "Gym programme: Salford Quays from 9 Nov · 16 members": the programme the coach's
--     gym is on today while its last week has not finished, ended or not, with the members still on it (as programme_rollout_usage, 0167),
--     how many joined later, and the members waiting (the coach's own members; every one for a gym admin), each with every programme of
--     theirs "Give it to them" would move, so the confirm names them all. Coaches at that gym only.
--   * end_gym_programme(rollout): stops new members getting it. The members on it keep it to the end and nothing they logged changes.
--     A gym admin only, as starting a programme for everyone is (0133). It cannot be re-opened: starting a new one for everyone takes over.
--   * resolve_gym_programme_waiting(rollout, member, give): "Give it to them" / "Keep theirs" for a member listed as Not given. The member's
--     coach or a gym admin, at the member's gym, while the gym programme is open.
--   * programme_rollouts rules: the one "for all" rule let any coach at the gym change a rollout straight through the API: end a gym
--     programme without being a gym admin, open an ended one again, or turn chosen members into everyone. Now a coach can read their gym's
--     rollouts and cancel one that has not been given out yet (what the app does, cancelProgrammeRollout), one for everyone only as a gym
--     admin; everything else goes through the functions (schedule_programme_rollout, apply_programme_rollout, end_gym_programme), which run
--     as the table owner.
--   * Deleting a template deletes its rollouts too (on delete cascade, 0094), past those rules. A new trigger on program_templates
--     (program_templates_refuse_gym_programme_delete) lets only a gym admin delete a template whose rollout for everyone has not started
--     yet or is the gym's programme (until its last week is over), so a coach can't cancel a start for everyone or end the gym programme
--     that way. The app says so on Delete template. When the gym's programme goes with its template, the gym programme before it would be
--     the gym's programme again: if that one is still within its weeks and not ended, it is ended too (ended_at), so it is not opened
--     again (the rule above). Only a gym admin can delete a template that would do that. A template's rollouts only go at the end of the
--     delete, so the trigger leaves out a rollout whose template has already gone: several templates deleted in one request are decided
--     as if they were deleted one after the other. Deletes at a gym also wait for each other (a lock per gym), so two requests at once
--     are decided one after the other too. Before, deleting the gym programme's template and the one before it together (or in two
--     requests at once) passed for a coach who isn't a gym admin, and opened the gym programme before those two again.
--   * The gym programme's last day comes from its template's weeks, so taking weeks off the template would end it sooner, or straight
--     away. A new trigger on program_template_days (program_template_days_refuse_gym_programme_shorten) lets only a gym admin take the
--     last week off the template of the gym's programme (delete its days, or move them to an earlier week or another template) until
--     its last week is over, ended or not, as on Delete template. Adding weeks, and changing or deleting days within its weeks, are as
--     before. The app says so on Delete week (which moves the weeks after it up one, so it takes a week off wherever the week is).
--     Changes to the days of a template given out for everyone wait for each other before the weeks are counted (a lock per template),
--     so two requests at once that each delete one workout of the last week can't both pass.
--   * set_programme_week_one (the start-date trigger of 0167) replaced: a late joiner's copy keeps its week 1 (the gym's Monday) when a
--     coach moves its start date within the copy's weeks, so the member stays on the gym's week instead of going back to week 1. Moved
--     past its last week, it starts again from week 1 as before (kept, it would be finished on the day it starts). A copy whose rollout
--     has gone (deleted with its template, so rollout_id is empty) still has its week 1 and is treated the same: before, its week 1 stayed
--     where it was whatever start date a coach gave it. Every other copy as before.
--
-- Not changed: apply_programme_rollout, apply_due_programme_rollouts, schedule_programme_rollout, instantiate_template_core (called as it
-- is), apply_template_to_rollout, programme_rollout_usage. The migration itself gives nobody a programme and changes no programme: late
-- joiners are given it from the next profile set up. The 3 members above stay on their own programmes.
--
-- Apply: before or after the deploy. The app reads gym_programmes() and shows nothing when it is missing; applying it first means the
-- new "members who join later get it too" wording in Start a programme is true from the deploy.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... is not the one from migration 0172"), or set_programme_week_one is
-- neither 0167's nor this file's ("... from migration 0167"). An earlier copy of this file is fine (the one handed out on 20 Nov 2026,
-- or a later one): its bodies are accepted too, so this file can be run over it. Safe to run twice.
--
-- PRE-FLIGHT (read-only):
--   select to_regclass('public.gym_programme_waiting') is not null as waiting_table,
--          to_regprocedure('public.gym_programmes()') is not null as list_fn,
--          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'programme_rollouts' and column_name = 'ended_at') as ended_col,
--          to_regprocedure('public._rollout_live_copies(uuid)') is not null as needs_0167,
--          to_regprocedure('public.instantiate_template_core(uuid, uuid, text, date, uuid)') is not null as needs_0152;
-- Expected before: false, false, false, true, true.
--
--   -- 1. The gym programme each gym is on today (the rule above), its week 1, weeks, last day and copies:
--   select g.name, r.program_name, r.start_date, r.start_date - (extract(isodow from r.start_date)::integer - 1) as week_one,
--          (select max(d.week_num) from public.program_template_days d where d.template_id = r.template_id) as weeks,
--          (select count(*) from public.workout_programs wp where wp.rollout_id = r.id) as copies
--   from public.gyms g
--   cross join lateral (
--     select * from public.programme_rollouts r
--     where r.gym_id = g.id and r.audience = 'all' and r.applied_at is not null
--       and r.start_date <= public.local_date(coalesce(nullif(g.timezone, ''), 'UTC'))
--     order by r.start_date desc, r.created_at desc limit 1
--   ) r;
-- Expected on 20 Nov 2026: one row, Salford Quays, November Weeks 9-11, start 10 Nov, week_one 9 Nov, 3 weeks (so open to new members
-- until Sun 29 Nov), 16 copies. Worsley has none.
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
--
-- AFTER (read-only):
--   select to_regprocedure('public.gym_programmes()') is not null, to_regprocedure('public.end_gym_programme(uuid)') is not null,
--          to_regprocedure('public.resolve_gym_programme_waiting(uuid, uuid, boolean)') is not null,
--          (select relrowsecurity from pg_class where oid = 'public.gym_programme_waiting'::regclass),
--          (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gym_programme_waiting'),
--          exists (select 1 from pg_trigger where tgrelid = 'public.client_profiles'::regclass and tgname = 'client_profiles_gym_programme'),
--          exists (select 1 from pg_trigger where tgrelid = 'public.program_templates'::regclass and tgname = 'program_templates_refuse_gym_programme_delete'),
--          exists (select 1 from pg_trigger where tgrelid = 'public.program_template_days'::regclass and tgname = 'program_template_days_refuse_gym_programme_shorten');
-- Expected: true, true, true, true, 0, true, true, true (the waiting list has no rules: only the functions read and write it).
--   select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'programme_rollouts' order by 1;
-- Expected: "gym coaches cancel scheduled programme_rollouts" DELETE, "gym coaches read programme_rollouts" SELECT.
--   select g.name, t.program_name, t.week_one, t.weeks, t.last_day, t.is_open from public.gyms g cross join lateral public._gym_programme_today(g.id) t;
-- Expected on 20 Nov 2026: Salford Quays, November Weeks 9-11, 9 Nov, 3, 29 Nov, true.
--   -- Nobody was given anything: the rollout-copy count from PRE-FLIGHT 3 is the same, and the waiting list is empty:
--   select count(*) from public.workout_programs where rollout_id is not null;  select count(*) from public.gym_programme_waiting;
-- Then, signed in as a coach in the app: Library -> Programmes shows "Gym programme: Salford Quays from 9 Nov · 16 members" on November
-- Weeks 9-11, and the template shows when new members stop getting it (Sun 29 Nov) and an "End gym programme" button.
--
-- Write tests to run with test accounts on a sandbox project (not the live one): a new member at a gym with an open gym programme finishes
-- onboarding -> one copy, start today, week_one = the gym programme's Monday, a notice; finishing again (or a second save) -> no second
-- copy; a member with a running 1:1 programme -> no copy, listed for their coach, "Give it to them" -> copy, "Keep theirs" -> off the list;
-- a member whose 1:1 starts next Monday -> listed, "Give it to them" -> copy, and the 1:1 now starts the Monday after the gym programme;
-- a late joiner's copy (3 weeks, week_one 9 Nov) moved to start 23 Nov -> week_one stays 9 Nov, moved to 30 Nov -> week_one 30 Nov, and
-- the same once its template (so its rollout) is deleted;
-- after end_gym_programme, or after the last Sunday -> nothing; a non-admin coach cannot end it (function or direct update), nor cancel a
-- scheduled start for everyone (direct delete), but can cancel one for chosen members; a non-admin coach cannot delete the template of the
-- gym programme or of a scheduled start for everyone (refused, nothing deleted), but can delete one whose gym programme's last week is
-- over, and a gym admin can delete either; a gym admin deleting the gym programme's template while the gym programme before it is still
-- within its weeks -> that one is ended (ended_at set) and a new member is given nothing; the gym programme's template (its last week over)
-- and the template of the gym programme before it (also over) deleted in one request (delete ... in (both)), in either order, or in two
-- requests at once, while the gym programme before those two is still within its weeks -> a non-admin coach is refused and nothing is
-- deleted, and for a gym admin that one is ended; a non-admin coach cannot take the last week off
-- the gym programme's template (delete its days, move them to week 2, or to another template; refused, nothing changed) until its last
-- week is over, but can add a week or delete a day in an earlier week, and a gym admin can do either; two requests at once from a
-- non-admin coach, each deleting one of the two workouts of the gym programme's last week -> one is refused and the template keeps its
-- last week; a member cannot call gym_programmes,
-- end_gym_programme or resolve_gym_programme_waiting.
--
-- ROLLBACK: run set_programme_week_one's definition from migration 0167 again (its trigger stays);
--           drop trigger client_profiles_gym_programme on public.client_profiles; drop function public.client_profiles_join_gym_programme();
--           drop trigger program_templates_refuse_gym_programme_delete on public.program_templates;
--           drop function public.program_templates_refuse_gym_programme_delete();
--           drop trigger program_template_days_refuse_gym_programme_shorten on public.program_template_days;
--           drop function public.program_template_days_refuse_gym_programme_shorten();
--           drop function public.resolve_gym_programme_waiting(uuid, uuid, boolean); drop function public.end_gym_programme(uuid);
--           drop function public.gym_programmes(); drop function public._give_gym_programme(uuid, uuid, boolean);
--           drop function public._gym_programme_today(uuid); drop table public.gym_programme_waiting;
--           alter table public.programme_rollouts drop column ended_by, drop column ended_at;
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
  if to_regprocedure('public.is_coach_of(uuid)') is null then raise exception 'is_coach_of is missing'; end if;
  if to_regprocedure('public.my_gym_id()') is null then raise exception 'my_gym_id is missing (migration 0052)'; end if;
  if to_regprocedure('public.is_admin_of_gym(uuid)') is null then raise exception 'is_admin_of_gym is missing (migration 0056)'; end if;

  -- The functions this migration creates: none may exist yet with another body (a second run finds its own). The one it replaces must be
  -- the one from 0167 or this file's. After this file's own md5, an earlier copy of this file's (same arguments and result, so it is
  -- replaced in place): gym_programmes and set_programme_week_one as in the copy handed out on 20 Nov 2026,
  -- program_templates_refuse_gym_programme_delete and set_programme_week_one as in a later copy before 21 Nov, and
  -- program_templates_refuse_gym_programme_delete and program_template_days_refuse_gym_programme_shorten as in the copy of 21 Nov that
  -- added the template-days trigger.
  for v_check in
    select * from (values
      ('_gym_programme_today', '0172', array['63d299a9c29db8643c15e20d43a70bdb']),
      ('_give_gym_programme', '0172', array['4e10dc123d27774dee84ee6b08b3726e']),
      ('client_profiles_join_gym_programme', '0172', array['558f876ecd679247dc956a8f67bb5f0e']),
      ('gym_programmes', '0172', array['8784850cd1412c5abd4b9bee1fd1a14a', '662073fea310d8827b69bac083e593f6']),
      ('end_gym_programme', '0172', array['8ff5f37461f44cd1e11e25c9a4cea232']),
      ('resolve_gym_programme_waiting', '0172', array['74c0f34c0813d2b78153984e38ae8950']),
      ('program_templates_refuse_gym_programme_delete', '0172', array['d60da1e4ee8413ca79ec75e79e5c8d9e', 'e417964f898305816cc6a55ad7148e23',
                                                                      '8376186b3cf14c0b6d24d762c0e36f8e']),
      ('program_template_days_refuse_gym_programme_shorten', '0172', array['ae1c7013f4df25d129a2f4ab0ec4ca36', '4eb2b9bf86c808d575cbe70b02c3a3fe']),
      -- replaced: the one from 0167, or this file's (a second run), or an earlier copy of this file's
      ('set_programme_week_one', '0167', array['e9b3fd49f3e6b99de8c7b1cd5f0708b3', '9dddcac25cab66b400ec4103de9fda99',
                                               '8a258730266312d0344c534b09087221', '836a65083143b6a9bf93df50b68a7bec'])
    ) as t(name, migration, accepted)
  loop
    v_md5 := null;
    select md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) into v_md5
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = v_check.name;
    if v_md5 is not null and not (v_md5 = any (v_check.accepted)) then
      raise exception '% is not the one from migration % (body md5 %), so nothing was changed.', v_check.name, v_check.migration, v_md5;
    end if;
  end loop;
end
$guard$;


-- Tables -----------------------------------------------------------------------------------------------------------------------------------

alter table programme_rollouts add column if not exists ended_at timestamptz;
alter table programme_rollouts add column if not exists ended_by uuid references profiles(id) on delete set null;
comment on column programme_rollouts.ended_at is
  'A gym programme (audience all) that has ended: a gym admin ended it, or deleted the template of the gym programme after it. Members who join the gym after this are not given it. The members on it keep it (migration 0172).';

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

-- One for everyone at the gym only by a gym admin, as only a gym admin can start one (0133) or end one (end_gym_programme).
drop policy if exists "gym coaches cancel scheduled programme_rollouts" on programme_rollouts;
create policy "gym coaches cancel scheduled programme_rollouts"
  on programme_rollouts for delete
  using (gym_id = public.my_gym_id() and applied_at is null and (audience <> 'all' or public.is_admin_of_gym(gym_id)));


-- Functions --------------------------------------------------------------------------------------------------------------------------------

-- The gym programme a gym is on today: its newest whole-gym rollout that has been given out and has started (none when it has none). Its
-- week 1 is the Monday of the start date's week (as week_one, 0167); its last day is the Sunday of the template's last week. is_open: new
-- members get it (not ended by a coach, and its last day has not passed).
create or replace function public._gym_programme_today(p_gym_id uuid)
returns table (rollout_id uuid, template_id uuid, program_name text, start_date date, week_one date, weeks integer, last_day date,
               today date, ended_at timestamptz, is_open boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.id, r.template_id, r.program_name, r.start_date, w.week_one, tw.weeks, w.week_one + 7 * tw.weeks - 1, t.today, r.ended_at,
         r.ended_at is null and tw.weeks > 0 and t.today <= w.week_one + 7 * tw.weeks - 1
  from gyms g
  cross join lateral (select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today) t
  cross join lateral (
    select x.* from programme_rollouts x
    where x.gym_id = g.id and x.audience = 'all' and x.applied_at is not null and x.start_date <= t.today
    order by x.start_date desc, x.created_at desc
    limit 1
  ) r
  cross join lateral (select r.start_date - (extract(isodow from r.start_date)::integer - 1) as week_one) w
  cross join lateral (
    select coalesce(max(d.week_num), 0)::integer as weeks from program_template_days d where d.template_id = r.template_id
  ) tw
  where g.id = p_gym_id;
$fn$;

revoke all on function public._gym_programme_today(uuid) from public, anon, authenticated;

-- Deleting a template deletes its rollouts with it (programme_rollouts.template_id is on delete cascade, 0094), and a cascade skips the
-- rules above: by deleting the template, any coach at the gym could cancel a start for everyone or end the gym programme, which only a gym
-- admin can do. Only a gym admin (or nobody signed in: the SQL editor, the service role) can delete a template with a rollout for everyone
-- that:
--   - has not started yet (scheduled, or given out ahead of its start date);
--   - is the gym's programme today until its last week is over, ended or not (as gym_programmes() shows it on the template);
--   - is the gym's programme today while the gym's programme before it is still open (within its weeks, not ended): without this one, that
--     one would be the gym's programme again. For a gym admin it is ended instead (an older one is never opened again).
-- The rollouts of a template only go at the end of the statement that deletes it (the cascade), so a rollout whose template is already
-- gone (deleted earlier in the same statement) is left out when the gym's programme and the one before it are picked: deleting several
-- templates in one request is decided as if they were deleted one after the other, whatever order the rows come in. And one delete at a
-- time per gym, with a lock taken before anything is read: a delete waits until another one at the gym has finished, then each statement
-- here sees what that one deleted, so two requests at once can't each pass because the other's rollout is still there.
-- Nobody signed in deletes as before, and nothing else is changed.
create or replace function public.program_templates_refuse_gym_programme_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_r programme_rollouts;
  v_admin boolean;
  v_today date;
  v_cur_id uuid;
  v_cur_last date;
  v_prev_id uuid;
  v_prev_name text;
  v_reopens boolean;
begin
  if auth.uid() is null then
    return old;
  end if;
  -- One delete at a time per gym, before anything is read.
  perform pg_advisory_xact_lock(hashtext('gym-programme-change:' || old.gym_id::text));
  for v_r in
    select r.* from programme_rollouts r where r.template_id = old.id and r.audience = 'all' order by r.start_date
  loop
    if v_r.gym_id is distinct from old.gym_id then
      perform pg_advisory_xact_lock(hashtext('gym-programme-change:' || v_r.gym_id::text));
    end if;
    v_admin := public.is_admin_of_gym(v_r.gym_id);
    select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) into v_today from gyms g where g.id = v_r.gym_id;
    if not v_admin and (v_r.applied_at is null or v_r.start_date > v_today) then
      raise exception '“%” is set to start for everyone at the gym on %, so only a gym admin can delete this template.',
        v_r.program_name, to_char(v_r.start_date, 'Dy FMDD Mon');
    end if;
    -- The gym's programme today, as _gym_programme_today picks it, leaving out a rollout whose template is already gone; and its last day.
    v_cur_id := null;
    v_cur_last := null;
    select x.id, x.start_date - (extract(isodow from x.start_date)::integer - 1) + 7 * tw.weeks - 1
      into v_cur_id, v_cur_last
    from programme_rollouts x
    cross join lateral (
      select coalesce(max(d.week_num), 0)::integer as weeks from program_template_days d where d.template_id = x.template_id
    ) tw
    where x.gym_id = v_r.gym_id and x.audience = 'all' and x.applied_at is not null and x.start_date <= v_today
      and exists (select 1 from program_templates t where t.id = x.template_id)
    order by x.start_date desc, x.created_at desc
    limit 1;
    continue when v_cur_id is distinct from v_r.id;
    if not v_admin and v_today <= v_cur_last then
      raise exception '“%” is the gym programme until %, so only a gym admin can delete this template.',
        v_r.program_name, to_char(v_cur_last, 'Dy FMDD Mon');
    end if;
    -- Without it, the gym's programme would be the one before it (not this template's, nor one whose template is already gone).
    v_prev_id := null;
    v_prev_name := null;
    v_reopens := false;
    select x.id, x.program_name,
           x.ended_at is null and tw.weeks > 0 and v_today <= x.start_date - (extract(isodow from x.start_date)::integer - 1) + 7 * tw.weeks - 1
      into v_prev_id, v_prev_name, v_reopens
    from programme_rollouts x
    cross join lateral (
      select coalesce(max(d.week_num), 0)::integer as weeks from program_template_days d where d.template_id = x.template_id
    ) tw
    where x.gym_id = v_r.gym_id and x.audience = 'all' and x.applied_at is not null and x.start_date <= v_today and x.template_id <> old.id
      and exists (select 1 from program_templates t where t.id = x.template_id)
    order by x.start_date desc, x.created_at desc
    limit 1;
    if coalesce(v_reopens, false) then
      if not v_admin then
        raise exception '“%”, the gym programme before this one, would end with it, so only a gym admin can delete this template.', v_prev_name;
      end if;
      update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_prev_id and ended_at is null;
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

-- The gym programme's last day comes from its template's weeks (_gym_programme_today), so taking the last week off its template ends it a
-- week sooner, or straight away, and then lets its template be deleted (above). Only a gym admin can, as only a gym admin can end it
-- (end_gym_programme). While a template's rollout for everyone is the gym's programme, until its last week is over (ended or not, as
-- above), a coach who isn't a gym admin can't delete the days of its last week or move them to an earlier week or another template.
-- Anything else is as before (nobody signed in: as before). An AFTER trigger sees the whole statement done: the template has lost its last
-- week when its last week now is before the week a changed day was in. A template being deleted is left to its own trigger above.
-- Changes to the days of a template given out for everyone wait for each other (a lock per template) before the weeks are counted: two
-- requests at once, each taking one workout of the last week off, each counted the other's workout still there, so both passed. Now the
-- second waits for the first to finish and counts without it. The lock is the template's, not the gym's as above, so deleting a week can't
-- deadlock with deleting the template (which holds the gym's lock while it deletes the template's days).
create or replace function public.program_template_days_refuse_gym_programme_shorten()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_weeks integer;
  v_r programme_rollouts;
  v_g record;
begin
  if auth.uid() is null or (tg_op = 'UPDATE' and new.template_id = old.template_id and new.week_num >= old.week_num) then
    return null;
  end if;
  if not exists (select 1 from program_templates t where t.id = old.template_id) then
    return null;
  end if;
  if not exists (
    select 1 from programme_rollouts r where r.template_id = old.template_id and r.audience = 'all' and r.applied_at is not null
  ) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('gym-programme-template-days:' || old.template_id::text));
  select coalesce(max(d.week_num), 0)::integer into v_weeks from program_template_days d where d.template_id = old.template_id;
  if v_weeks >= old.week_num then
    return null;
  end if;
  for v_r in
    select r.* from programme_rollouts r where r.template_id = old.template_id and r.audience = 'all' and r.applied_at is not null
  loop
    continue when public.is_admin_of_gym(v_r.gym_id);
    select * into v_g from public._gym_programme_today(v_r.gym_id);
    continue when v_g.rollout_id is distinct from v_r.id;
    -- Before this change its last day was at least the Sunday of this day's week.
    if v_g.today <= v_g.week_one + 7 * old.week_num - 1 then
      raise exception 'This template is the gym programme “%”, so only a gym admin can take weeks off it.', v_r.program_name;
    end if;
  end loop;
  return null;
end;
$fn$;

revoke all on function public.program_template_days_refuse_gym_programme_shorten() from public, anon, authenticated;

drop trigger if exists program_template_days_refuse_gym_programme_shorten on program_template_days;
create trigger program_template_days_refuse_gym_programme_shorten
  after update of week_num, template_id or delete on program_template_days
  for each row execute function public.program_template_days_refuse_gym_programme_shorten();

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

-- Gives a member the gym programme their gym is on today, as their own copy starting today on the gym's current week. No permission check
-- of its own: the trigger below (the member's own profile) and resolve_gym_programme_waiting (after its checks) call it.
-- p_force: give it even when another programme of theirs runs over the same dates (the coach chose "Give it to them").
-- Answers: 'given'; 'has_it' (a copy from this rollout already); 'own_programme' (listed as waiting instead); 'closed' (not the gym's
-- programme today, or ended, or the member is not at that gym).
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
  if v_g.rollout_id is null or v_g.rollout_id is distinct from p_rollout_id or not coalesce(v_g.is_open, false) then
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
    if v_g.rollout_id is null or not coalesce(v_g.is_open, false) then
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

-- For the coach's template list: the programme the coach's gym is on today, while its last week has not finished (ended or not).
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
    select t.rollout_id, t.template_id, t.program_name, g.name, t.start_date, t.week_one, t.weeks, t.last_day, t.today,
           ((t.today - t.week_one) / 7 + 1)::integer, t.is_open, t.ended_at, u.n, u.later, coalesce(w.list, '[]'::jsonb)
    from public._gym_programme_today(v_gym) t
    join gyms g on g.id = v_gym
    cross join lateral (
      select count(distinct c.client_id)::integer as n,
             count(distinct c.client_id) filter (where wp.start_date > t.start_date)::integer as later
      from public._rollout_live_copies(t.rollout_id) c
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
                   and x.rollout_id is distinct from t.rollout_id
                   and x.start_date >= t.today
                   and x.start_date <= t.last_day)
             ) order by q.created_at) as list
      from gym_programme_waiting q
      join profiles p on p.id = q.client_id
      left join client_profiles cp on cp.client_id = q.client_id
      left join workout_programs op on op.id = q.other_program_id
      where q.rollout_id = t.rollout_id
        and q.resolved_at is null
        and t.is_open
        and public.client_gym_id(q.client_id) is not distinct from v_gym
        and not exists (select 1 from workout_programs x where x.client_id = q.client_id and x.rollout_id = t.rollout_id)
        and (v_admin or coalesce(public.is_coach_of(q.client_id), false))
    ) w
    where t.today <= t.last_day;
end;
$fn$;

revoke all on function public.gym_programmes() from public, anon;
grant execute on function public.gym_programmes() to authenticated;

-- Stops new members getting a gym programme. The members on it keep it.
create or replace function public.end_gym_programme(p_rollout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_r programme_rollouts;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can end a gym programme';
  end if;
  select * into v_r from programme_rollouts where id = p_rollout_id;
  if v_r.id is null or v_r.gym_id is distinct from v_gym or v_r.audience <> 'all' then
    raise exception 'Gym programme not found';
  end if;
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin) then
    raise exception 'Only a gym admin can end a gym programme.';
  end if;
  if v_r.applied_at is null then
    raise exception 'It hasn''t started yet: cancel the scheduled start instead.';
  end if;
  update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_r.id and ended_at is null;
end;
$fn$;

revoke all on function public.end_gym_programme(uuid) from public, anon;
grant execute on function public.end_gym_programme(uuid) to authenticated;

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

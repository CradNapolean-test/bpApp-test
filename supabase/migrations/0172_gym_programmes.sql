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
--         picks "Give it to them" (it takes over from today; theirs stays on file, and one that has not started yet, or starts today, now
--         starts the Monday after the gym programme's last week, so it cannot take over part-way) or "Keep theirs" (gym_programme_waiting,
--         new). A programme with no workouts yet counts as one week long, so a 1:1 programme a coach has only just made still counts;
--       - when the gym programme has ended or the gym has none.
--     Giving it can never stop a member finishing their profile: an error is caught, nothing is half-made, and the member is listed as
--     "Not given" with reason 'failed' so the coach can give it from the template.
--   * gym_programmes(): for the coach's template list, "Gym programme: Salford Quays from 9 Nov · 16 members": the programme the coach's
--     gym is on today while its last week has not finished, ended or not, with the members still on it (as programme_rollout_usage, 0167),
--     how many joined later, and the members waiting (the coach's own members; every one for a gym admin). Coaches at that gym only.
--   * end_gym_programme(rollout): stops new members getting it. The members on it keep it to the end and nothing they logged changes.
--     A gym admin only, as starting a programme for everyone is (0133). It cannot be re-opened: starting a new one for everyone takes over.
--   * resolve_gym_programme_waiting(rollout, member, give): "Give it to them" / "Keep theirs" for a member listed as Not given. The member's
--     coach or a gym admin, at the member's gym, while the gym programme is open.
--   * programme_rollouts rules: the one "for all" rule let any coach at the gym change a rollout straight through the API: end a gym
--     programme without being a gym admin, open an ended one again, or turn chosen members into everyone. Now a coach can read their gym's
--     rollouts and cancel one that has not been given out yet (what the app does, cancelProgrammeRollout), one for everyone only as a gym
--     admin; everything else goes through the functions (schedule_programme_rollout, apply_programme_rollout, end_gym_programme), which run
--     as the table owner.
--
-- Not changed: apply_programme_rollout, apply_due_programme_rollouts, schedule_programme_rollout, instantiate_template_core (called as it
-- is), apply_template_to_rollout, programme_rollout_usage. The migration itself gives nobody a programme and changes no programme: late
-- joiners are given it from the next profile set up. The 3 members above stay on their own programmes.
--
-- Apply: before or after the deploy. The app reads gym_programmes() and shows nothing when it is missing; applying it first means the
-- new "members who join later get it too" wording in Start a programme is true from the deploy.
--
-- Guard: the migration stops before changing anything when a table, column or function it uses is missing ("... is missing"), or when a
-- function it creates already exists with a different body ("... is not the one from migration 0172"). Safe to run twice.
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
--          exists (select 1 from pg_trigger where tgrelid = 'public.client_profiles'::regclass and tgname = 'client_profiles_gym_programme');
-- Expected: true, true, true, true, 0, true (the waiting list has no rules: only the functions read and write it).
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
-- after end_gym_programme, or after the last Sunday -> nothing; a non-admin coach cannot end it (function or direct update), nor cancel a
-- scheduled start for everyone (direct delete), but can cancel one for chosen members; a member cannot call gym_programmes,
-- end_gym_programme or resolve_gym_programme_waiting.
--
-- ROLLBACK: drop trigger client_profiles_gym_programme on public.client_profiles; drop function public.client_profiles_join_gym_programme();
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

  -- The functions this migration creates: none may exist yet with another body (a second run finds its own).
  for v_check in
    select * from (values
      ('_gym_programme_today', '0172', array['63d299a9c29db8643c15e20d43a70bdb']),
      ('_give_gym_programme', '0172', array['4e10dc123d27774dee84ee6b08b3726e']),
      ('client_profiles_join_gym_programme', '0172', array['558f876ecd679247dc956a8f67bb5f0e']),
      ('gym_programmes', '0172', array['662073fea310d8827b69bac083e593f6']),
      ('end_gym_programme', '0172', array['8ff5f37461f44cd1e11e25c9a4cea232']),
      ('resolve_gym_programme_waiting', '0172', array['74c0f34c0813d2b78153984e38ae8950'])
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
  'A gym programme (audience all) a coach has ended: members who join the gym after this are not given it. The members on it keep it (migration 0172).';

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
               'other_program', op.name,
               'other_starts', op.start_date,
               'other_until', case when op.id is null then null else
                 least(coalesce(op.week_one, op.start_date), op.start_date)
                 + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = op.id), 0), 1) - 1 end
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

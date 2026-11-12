-- Workout programmes (live review decisions of 11 Nov 2026). Each part has its own before/after below:
--   1. D8 (LB1, TR18): a template shows how many members are on it, and the coach can copy the template's changes into everyone's copy on a
--      rollout, for the weeks they haven't reached yet.
--   2. D9 (TR19): a programme given to the whole gym or a group follows the gym's calendar; a 1:1 programme keeps its own start date.
--   Part 2's column comes first in the file because part 1 counts weeks with it.
--
-- 1. Today a rollout gives each member their own copy of the template on the start date (instantiate_template_core, 0152), and nothing links
--    the copy back afterwards: a fix made to the template later never reaches them. Live on 6 Nov, the 4 copies from the 10 Oct rollout of
--    "October Weeks 5-8" were an older, unfinished version (week 1 Tuesday empty where the template has 16 exercises).
--    New: _rollout_live_copies(rollout) (internal), the copies on a rollout that are still running or not yet started: the member has not
--      started a later programme since, and the copy's last week has not finished. The week a member is on is counted from the copy's
--      first day (week_one, part 2, or its start date) in the gym's timezone, as the app does.
--    New: programme_rollout_usage(), for the coach's template list: each given-out rollout at the coach's gym with members still on it, and
--      how many. Signed-in coaches only, their own gym only, counts only (no names).
--    New: apply_template_to_rollout(rollout, dry_run). For each live copy on the rollout, for each week after the one the member is on now
--      (the current week is never changed, so today's workout and anything already done stay as they are):
--        * days with anything the member has done on them (a logged set, a block result or pick, or day feedback) are kept as they are;
--        * every other day in those weeks is deleted and the template's days for those weeks are copied in, exactly as starting the
--          programme does (same columns, same weekly load progression), except a template day where a kept day sits (same week and
--          weekday, or the same name when it has no weekday).
--      A dry run (the default) changes nothing and returns the counts the coach's confirm shows: { members, days_removed, days_added,
--      days_kept }. Who may run it: a gym admin, or a coach when every member on the rollout is theirs, at the rollout's gym; a rollout for
--      everyone at the gym needs a gym admin, as starting one does (0133). A member's own changes to a future day are replaced: the confirm
--      says so.
--
-- 2. Every programme counted its weeks from its own start date (resolveActiveProgram, lib/utils/checkin.ts and the phone's twin), so members on
--    the same class programme were on different weeks: October copies started 10, 12, 19 and 24 Oct (TR19), and a rollout started on a
--    Tuesday turned its weeks over on Tuesdays while the gym's week starts on Monday.
--    New: workout_programs.week_one (date, a Monday or empty): where week 1 starts for a programme given out by a rollout ("everyone at the
--      gym" or chosen members / a group, programme_rollouts.audience 'all' or 'selected'). That is how a gym or group programme is told from
--      a 1:1 one: a rollout copy has rollout_id, a programme started for one member from their page has none. The app counts weeks from
--      week_one when it is set (programWeekStart), else from the start date as before. The start date still decides when the copy takes
--      over from the member's last programme, so a member whose copy starts on the Tuesday still has their old programme on the Monday.
--    New: trigger workout_programs_week_one sets week_one to the Monday of the start date's week when a rollout copy is made, and again when
--      its start date is changed. It is kept if the rollout is later deleted (rollout_id goes empty), so a member's weeks don't jump.
--    Backfill: every existing rollout copy with a start date gets week_one. Before -> after on 12 Nov 2026, the only copies still running
--      are the 17 from November Weeks 9-11 (Tue 10 Nov, everyone): week 2 now starts Mon 16 Nov (was Tue 17 Nov), and the last day is
--      Sun 29 Nov (was Mon 30 Nov), so the coach's "ends soon" To do and the member's last-week notice move a day earlier too. Copies
--      started on a Monday (October Weeks 5-8 of 19 Oct) don't change. 1:1 programmes don't change.
--
-- Guard: the migration stops before changing anything ("... is missing") unless the tables and columns it reads are there (rollouts from
-- 0094, block_config from 0152, workout_block_choices from 0095, day feedback from 0020) and local_date (0129).
--
-- PRE-FLIGHT (read-only):
--   select to_regclass('public.programme_rollouts') is not null as rollouts, to_regclass('public.workout_block_choices') is not null as choices,
--          to_regclass('public.workout_block_results') is not null as results, to_regclass('public.workout_day_feedback') is not null as feedback,
--          to_regprocedure('public.local_date(text, timestamptz)') is not null as local_date,
--          to_regprocedure('public.apply_template_to_rollout(uuid, boolean)') is not null as already_applied;
-- Expected before: true, true, true, true, true, false.
--
--   -- 2. Rollout copies by the weekday they started (isodow 1 = Monday), and how many already have week_one (none before):
--   select extract(isodow from wp.start_date) as isodow, count(*) as copies
--   from public.workout_programs wp where wp.rollout_id is not null and wp.start_date is not null group by 1 order by 1;
-- Expected on 12 Nov 2026: 1 -> 4 (19 Oct), 2 -> 17 (10 Nov), 6 -> 5 (3 and 10 Oct), 7 -> 1 (4 Oct): 27 copies.
--
--   -- 1. Members on each rollout copy today, and how many of those copies are still running (what "In use by" will show):
--   select r.program_name, r.start_date, r.audience, count(wp.id) as copies
--   from public.programme_rollouts r left join public.workout_programs wp on wp.rollout_id = r.id
--   group by r.id order by r.start_date;
-- Expected on 12 Nov 2026: September Weeks 1-4 (3 Oct, 4 Oct) 1 and 1, test 2 (3 Oct) 1, October Weeks 5-8 (10 Oct) 4, October Weeks 5-8
-- (19 Oct) 4, November Weeks 9-11 (10 Nov) 17.
--
-- AFTER (read-only):
--   select to_regprocedure('public.apply_template_to_rollout(uuid, boolean)') is not null, to_regprocedure('public.programme_rollout_usage()') is not null;
-- Expected: true, true. Then, signed in as a coach in the app: the template list shows "In use by 17 members" on November Weeks 9-11, and
-- the template's "Apply to everyone" confirm names the members (a dry run, nothing changes until the coach confirms).
--   -- No copy changed by the migration itself (it only adds functions):
--   select count(*) from public.workout_program_days d join public.workout_programs wp on wp.id = d.program_id where wp.rollout_id is not null;
-- Expected: the same number before and after.
--
--   -- 2. Every rollout copy has a Monday week_one in the week it started, and nothing else has one:
--   select count(*) filter (where week_one is not null) as with_week_one,
--          count(*) filter (where rollout_id is not null and start_date is not null and week_one is null) as missing,
--          count(*) filter (where week_one is not null and (extract(isodow from week_one) <> 1 or week_one > start_date or start_date - week_one > 6)) as wrong
--   from public.workout_programs;
-- Expected: 27, 0, 0 (with_week_one = the copies counted before).
--   select wp.start_date, wp.week_one, count(*) from public.workout_programs wp where wp.rollout_id is not null group by 1, 2 order by 1;
-- Expected: 3 Oct -> 28 Sep, 4 Oct -> 28 Sep, 10 Oct -> 5 Oct, 19 Oct -> 19 Oct, 10 Nov -> 9 Nov.
--
-- ROLLBACK: drop trigger workout_programs_week_one on public.workout_programs; drop function public.set_programme_week_one();
--           alter table public.workout_programs drop column week_one (the app then counts from start dates again);
--           drop function public.apply_template_to_rollout(uuid, boolean); drop function public.programme_rollout_usage();
--           drop function public._slot_kept(uuid, integer, integer, text); drop function public._program_day_has_activity(uuid);
--           drop function public._rollout_live_copies(uuid).

do $guard$
begin
  if to_regclass('public.programme_rollouts') is null then raise exception 'programme_rollouts is missing (migration 0094)'; end if;
  if to_regclass('public.workout_block_choices') is null then raise exception 'workout_block_choices is missing (migration 0095)'; end if;
  if to_regclass('public.workout_block_results') is null then raise exception 'workout_block_results is missing (migration 0152)'; end if;
  if to_regclass('public.workout_day_feedback') is null then raise exception 'workout_day_feedback is missing (migration 0020)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'program_template_exercises' and column_name = 'block_config') then
    raise exception 'program_template_exercises.block_config is missing (migration 0152)';
  end if;
  if to_regprocedure('public.local_date(text, timestamptz)') is null then raise exception 'local_date is missing (migration 0129)'; end if;
end;
$guard$;


-- 2. D9 (first: part 1 counts weeks with week_one) -------------------------------------------------------------------------------------------

alter table workout_programs add column if not exists week_one date;
alter table workout_programs drop constraint if exists workout_programs_week_one_monday;
alter table workout_programs add constraint workout_programs_week_one_monday check (week_one is null or extract(isodow from week_one) = 1);
comment on column workout_programs.week_one is
  'Where week 1 starts (a Monday) for a programme given out by a rollout: its weeks follow the gym calendar. Empty for a 1:1 programme, which counts from start_date (D9, migration 0167).';

-- A rollout copy follows the gym's week: week 1 is the Monday-to-Sunday week it starts in.
create or replace function public.set_programme_week_one()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.rollout_id is not null and new.start_date is not null
     and ((tg_op = 'INSERT' and new.week_one is null) or (tg_op = 'UPDATE' and new.start_date is distinct from old.start_date)) then
    new.week_one := new.start_date - (extract(isodow from new.start_date)::integer - 1);
  end if;
  return new;
end;
$fn$;

drop trigger if exists workout_programs_week_one on workout_programs;
create trigger workout_programs_week_one
  before insert or update of start_date on workout_programs
  for each row execute function public.set_programme_week_one();

update workout_programs
set week_one = start_date - (extract(isodow from start_date)::integer - 1)
where rollout_id is not null and start_date is not null and week_one is null;


-- 1. D8 ------------------------------------------------------------------------------------------------------------------------------------

-- The copies on a rollout that are still running or not yet started, and the week each member is on today (0 = not started yet).
create or replace function public._rollout_live_copies(p_rollout_id uuid)
returns table (program_id uuid, client_id uuid, current_week integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select wp.id, wp.client_id, w.current_week
  from programme_rollouts r
  join gyms g on g.id = r.gym_id
  cross join lateral (select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today) t
  join workout_programs wp on wp.rollout_id = r.id and wp.start_date is not null
  cross join lateral (
    -- as programWeekStart in the app: week_one when it is set and not after the start date, else the start date
    select case when wp.start_date > t.today then 0
                else (t.today - least(coalesce(wp.week_one, wp.start_date), wp.start_date)) / 7 + 1 end as current_week
  ) w
  where r.id = p_rollout_id
    -- the member has not started a later programme since
    and not exists (
      select 1 from workout_programs o
      where o.client_id = wp.client_id and o.id <> wp.id and o.start_date > wp.start_date and o.start_date <= t.today
    )
    -- and the copy's last week has not finished
    and w.current_week <= coalesce((select max(d.week_num) from workout_program_days d where d.program_id = wp.id), 0);
$fn$;

revoke all on function public._rollout_live_copies(uuid) from public, anon, authenticated;

-- Whether a member has done anything on a programme day: a logged set, a block result or pick, or day feedback.
create or replace function public._program_day_has_activity(p_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from workout_logs l join workout_exercises e on e.id = l.exercise_id where e.program_day_id = p_day_id)
      or exists (select 1 from workout_block_results b where b.program_day_id = p_day_id)
      or exists (select 1 from workout_block_choices c where c.program_day_id = p_day_id)
      or exists (select 1 from workout_day_feedback f where f.program_day_id = p_day_id);
$fn$;

revoke all on function public._program_day_has_activity(uuid) from public, anon, authenticated;

-- Whether a copy keeps a day the member has done something on in this slot (same week and weekday, or the same name when it has no
-- weekday), so the template's day for that slot is not added next to it.
create or replace function public._slot_kept(p_program_id uuid, p_week integer, p_position integer, p_label text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from workout_program_days d
    where d.program_id = p_program_id and d.week_num = p_week
      and (d.day_position = p_position or (p_position is null and d.day_position is null and d.day_label = p_label))
      and public._program_day_has_activity(d.id)
  );
$fn$;

revoke all on function public._slot_kept(uuid, integer, integer, text) from public, anon, authenticated;

-- For the coach's template list: the given-out rollouts at the coach's gym that members are still on, and how many members.
create or replace function public.programme_rollout_usage()
returns table (rollout_id uuid, template_id uuid, program_name text, start_date date, audience text, members integer)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_gym uuid := public.my_gym_id();
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can see this';
  end if;
  return query
    select r.id, r.template_id, r.program_name, r.start_date, r.audience, u.n
    from programme_rollouts r
    cross join lateral (select count(distinct c.client_id)::integer as n from public._rollout_live_copies(r.id) c) u
    where r.gym_id = v_gym and r.applied_at is not null and u.n > 0
    order by r.start_date desc;
end;
$fn$;

revoke all on function public.programme_rollout_usage() from public, anon;
grant execute on function public.programme_rollout_usage() to authenticated;

-- Copies the template's weeks the members haven't reached yet into every live copy on the rollout. Dry run by default.
create or replace function public.apply_template_to_rollout(p_rollout_id uuid, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gym uuid := public.my_gym_id();
  v_admin boolean;
  v_r programme_rollouts;
  v_template program_templates;
  v_min_week integer;
  v_copy record;
  v_tday record;
  v_tex record;
  v_new_day_id uuid;
  v_week_offset integer;
  v_applied_load numeric;
  v_removed integer;
  v_added integer;
  v_kept integer;
  v_members integer := 0;
  v_total_removed integer := 0;
  v_total_added integer := 0;
  v_total_kept integer := 0;
begin
  if auth.uid() is null or v_gym is null then
    raise exception 'Only a coach can change a programme';
  end if;
  select * into v_r from programme_rollouts where id = p_rollout_id;
  if v_r.id is null or v_r.gym_id is distinct from v_gym then
    raise exception 'Rollout not found';
  end if;
  select * into v_template from program_templates where id = v_r.template_id;
  if v_template.id is null or v_template.gym_id is distinct from v_gym then
    raise exception 'Programme template not found';
  end if;
  v_admin := exists (select 1 from profiles where id = auth.uid() and is_gym_admin);
  if not v_admin and v_r.audience = 'all' then
    raise exception 'Only a gym admin can change a programme given to everyone at the gym.';
  end if;
  if not v_admin and exists (
    select 1 from workout_programs wp where wp.rollout_id = v_r.id and not coalesce(public.is_coach_of(wp.client_id), false)
  ) then
    raise exception 'You can only change programmes for your own members.';
  end if;

  select min(week_num) into v_min_week from program_template_days where template_id = v_template.id;

  for v_copy in select * from public._rollout_live_copies(v_r.id) loop
    -- Future days the member has done something on are kept; the rest of those weeks is replaced.
    select count(*) filter (where public._program_day_has_activity(d.id)), count(*) filter (where not public._program_day_has_activity(d.id))
    into v_kept, v_removed
    from workout_program_days d
    where d.program_id = v_copy.program_id and d.week_num > v_copy.current_week;

    select count(*) into v_added
    from program_template_days td
    where td.template_id = v_template.id and td.week_num > v_copy.current_week
      and not public._slot_kept(v_copy.program_id, td.week_num, td.day_position, td.day_label);

    if v_removed + v_added > 0 then
      v_members := v_members + 1;
    end if;
    v_total_removed := v_total_removed + v_removed;
    v_total_added := v_total_added + v_added;
    v_total_kept := v_total_kept + v_kept;

    if not coalesce(p_dry_run, true) and v_removed + v_added > 0 then
      delete from workout_program_days d
      where d.program_id = v_copy.program_id and d.week_num > v_copy.current_week and not public._program_day_has_activity(d.id);

      -- As instantiate_template_core (0152) copies a day.
      for v_tday in
        select * from program_template_days td
        where td.template_id = v_template.id and td.week_num > v_copy.current_week
          and not public._slot_kept(v_copy.program_id, td.week_num, td.day_position, td.day_label)
        order by td.sort_order
      loop
        insert into workout_program_days (program_id, week_num, day_label, sort_order, phase_label, day_position)
        values (v_copy.program_id, v_tday.week_num, v_tday.day_label, v_tday.sort_order, v_tday.phase_label, v_tday.day_position)
        returning id into v_new_day_id;

        v_week_offset := v_tday.week_num - v_min_week;

        for v_tex in select * from program_template_exercises where template_day_id = v_tday.id order by sort_order loop
          v_applied_load := v_tex.load;
          if v_tex.progression_load_increment is not null and v_tex.load is not null then
            v_applied_load := v_tex.load
              + v_tex.progression_load_increment * floor(v_week_offset / v_tex.progression_every_weeks);
          end if;

          insert into workout_exercises (
            program_day_id, exercise_library_id, name, sets, reps, load, rpe,
            notes, video_url, superset_group, rest_seconds, sort_order,
            block_type, prescription_type, percent_1rm,
            section, block_no, block_format, block_part,
            tracking_type, target_seconds, target_distance, target_calories, block_config
          )
          values (
            v_new_day_id, v_tex.exercise_library_id, v_tex.name, v_tex.sets, v_tex.reps, v_applied_load, v_tex.rpe,
            v_tex.notes, v_tex.video_url, v_tex.superset_group, v_tex.rest_seconds, v_tex.sort_order,
            v_tex.block_type, v_tex.prescription_type, v_tex.percent_1rm,
            v_tex.section, v_tex.block_no, v_tex.block_format, v_tex.block_part,
            v_tex.tracking_type, v_tex.target_seconds, v_tex.target_distance, v_tex.target_calories, v_tex.block_config
          );
        end loop;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('members', v_members, 'days_removed', v_total_removed, 'days_added', v_total_added, 'days_kept', v_total_kept);
end;
$fn$;

revoke all on function public.apply_template_to_rollout(uuid, boolean) from public, anon;
grant execute on function public.apply_template_to_rollout(uuid, boolean) to authenticated;

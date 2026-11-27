-- Library, bigger pieces (live review Build 9: LB11, LB22; 27 Nov 2026).
--
-- Before: an exercise's "used in" count (the exercise's sheet, and what Delete says) counted programme templates only, so an exercise only
-- members' own programmes used was offered for delete, and the delete then failed (LB11).
--
-- New:
--   1. exercise_library_usage() -> table (exercise_library_id, templates, member_programmes). One read for the whole library: for each
--      exercise in use, how many programme templates and how many members' own programmes (workout_programs) use it, each counted once
--      however many weeks repeat it. It is "security INVOKER" on purpose (not definer): it runs as the coach who calls it, so the tables'
--      read rules decide what it counts, exactly what this coach can already read (their own members' programmes and their gym's, 0053).
--      It writes nothing. Signed-in users only (a member calling it counts only their own programme).
--
-- Apply: BEFORE or AFTER the deploy; either works. Deployed first, the app counts templates only, as today. Applied first, the live app
-- doesn't call the new function.
--
-- Guard: the migration stops before changing anything when a table or column it uses is missing ("... is missing"), or when a function it
-- creates already exists with a different body ("... already exists and is not this file's"). Bodies are compared with spaces and line
-- breaks squeezed out. A second run finds this file's own bodies and passes. Safe to run twice: everything is "create or replace" with
-- the same bodies, and the grants are the same.
--
-- PRE-FLIGHT (read-only):
--   select to_regprocedure('public.exercise_library_usage()') is not null as usage_function;
-- Expected before: false.
--
-- AFTER (read-only):
--   (the PRE-FLIGHT's query again)
-- Expected after: true.
--   select p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as body_md5, p.prosecdef, p.provolatile, p.proconfig
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('exercise_library_usage') order by 1;
-- Expected after: exercise_library_usage <md5 in the guard below>, prosecdef false (invoker), provolatile s, proconfig {search_path=public}.
--   select has_function_privilege('authenticated', 'public.exercise_library_usage()', 'execute') as signed_in,
--          has_function_privilege('anon', 'public.exercise_library_usage()', 'execute') as anyone;
-- Expected: true, false.
--   select count(*) as exercises_in_use, sum(templates) as template_uses, sum(member_programmes) as programme_uses
--   from public.exercise_library_usage();
-- In the SQL editor this runs as the owner and so counts everything; note the numbers (as a coach it counts only what they can read).
--
-- REVERSE: drop function if exists public.exercise_library_usage(); (the app goes back to counting templates only).
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
      ('exercise_library_usage', '91bf7b4c376cd596310940490eb0c17f')
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

  foreach v_name in array array['public.program_template_exercises', 'public.program_template_days', 'public.workout_exercises', 'public.workout_program_days'] loop
    if to_regclass(v_name) is null then
      raise exception 'table % is missing, so nothing was changed.', v_name;
    end if;
  end loop;

  for v_check in
    select * from (values
      ('program_template_exercises', 'exercise_library_id'), ('program_template_exercises', 'template_day_id'),
      ('program_template_days', 'id'), ('program_template_days', 'template_id'),
      ('workout_exercises', 'exercise_library_id'), ('workout_exercises', 'program_day_id'),
      ('workout_program_days', 'id'), ('workout_program_days', 'program_id')
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

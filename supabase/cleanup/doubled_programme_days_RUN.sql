-- Step 3 of doubled_programme_days.sql, ready to run (read that file for what and why). Paste all of this into the Supabase SQL editor and
-- run it once. It is one transaction: if the counts are not 12 template days and 240 member programme days (the counts on 17 Nov
-- 2026), it stops, says what it found, and changes nothing. A day a member has done something on is never deleted.
do $cleanup$
declare
  v_expect_template_days integer := 12;
  v_expect_programme_days integer := 240;
  v_template_days integer;
  v_programme_days integer;
begin
  with ranked as (
    select d.id,
           row_number() over (
             partition by d.template_id, d.week_num, coalesce(d.day_position, -1), lower(btrim(d.day_label))
             order by d.id
           ) as copy_no
    from public.program_template_days d
  ), gone as (
    delete from public.program_template_days d using ranked r
    where d.id = r.id and r.copy_no > 1
    returning 1
  )
  select count(*) into v_template_days from gone;

  with ranked as (
    select d.id,
           public._program_day_has_activity(d.id) as has_activity,
           row_number() over (
             partition by d.program_id, d.week_num, coalesce(d.day_position, -1), lower(btrim(d.day_label))
             order by public._program_day_has_activity(d.id) desc, d.id
           ) as copy_no
    from public.workout_program_days d
  ), gone as (
    delete from public.workout_program_days d using ranked r
    where d.id = r.id and r.copy_no > 1 and not r.has_activity
    returning 1
  )
  select count(*) into v_programme_days from gone;

  if v_template_days <> v_expect_template_days or v_programme_days <> v_expect_programme_days then
    raise exception 'Expected % template days and % programme days, found % and %. Nothing was changed.',
      v_expect_template_days, v_expect_programme_days, v_template_days, v_programme_days;
  end if;
  raise notice 'Deleted % template days and % member programme days.', v_template_days, v_programme_days;
end
$cleanup$;

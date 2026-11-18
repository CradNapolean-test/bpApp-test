-- Clean-up for "programme days show twice" (found 17 Nov 2026). NOT run by Claude. Read it, take a backup, then run it yourself in the
-- Supabase SQL editor on the live database, one step at a time.
--
-- What happened: the template "November Weeks 9-11" has every workout twice in weeks 2 and 3 (6 workouts in week 1, 12 in each of weeks
-- 2 and 3). "Add week (copy of last)" worked out the last week from what the screen showed. The button came back on before the screen
-- had reloaded, so a second tap copied week 1 into week 2 again. The next "Add week" then copied the doubled week 2 into week 3. Every
-- member given the template got the same: 20 programmes (19 members; one member has it twice), 12 extra days each, 240 in all. The two
-- copies of each day are the same workout, exercise for exercise (checked 17 Nov). The app now reads the last week from the database
-- when it adds a week (addTemplateWeek and addProgramWeek), so this can't happen again from a second tap.
--
-- What this does: in every template and member programme, where a week has the same workout more than once (same week, same weekday,
-- same name), it keeps one and deletes the others with their exercises. On a member's programme it keeps the copy the member has done
-- something on (a logged set, a block result or pick, or day feedback). A day with anything done on it is never deleted, even when it
-- is a second copy. On 17 Nov, 4 doubled days had something done on one copy, and none on both.
--
-- Counts on 17 Nov: 12 template days to delete; 240 member programme days to delete, in 20 programmes, for 19 members. If a coach gives
-- out the template again before you run this, the member count goes up; that's expected. Clean the template (step 3 does it first) so
-- no new copies are doubled.


-- STEP 1 (read-only): the template's extra days.
with ranked as (
  select d.id, d.template_id, d.week_num,
         row_number() over (
           partition by d.template_id, d.week_num, coalesce(d.day_position, -1), lower(btrim(d.day_label))
           order by d.id
         ) as copy_no
  from public.program_template_days d
)
select t.name as template, r.week_num, count(*) as extra_days
from ranked r
join public.program_templates t on t.id = r.template_id
where r.copy_no > 1
group by t.name, r.week_num
order by t.name, r.week_num;
-- Expect: November Weeks 9-11, week 2: 6; week 3: 6.


-- STEP 2 (read-only): the members' extra days. "kept_anyway" counts second copies the member has also done something on: they are left
-- in place by step 3 (expected 0).
with ranked as (
  select d.id, d.program_id,
         public._program_day_has_activity(d.id) as has_activity,
         row_number() over (
           partition by d.program_id, d.week_num, coalesce(d.day_position, -1), lower(btrim(d.day_label))
           order by public._program_day_has_activity(d.id) desc, d.id
         ) as copy_no
  from public.workout_program_days d
)
select p.name as programme,
       count(*) filter (where not r.has_activity) as days_to_delete,
       count(*) filter (where r.has_activity) as kept_anyway,
       count(distinct r.program_id) as programmes,
       count(distinct p.client_id) as members
from ranked r
join public.workout_programs p on p.id = r.program_id
where r.copy_no > 1
group by p.name;
-- Expect: November Weeks 9-11: 240 to delete, 0 kept anyway, 20 programmes, 19 members.


-- STEP 3 (changes data). To run it: put the counts steps 1 and 2 showed into the two numbers below (12 and 240 on 17 Nov), delete the
-- line "/* STEP 3" and the line "STEP 3 */", then run just this step. It is one transaction: if either count doesn't match, it stops,
-- says what it found, and changes nothing.
/* STEP 3
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
STEP 3 */


-- STEP 4 (read-only): run steps 1 and 2 again. Both should return no rows. Then this should show 6 days in each week of the template.
select t.name, d.week_num, count(*) as days
from public.program_template_days d
join public.program_templates t on t.id = d.template_id
where t.name = 'November Weeks 9-11'
group by t.name, d.week_num
order by d.week_num;


-- FOR YOU TO JUDGE (read-only, nothing above changes it): members with the same programme name more than once. On 17 Nov one member had
-- "November Weeks 9-11" twice, both given 1:1 on 11 Nov a minute apart (one starting 9 Nov, one 16 Nov). If one is a mistake, delete it
-- from the member's Training page as usual.
select p.client_id, p.name, count(*) as copies, array_agg(p.start_date order by p.start_date) as start_dates,
       array_agg(p.created_at order by p.start_date) as given_out_at
from public.workout_programs p
group by p.client_id, p.name
having count(*) > 1
order by max(p.created_at) desc;

-- Tracking types and block scoring for the exercises and blocks that already existed (data only; no schema change).
--
-- Found in the live review of 5 Nov 2026: 0151 and 0152 added "what gets recorded" and block scoring, but every exercise that
-- already existed stayed on the defaults. All 474 library exercises, 512 template rows and 3,975 of 3,976 programme rows record
-- weight x reps, so a member doing RUN, BIKE, SKI ERG or "KCals" is asked for reps (and offered a weight). And 21 template blocks
-- and 255 programme blocks are set as AMRAP, EMOM or Big Chipper with no scoring ("No result"), so nobody is asked for rounds
-- or a finish time.
--
-- 1. What gets recorded. The names below are every library, template and programme exercise name (lower case) that
--    lib/trackingGuess.ts reads as something other than weight x reps; the app now uses the same rules for new exercises.
--    A row is changed only if it still records weight x reps, so anything a coach has already set is left alone. Programme
--    rows that already have a set logged with reps or a weight keep weight x reps, so a logged set never loses its numbers.
--    Instruction rows (block_type 'circuit') are not exercises and are left alone.
--    Counts on 5 Nov 2026: 109 library exercises, 141 template rows, 1,371 programme rows (13 kept because sets are logged).
-- 2. Block scoring. A block with a known format and no scoring on any of its rows gets what picking that format in the builder
--    fills in today (defaultConfigFor in lib/blockScoring.ts): AMRAP and Partner AMRAP rounds and reps, EMOM done, Tabata
--    8 rounds of 20s on / 10s off, Circuit rounds, Big Chipper finish time. Blocks with no format, or one of the other formats,
--    stay as they are. Counts on 5 Nov 2026: 54 template rows (21 blocks) and 654 programme rows (255 blocks).
--    A block a coach deliberately set to "No result" since 30 Oct is stored the same way as one never set, so it gets the
--    format's scoring too; the coach can set it back in the format sheet.
--
-- PRE-FLIGHT (read-only): run the two "would change" queries at the bottom of this file, without the update statements,
-- to see the rows before applying. Safe to run more than once: a second run finds nothing left to change.
-- CHECK after applying (read-only):
--   select tracking_type, count(*) from exercise_library group by 1 order by 1;
--   select block_format, block_config, count(*) from workout_exercises where block_format is not null group by 1, 2 order by 1;
-- ROLLBACK: only before coaches change anything by hand: set tracking_type back to 'weight_reps' for the names in the list,
-- and block_config back to null where it equals the format's default.

begin;

create temporary table tracking_guess_0156 (name text primary key, tracking text not null) on commit drop;

insert into tracking_guess_0156 (name, tracking) values
    ('bike', 'calories'),
    ('erg of choice', 'calories'),
    ('erg sprints', 'calories'),
    ('kcals', 'calories'),
    ('rower', 'calories'),
    ('rower/ski', 'calories'),
    ('ski erg', 'calories'),
    ('ski erg roulette', 'calories'),
    ('bear crawl', 'distance'),
    ('reverse crawl', 'distance'),
    ('run', 'distance'),
    ('shuttles', 'distance'),
    ('db bicep carries', 'weight_distance'),
    ('db front rack carry', 'weight_distance'),
    ('db oh carry', 'weight_distance'),
    ('db sa oh carry', 'weight_distance'),
    ('farmer carries', 'weight_distance'),
    ('farmers walk', 'weight_distance'),
    ('mb bear hug carry', 'weight_distance'),
    ('mb carry', 'weight_distance'),
    ('plate front raise carry', 'weight_distance'),
    ('plate pinch carry', 'weight_distance'),
    ('prowler drag', 'weight_distance'),
    ('prowler pull', 'weight_distance'),
    ('prowler push', 'weight_distance'),
    ('suitcase carries', 'weight_distance'),
    ('suitcase carry', 'weight_distance'),
    ('waiter carries', 'weight_distance'),
    ('band front raise hold', 'time'),
    ('band lateral raise hold', 'time'),
    ('battle ropes', 'time'),
    ('cobra holds', 'time'),
    ('dead hang', 'time'),
    ('deep squat hold', 'time'),
    ('frog pump iso hold', 'time'),
    ('hip thrust hold', 'time'),
    ('iso bent over row', 'time'),
    ('iso glute bridge', 'time'),
    ('iso sl sprinter bridge', 'time'),
    ('iso sprinter bridge', 'time'),
    ('mb high plank', 'time'),
    ('palof hold', 'time'),
    ('pike holds', 'time'),
    ('plank', 'time'),
    ('protacted high plank', 'time'),
    ('side plank', 'time'),
    ('side star plank', 'time'),
    ('skipping', 'time'),
    ('sl glute bridge hold', 'time'),
    ('sl hip thrust hold', 'time'),
    ('split squat hold', 'time'),
    ('suppoerted squat hold', 'time'),
    ('wall sit', 'time'),
    ('db glute bridge hold', 'weight_time'),
    ('front raise hold', 'weight_time'),
    ('incline iso plate pull', 'weight_time'),
    ('iso incline db row', 'weight_time'),
    ('lateral raise hold', 'weight_time'),
    ('mb bear hug hold', 'weight_time'),
    ('plate bicep hold', 'weight_time'),
    ('plate front raise hold', 'weight_time'),
    ('suitcase holds', 'weight_time'),
    ('anchored lying leg raise', 'reps'),
    ('anchored reverse crunch', 'reps'),
    ('ball slams', 'reps'),
    ('banded crunch', 'reps'),
    ('banded deadbug', 'reps'),
    ('bear hold shoulder taps', 'reps'),
    ('bench dips', 'reps'),
    ('bird dog', 'reps'),
    ('body weight squats', 'reps'),
    ('box jumps', 'reps'),
    ('burpee', 'reps'),
    ('burpee thruster', 'reps'),
    ('burpee walkouts', 'reps'),
    ('bw squats', 'reps'),
    ('cheat pull ups', 'reps'),
    ('chin up', 'reps'),
    ('chin ups', 'reps'),
    ('close grip press up', 'reps'),
    ('close grip press ups', 'reps'),
    ('crunches', 'reps'),
    ('deadbug', 'reps'),
    ('ecc narrow grip press up', 'reps'),
    ('ghd sit up', 'reps'),
    ('high knees', 'reps'),
    ('kneeling ring roll out', 'reps'),
    ('kneeling ring roll outs', 'reps'),
    ('last min - anchored sit ups', 'reps'),
    ('lying leg raise', 'reps'),
    ('lying leg raises', 'reps'),
    ('mb hurricane slams', 'reps'),
    ('mb slam to down up', 'reps'),
    ('mb slams', 'reps'),
    ('mb squat jumps', 'reps'),
    ('mountain climbers', 'reps'),
    ('narrow press ups', 'reps'),
    ('neutral chin up', 'reps'),
    ('neutral grip press up', 'reps'),
    ('partner leg raise', 'reps'),
    ('plank foot taps', 'reps'),
    ('plank press up', 'reps'),
    ('press up', 'reps'),
    ('press up plus', 'reps'),
    ('press ups', 'reps'),
    ('pull up', 'reps'),
    ('reverse grip press up', 'reps'),
    ('ring dips', 'reps'),
    ('ring press up', 'reps'),
    ('shoulder taps', 'reps'),
    ('shoulder touches', 'reps'),
    ('sl hip flexor sit up', 'reps'),
    ('standing ring roll outs', 'reps'),
    ('straight leg deadbug', 'reps'),
    ('turkish sit up', 'reps'),
    ('turkish sit ups', 'reps'),
    ('turkish sit-up', 'reps'),
    ('walkout', 'reps'),
    ('walkouts', 'reps'),
    ('wall balls', 'reps'),
    ('wide pull up', 'reps');

-- 1a. The library: the default a coach gets when adding the exercise from now on.
update public.exercise_library l
set tracking_type = g.tracking
from tracking_guess_0156 g
where g.name = lower(btrim(l.name))
  and l.tracking_type = 'weight_reps';

-- 1b. Template rows (copied into members' programmes when a template is started).
update public.program_template_exercises e
set tracking_type = g.tracking
from tracking_guess_0156 g
where g.name = lower(btrim(e.name))
  and e.block_type = 'exercise'
  and e.tracking_type = 'weight_reps';

-- 1c. Members' programme rows, except those with a set already logged with reps or a weight.
update public.workout_exercises e
set tracking_type = g.tracking
from tracking_guess_0156 g
where g.name = lower(btrim(e.name))
  and e.block_type = 'exercise'
  and e.tracking_type = 'weight_reps'
  and not exists (
    select 1 from public.workout_logs l
    where l.exercise_id = e.id and (l.actual_reps is not null or l.actual_load is not null)
  );

-- 2. Block scoring: the format's default, on every row of a block where no row has a scoring yet. A block is the day plus the
-- section, block number and part (the same grouping the builder uses).
create temporary table block_defaults_0156 (format text primary key, config jsonb not null) on commit drop;

insert into block_defaults_0156 (format, config) values
    ('AMRAP', '{"scoring": "rounds_reps"}'),
    ('Partner AMRAP', '{"scoring": "rounds_reps"}'),
    ('EMOM', '{"scoring": "done"}'),
    ('Tabata', '{"scoring": "rounds", "work_seconds": 20, "rest_seconds": 10, "rounds": 8}'),
    ('Circuit', '{"scoring": "rounds"}'),
    ('Big Chipper', '{"scoring": "time"}');

update public.program_template_exercises e
set block_config = d.config
from block_defaults_0156 d
where d.format = e.block_format
  and e.block_config is null
  and not exists (
    select 1 from public.program_template_exercises o
    where o.template_day_id = e.template_day_id
      and o.section is not distinct from e.section
      and o.block_no is not distinct from e.block_no
      and o.block_part is not distinct from e.block_part
      and o.block_config is not null
  );

update public.workout_exercises e
set block_config = d.config
from block_defaults_0156 d
where d.format = e.block_format
  and e.block_config is null
  and not exists (
    select 1 from public.workout_exercises o
    where o.program_day_id = e.program_day_id
      and o.section is not distinct from e.section
      and o.block_no is not distinct from e.block_no
      and o.block_part is not distinct from e.block_part
      and o.block_config is not null
  );

commit;

-- "Would change" previews (read-only; run on their own, before applying):
--
--   with g(name) as (values ('bike'), ('run'), ('ski erg'), ('kcals'), ('prowler push'), ('plank'), ('mb slams'))  -- or the full list above
--   select e.name, e.tracking_type, count(*) from public.workout_exercises e join g on g.name = lower(btrim(e.name))
--   where e.block_type = 'exercise' and e.tracking_type = 'weight_reps' group by 1, 2 order by 3 desc;
--
--   select block_format, count(*) from public.workout_exercises
--   where block_config is null and block_format in ('AMRAP', 'Partner AMRAP', 'EMOM', 'Tabata', 'Circuit', 'Big Chipper')
--   group by 1 order by 2 desc;

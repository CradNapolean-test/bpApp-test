-- Rep-based max testing: a coach/client rarely tests a true 1RM directly, usually a 2-5 rep
-- max. Without a rep count, client_exercise_maxes couldn't distinguish a 5RM from a true 1RM,
-- so %1RM prescriptions could resolve off the wrong number if a rep-max was recorded as if it
-- were a 1RM. Default of 1 matches every existing row's implicit behavior (treated as a true
-- 1RM already) -- no backfill needed.

alter table client_exercise_maxes add column reps integer not null default 1 check (reps >= 1);

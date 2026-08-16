-- Programme days now link to classes automatically by weekday instead of a coach manually
-- keeping two arbitrary numbers in sync (see docs/FEEDBACK_NOTES.md's "Day #" clarity note --
-- this replaces that fix). workout_program_days.day_position / program_template_days.day_position
-- already exist (0024) as a bare integer "slot" -- from here on the app treats it as an actual
-- day of the week (1=Monday..6=Saturday, matching classes.day_of_week's 0=Sunday..6=Saturday
-- convention; a programme only runs Monday-Saturday, so 0/Sunday is never offered by the day
-- picker). No backfill of existing values -- same as when day_position was introduced as
-- purely additive, a coach re-sets each day's weekday once via the new picker.

-- No longer needed: a class's own day_of_week is now matched directly against a programme
-- day's day_position (see lib/utils/checkin.ts), so there's nothing left for a coach to
-- separately configure.
alter table classes drop column linked_day_position;

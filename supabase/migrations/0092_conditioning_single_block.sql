-- Conditioning can also be one 20-minute block instead of two 10-minute blocks. That is stored as
-- block_no 0 ("the whole 20 minutes"), alongside 1 and 2 for the two-block form.

alter table workout_exercises drop constraint if exists workout_exercises_block_no_check;
alter table workout_exercises add constraint workout_exercises_block_no_check check (block_no in (0, 1, 2));

alter table program_template_exercises drop constraint if exists program_template_exercises_block_no_check;
alter table program_template_exercises add constraint program_template_exercises_block_no_check check (block_no in (0, 1, 2));

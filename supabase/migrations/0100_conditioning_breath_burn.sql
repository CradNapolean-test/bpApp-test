-- Conditioning block 2 can be split into a Breath list and a Burn list (the member picks one), the same way
-- Strong block 2 splits into Upper / Lower. Stored in the same block_part column, so only the allowed values
-- change; the template copy functions already carry block_part across.

alter table workout_exercises drop constraint if exists workout_exercises_block_part_check;
alter table workout_exercises
  add constraint workout_exercises_block_part_check check (block_part in ('upper', 'lower', 'breath', 'burn'));

alter table program_template_exercises drop constraint if exists program_template_exercises_block_part_check;
alter table program_template_exercises
  add constraint program_template_exercises_block_part_check check (block_part in ('upper', 'lower', 'breath', 'burn'));

-- Free-text workout notes per day, distinct from the existing short phase_label (a label
-- like "Deload" vs. genuine free-form coach notes for the session, per PT Distinction's
-- "Workout Notes" day-menu item).
alter table workout_program_days add column notes text;
alter table program_template_days add column notes text;

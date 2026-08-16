-- Every foreign key in the schema, indexed. Confirmed via a full parse of every migration
-- file (not a guess): zero `create index` statements exist anywhere before this one, across
-- 55+ tables and ~90 foreign key columns. Postgres does NOT automatically index the
-- referencing side of a foreign key (only the referenced primary key gets one), so every
-- .eq('client_id', ...) / .eq('coach_id', ...) / .in('client_id', [...]) lookup across the
-- entire app -- which is most of them -- has been doing a full sequential table scan.
--
-- Invisible at a handful of rows; this is the real cause of "feels slow with many clients"
-- reported after the roster grew to 100+ clients (some real, mostly stress-test data) --
-- sequential scan cost grows linearly with table size, so every roster-wide coach query
-- (getClientHealthStatuses, getRosterHabitAdherence, getMyClients) and every per-client
-- dashboard load (loadDashboardBundle's ~30 queries) got proportionally slower as the
-- clients/daily_logs/bookings/etc. tables grew, regardless of query-shape correctness.
--
-- `create index if not exists` throughout -- safe to re-run, and safe even where a column is
-- already partially covered by an existing multi-column constraint elsewhere. Columns already
-- covered as the LEADING column of an existing unique constraint are deliberately skipped
-- (daily_logs.client_id, meal_sections.client_id, push_subscriptions.client_id,
-- workout_day_feedback.client_id, coach_gym_memberships.coach_id, habit_logs.habit_id,
-- form_responses.assignment_id, education_lesson_completions.lesson_id) -- Postgres serves an
-- equality lookup on a composite unique index's leading column just as well as a dedicated
-- single-column index would, so adding one there would be pure redundant write overhead.

create index if not exists idx_bookings_class_id on bookings(class_id);
create index if not exists idx_bookings_client_id on bookings(client_id);
create index if not exists idx_chat_messages_client_id on chat_messages(client_id);
create index if not exists idx_chat_messages_sender_id on chat_messages(sender_id);
create index if not exists idx_class_exceptions_cancelled_by on class_exceptions(cancelled_by);
create index if not exists idx_class_exceptions_class_id on class_exceptions(class_id);
create index if not exists idx_classes_coach_id on classes(coach_id);
create index if not exists idx_classes_gym_id on classes(gym_id);
create index if not exists idx_client_disabled_screens_client_id on client_disabled_screens(client_id);
create index if not exists idx_client_exercise_maxes_client_id on client_exercise_maxes(client_id);
create index if not exists idx_client_exercise_maxes_exercise_library_id on client_exercise_maxes(exercise_library_id);
create index if not exists idx_client_exercise_maxes_recorded_by on client_exercise_maxes(recorded_by);
create index if not exists idx_client_group_members_client_id on client_group_members(client_id);
create index if not exists idx_client_group_members_group_id on client_group_members(group_id);
create index if not exists idx_client_groups_coach_id on client_groups(coach_id);
create index if not exists idx_client_groups_gym_id on client_groups(gym_id);
create index if not exists idx_client_journal_entries_client_id on client_journal_entries(client_id);
create index if not exists idx_client_journal_entries_coach_id on client_journal_entries(coach_id);
create index if not exists idx_client_memberships_client_id on client_memberships(client_id);
create index if not exists idx_client_memberships_package_id on client_memberships(package_id);
create index if not exists idx_coach_gym_memberships_gym_id on coach_gym_memberships(gym_id);
create index if not exists idx_credit_packs_coach_id on credit_packs(coach_id);
create index if not exists idx_credit_packs_gym_id on credit_packs(gym_id);
create index if not exists idx_credits_ledger_booking_id on credits_ledger(booking_id);
create index if not exists idx_credits_ledger_client_id on credits_ledger(client_id);
create index if not exists idx_credits_ledger_granted_by on credits_ledger(granted_by);
create index if not exists idx_credits_ledger_pack_id on credits_ledger(pack_id);
create index if not exists idx_education_course_assignments_client_id on education_course_assignments(client_id);
create index if not exists idx_education_course_assignments_course_id on education_course_assignments(course_id);
create index if not exists idx_education_courses_coach_id on education_courses(coach_id);
create index if not exists idx_education_courses_gym_id on education_courses(gym_id);
create index if not exists idx_education_lesson_completions_client_id on education_lesson_completions(client_id);
create index if not exists idx_education_lessons_module_id on education_lessons(module_id);
create index if not exists idx_education_modules_course_id on education_modules(course_id);
create index if not exists idx_exercise_library_created_by on exercise_library(created_by);
create index if not exists idx_food_diary_entries_daily_log_id on food_diary_entries(daily_log_id);
create index if not exists idx_food_diary_entries_food_id on food_diary_entries(food_id);
create index if not exists idx_food_diary_entries_meal_section_id on food_diary_entries(meal_section_id);
create index if not exists idx_food_favorites_client_id on food_favorites(client_id);
create index if not exists idx_food_favorites_food_id on food_favorites(food_id);
create index if not exists idx_food_photo_entries_daily_log_id on food_photo_entries(daily_log_id);
create index if not exists idx_form_assignments_client_id on form_assignments(client_id);
create index if not exists idx_form_assignments_template_id on form_assignments(template_id);
create index if not exists idx_form_questions_template_id on form_questions(template_id);
create index if not exists idx_form_responses_question_id on form_responses(question_id);
create index if not exists idx_form_templates_coach_id on form_templates(coach_id);
create index if not exists idx_form_templates_gym_id on form_templates(gym_id);
create index if not exists idx_habits_client_id on habits(client_id);
create index if not exists idx_manual_macro_entries_daily_log_id on manual_macro_entries(daily_log_id);
create index if not exists idx_manual_macro_entries_meal_section_id on manual_macro_entries(meal_section_id);
create index if not exists idx_meal_plan_entries_client_id on meal_plan_entries(client_id);
create index if not exists idx_meal_plan_entries_food_id on meal_plan_entries(food_id);
create index if not exists idx_measurement_logs_client_id on measurement_logs(client_id);
create index if not exists idx_membership_packages_coach_id on membership_packages(coach_id);
create index if not exists idx_membership_packages_gym_id on membership_packages(gym_id);
create index if not exists idx_notifications_client_id on notifications(client_id);
create index if not exists idx_profiles_coach_id on profiles(coach_id);
create index if not exists idx_profiles_gym_id on profiles(gym_id);
create index if not exists idx_program_template_days_template_id on program_template_days(template_id);
create index if not exists idx_program_template_exercises_exercise_library_id on program_template_exercises(exercise_library_id);
create index if not exists idx_program_template_exercises_template_day_id on program_template_exercises(template_day_id);
create index if not exists idx_program_templates_coach_id on program_templates(coach_id);
create index if not exists idx_program_templates_gym_id on program_templates(gym_id);
create index if not exists idx_progress_photos_client_id on progress_photos(client_id);
create index if not exists idx_recipe_ingredients_food_id on recipe_ingredients(food_id);
create index if not exists idx_recipe_ingredients_recipe_id on recipe_ingredients(recipe_id);
create index if not exists idx_recipes_client_id on recipes(client_id);
create index if not exists idx_scheduled_communications_coach_id on scheduled_communications(coach_id);
create index if not exists idx_scheduled_communications_gym_id on scheduled_communications(gym_id);
create index if not exists idx_scheduled_communications_target_group_id on scheduled_communications(target_group_id);
create index if not exists idx_workout_day_feedback_program_day_id on workout_day_feedback(program_day_id);
create index if not exists idx_workout_exercises_exercise_library_id on workout_exercises(exercise_library_id);
create index if not exists idx_workout_exercises_program_day_id on workout_exercises(program_day_id);
create index if not exists idx_workout_logs_client_id on workout_logs(client_id);
create index if not exists idx_workout_logs_exercise_id on workout_logs(exercise_id);
create index if not exists idx_workout_logs_exercise_library_id on workout_logs(exercise_library_id);
create index if not exists idx_workout_program_days_program_id on workout_program_days(program_id);
create index if not exists idx_workout_programs_client_id on workout_programs(client_id);

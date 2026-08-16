-- Read-only cross-coach client visibility: any coach can now search/view (never edit) a
-- client belonging to another coach at the same gym, via is_same_gym_as_client() (0052). This
-- purely ADDS a second permissive select policy alongside each table's existing
-- owns_client(client_id) policy -- Postgres OR's multiple permissive policies for the same
-- command together, so every existing write policy (is_coach_of-gated `for all`/insert/update)
-- is untouched; only the assigned coach can still mutate a client's data.
--
-- `profiles` itself already got its gym-wide read policies in 0052 (its client-id column is
-- `id`, not `client_id`, so it doesn't fit the loop below).
--
-- Known gap, deliberately out of scope here: storage bucket policies (progress-photos,
-- chat voice notes, food-photo-diary) still gate on owns_client() at the path level, so a
-- cross-coach viewer won't see another coach's client's uploaded photos/audio yet even though
-- the surrounding DB rows are now visible. Revisit if that turns out to matter in practice.

-- ============ Tables with a direct client_id column ============
do $$
declare
  t text;
  direct_tables text[] := array[
    'client_profiles', 'daily_logs', 'meal_plan_entries', 'progress_photos', 'bookings',
    'credits_ledger', 'chat_messages', 'chat_threads', 'workout_programs', 'workout_logs',
    'client_memberships', 'measurement_logs', 'habits', 'notifications', 'meal_sections',
    'recipes', 'client_exercise_maxes', 'workout_day_feedback', 'education_course_assignments',
    'education_lesson_completions', 'form_assignments', 'client_disabled_screens',
    'food_favorites', 'client_journal_entries'
  ];
begin
  foreach t in array direct_tables loop
    execute format(
      'create policy %I on %I for select using (public.is_same_gym_as_client(client_id))',
      'same-gym coach reads ' || t, t
    );
  end loop;
end $$;

-- ============ Join-only tables (no direct client_id column) ============
-- Mirrors each table's existing owns_client(...) select policy shape exactly, swapping in
-- is_same_gym_as_client(...).

create policy "same-gym coach reads food_diary_entries"
  on food_diary_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_diary_entries.daily_log_id
      and public.is_same_gym_as_client(daily_logs.client_id)
    )
  );

create policy "same-gym coach reads manual_macro_entries"
  on manual_macro_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = manual_macro_entries.daily_log_id
      and public.is_same_gym_as_client(daily_logs.client_id)
    )
  );

create policy "same-gym coach reads food_photo_entries"
  on food_photo_entries for select
  using (
    exists (
      select 1 from daily_logs
      where daily_logs.id = food_photo_entries.daily_log_id
      and public.is_same_gym_as_client(daily_logs.client_id)
    )
  );

create policy "same-gym coach reads workout_program_days"
  on workout_program_days for select
  using (
    exists (
      select 1 from workout_programs
      where workout_programs.id = workout_program_days.program_id
      and public.is_same_gym_as_client(workout_programs.client_id)
    )
  );

create policy "same-gym coach reads workout_exercises"
  on workout_exercises for select
  using (
    exists (
      select 1 from workout_program_days
      join workout_programs on workout_programs.id = workout_program_days.program_id
      where workout_program_days.id = workout_exercises.program_day_id
      and public.is_same_gym_as_client(workout_programs.client_id)
    )
  );

create policy "same-gym coach reads recipe_ingredients"
  on recipe_ingredients for select
  using (
    exists (
      select 1 from recipes
      where recipes.id = recipe_ingredients.recipe_id
      and public.is_same_gym_as_client(recipes.client_id)
    )
  );

create policy "same-gym coach reads habit_logs"
  on habit_logs for select
  using (
    exists (
      select 1 from habits
      where habits.id = habit_logs.habit_id
      and public.is_same_gym_as_client(habits.client_id)
    )
  );

create policy "same-gym coach reads form_responses"
  on form_responses for select
  using (
    exists (
      select 1 from form_assignments
      where form_assignments.id = form_responses.assignment_id
      and public.is_same_gym_as_client(form_assignments.client_id)
    )
  );

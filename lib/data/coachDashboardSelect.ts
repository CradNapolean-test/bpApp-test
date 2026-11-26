import { FOLLOW_UP_RELATIONS } from './followUps';

// The coach dashboard's members read (getCoachDashboard in lib/data/coachDashboard.ts). It lives here, outside that 'use server' module,
// so coachDashboardSelect.test.ts can check it against what the dashboard reads from each row: the rows are cast to MemberRow, so the
// type checker never compares the two, and a column dropped here would quietly read as empty.

// Only the columns the lists read (item 9): a day's photos come as a count, not a row each, and the bookings are filtered to
// still-booked ones without carrying the status. Checked against the full select on the live project: the same facts, 16% fewer bytes.
export const MEMBERS_SELECT = `
  id, email, coach_id, created_at,
  client_profiles(name, nutrition_tracking_mode, onboarding_completed_at, needs_coach_review, review_reasons, checkin_reminder_days, checkin_reminders_stopped_at),
  client_memberships!client_id(id, started_at, scheduled_end, ended_at, membership_packages(credits_per_week, duration_weeks, name)),
  daily_logs(log_date, calories, protein, carbs, fat, fibre, water, bodyweight, steps, sleep, gym_session, hunger, energy, motivation, stress, period_started, notes, food_photo_entries(count)),
  nutrition_feedback!client_id(log_date),
  coach_reviews!client_id(kind, ref),
  form_assignments!client_id(id, completed_at, form_templates(name)),
  bookings!client_id(booking_date, attended, no_show, class:classes(start_time)),
  big_dog_results!client_id(exercise_key, self_reported, result_text, result_value, created_at),
  workout_programs(id, name, start_date, week_one, workout_program_days(week_num)),
  ${FOLLOW_UP_RELATIONS}
`;

// Before migration 0166 there is no checkin_reminders_stopped_at: the dashboard loads without the "Reminders unanswered" To do.
export const MEMBERS_SELECT_BEFORE_0166 = MEMBERS_SELECT.replace(', checkin_reminders_stopped_at', '');

// Without migration 0087 (reviewed markers) the dashboard still loads, just with nothing marked reviewed.
export const MEMBERS_SELECT_BEFORE_0087 = MEMBERS_SELECT_BEFORE_0166.replace('coach_reviews!client_id(kind, ref),', '');

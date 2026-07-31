export interface ClientProfileRow {
  client_id: string;
  name: string;
  gender: string | null;
  goal_description: string | null;
  experience: string | null;
  age: number | null;
  body_fat_pct: number | null;
  start_weight: number;
  goal_weight: number;
  activity_level: number;
  diet_approach: 'High Carb Low Fat' | 'Higher Fat';
  tier: 1 | 2 | 3;
  cycling: boolean;
  meas_arm_start: number | null; meas_arm_goal: number | null;
  meas_chest_start: number | null; meas_chest_goal: number | null;
  meas_waist_start: number | null; meas_waist_goal: number | null;
  meas_hips_start: number | null; meas_hips_goal: number | null;
  meas_quad_start: number | null; meas_quad_goal: number | null;
  lift_db_press_start: number | null; lift_db_press_goal: number | null;
  lift_squats_start: number | null; lift_squats_goal: number | null;
  lift_pull_ups_start: number | null; lift_pull_ups_goal: number | null;
  lift_rdl_start: number | null; lift_rdl_goal: number | null;
  lift_hip_thrust_start: number | null; lift_hip_thrust_goal: number | null;
  checkin_reminder_days: number;
  last_checkin_reminder_at: string | null;
}

export interface DailyLogRow {
  id: string;
  client_id: string;
  log_date: string;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  water: number | null;
  bodyweight: number | null;
  steps: number | null;
  sleep: number | null;
  gym_session: boolean;
  day_type: 'flat' | 'low' | 'high';
  hunger: number | null;
  energy: number | null;
  motivation: number | null;
  stress: number | null;
  period_started: boolean;
  notes: string | null;
}

export interface FoodRow {
  id: string;
  name: string;
  portion: string | null;
  protein: number;
  carbs: number;
  fat: number;
  barcode: string | null;
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  food_id: string | null;
  portions: number;
  food: FoodRow | null;
}

export interface RecipeRow {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
}

export interface RecipeWithIngredients extends RecipeRow {
  recipe_ingredients: RecipeIngredientRow[];
}

export interface FoodDiaryEntryRow {
  id: string;
  daily_log_id: string;
  food_id: string | null;
  portions: number;
  food: FoodRow | null;
}

export interface MealPlanEntryRow {
  id: string;
  client_id: string;
  section: MealPlanSection;
  food_id: string | null;
  portions: number;
  food: FoodRow | null;
}

export type MealPlanSection =
  | 'breakfast'
  | 'mid_morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'evening_snack';

export interface ActivityRow {
  id: string;
  name: string;
  met: number;
}

export interface ChatMessageRow {
  id: string;
  client_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

export interface ChatOverviewRow {
  client_id: string;
  client_name: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
}

export interface ClassRow {
  id: string;
  coach_id: string;
  name: string;
  day_of_week: number | null;
  start_time: string | null;
  capacity: number;
  coach_note: string | null;
  cutoff_hours: number;
  credit_cost: number;
}

export type BookingStatus = 'booked' | 'waitlist' | 'cancelled';

export interface BookingRow {
  id: string;
  class_id: string;
  client_id: string;
  booking_date: string;
  status: BookingStatus;
  created_at: string;
  attended: boolean;
  attended_at: string | null;
  class: ClassRow | null;
}

export interface CreditsLedgerRow {
  id: string;
  client_id: string;
  delta: number;
  reason: string;
  granted_by: string | null;
  created_at: string;
}

export type BlockType = 'exercise' | 'circuit';
export type PrescriptionType = 'absolute' | 'percent_1rm';
export type SetType = 'working' | 'warmup' | 'failure' | 'drop';

// Shared shape between a live workout_exercises row and a program_template_exercises row --
// identical except for the parent-day FK name and the two progression fields, which are
// template-only (a live program's per-week rows are already materialized, no ongoing rule).
export interface ExerciseCoreFields {
  exercise_library_id: string | null;
  name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  rpe: number | null;
  notes: string | null;
  video_url: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  sort_order: number;
  block_type: BlockType;
  prescription_type: PrescriptionType;
  percent_1rm: number | null;
}

export interface WorkoutExerciseRow extends ExerciseCoreFields {
  id: string;
  program_day_id: string;
}

export interface WorkoutProgramDayRow {
  id: string;
  program_id: string;
  week_num: number;
  day_label: string;
  sort_order: number;
  phase_label: string | null;
  workout_exercises: WorkoutExerciseRow[];
}

export interface WorkoutProgramRow {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
  workout_program_days: WorkoutProgramDayRow[];
}

export interface WorkoutLogRow {
  id: string;
  client_id: string;
  exercise_id: string | null;
  exercise_library_id: string | null;
  set_number: number | null;
  actual_reps: number | null;
  actual_load: number | null;
  actual_rpe: number | null;
  set_type: SetType;
  logged_at: string;
}

export interface ClientExerciseMaxRow {
  id: string;
  client_id: string;
  exercise_library_id: string;
  tested_max: number;
  is_estimated: boolean;
  tested_date: string;
  recorded_by: string | null;
  created_at: string;
}

export interface WorkoutDayFeedbackRow {
  id: string;
  client_id: string;
  program_day_id: string;
  feedback_date: string;
  session_rpe: number | null;
  notes: string | null;
  created_at: string;
}

export interface ExerciseLibraryRow {
  id: string;
  name: string;
  default_sets: number | null;
  default_reps: string | null;
  default_rpe: number | null;
  video_url: string | null;
  notes: string | null;
  muscle_group: string | null;
  equipment: string | null;
  instructions: string | null;
  image_url: string | null;
  default_rest_seconds: number | null;
  created_by: string | null;
  created_at: string;
}

export interface ProgramTemplateExerciseRow extends ExerciseCoreFields {
  id: string;
  template_day_id: string;
  progression_load_increment: number | null;
  progression_every_weeks: number;
}

export interface ProgramTemplateDayRow {
  id: string;
  template_id: string;
  week_num: number;
  day_label: string;
  sort_order: number;
  phase_label: string | null;
  program_template_exercises: ProgramTemplateExerciseRow[];
}

export interface ProgramTemplateRow {
  id: string;
  coach_id: string;
  name: string;
  created_at: string;
}

export interface ProgramTemplateWithDays extends ProgramTemplateRow {
  program_template_days: ProgramTemplateDayRow[];
}

export interface ProgressPhotoRow {
  id: string;
  client_id: string;
  photo_date: string;
  storage_path: string;
  created_at: string;
}

export interface ProgressPhoto extends ProgressPhotoRow {
  signedUrl: string | null;
}

export interface MeasurementLogRow {
  id: string;
  client_id: string;
  log_date: string;
  arm: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  quad: number | null;
  created_at: string;
}

export interface HabitRow {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
}

export interface HabitLogRow {
  id: string;
  habit_id: string;
  log_date: string;
  completed: boolean;
  created_at: string;
}

export interface HabitWithLogs extends HabitRow {
  logs: HabitLogRow[];
}

export interface NotificationRow {
  id: string;
  client_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

export interface CoachReport {
  attendanceRate: number | null; // 0-100, null if no data
  totalBooked: number;
  totalAttended: number;
  noShows: { clientName: string; className: string; date: string }[];
  classPopularity: { className: string; bookingCount: number }[];
}

export interface MembershipPackageRow {
  id: string;
  coach_id: string;
  name: string;
  credits_per_week: number;
  description: string | null;
  created_at: string;
}

export interface ClientMembershipRow {
  id: string;
  client_id: string;
  package_id: string;
  started_at: string;
  ended_at: string | null;
  last_reset_week: string | null;
  created_at: string;
  package: MembershipPackageRow | null;
}

export interface ScheduleOccurrence {
  classId: string;
  className: string;
  date: string;
  startTime: string | null;
  capacity: number;
  creditCost: number;
  bookedCount: number;
}

export interface RosterEntry {
  bookingId: string;
  clientId: string;
  clientName: string;
  status: BookingStatus;
  attended: boolean;
}

export type FormQuestionType = 'short_text' | 'long_text' | 'number' | 'single_choice' | 'multi_choice';

export interface FormTemplateRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  is_default_onboarding: boolean;
  created_at: string;
}

export interface FormQuestionRow {
  id: string;
  template_id: string;
  order_index: number;
  question_text: string;
  question_type: FormQuestionType;
  options: string[] | null;
  required: boolean;
}

export interface FormTemplateWithQuestions extends FormTemplateRow {
  questions: FormQuestionRow[];
}

export interface FormAssignmentRow {
  id: string;
  template_id: string;
  client_id: string;
  assigned_at: string;
  completed_at: string | null;
}

export interface FormResponseRow {
  id: string;
  assignment_id: string;
  question_id: string;
  answer: unknown;
}

export interface FormAssignmentWithDetails extends FormAssignmentRow {
  template: FormTemplateWithQuestions;
  responses: FormResponseRow[];
}

export interface EducationContentRow {
  id: string;
  coach_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
}

export interface EducationAssignmentRow {
  id: string;
  content_id: string;
  client_id: string;
  assigned_at: string;
  completed_at: string | null;
}

export interface EducationAssignmentWithContent extends EducationAssignmentRow {
  content: EducationContentRow;
}

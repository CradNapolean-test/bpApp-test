import type { ClientProfileRow } from './types';

// The columns a member's phone reads from their own client_profiles row: every column of ClientProfileRow. The phone asks for these by
// name rather than '*' so a column added later is never downloaded and saved in the on-device cache by accident. (The coach's private
// notes used to be a column here; since migration 0124 they live in client_coach_notes, which a member cannot read.)
export const MEMBER_PROFILE_COLUMNS = [
  'client_id',
  'name',
  'gender',
  'goal_description',
  'experience',
  'age',
  'body_fat_pct',
  'start_weight',
  'goal_weight',
  'activity_level',
  'diet_approach',
  'tier',
  'cycling',
  'meas_arm_start', 'meas_arm_goal',
  'meas_chest_start', 'meas_chest_goal',
  'meas_waist_start', 'meas_waist_goal',
  'meas_hips_start', 'meas_hips_goal',
  'meas_quad_start', 'meas_quad_goal',
  'lift_db_press_start', 'lift_db_press_goal',
  'lift_squats_start', 'lift_squats_goal',
  'lift_pull_ups_start', 'lift_pull_ups_goal',
  'lift_rdl_start', 'lift_rdl_goal',
  'lift_hip_thrust_start', 'lift_hip_thrust_goal',
  'checkin_reminder_days',
  'last_checkin_reminder_at',
  'notifications_enabled',
  'email_notifications_enabled',
  'nutrition_tracking_mode',
  'timezone',
  'minutes_per_1000_steps',
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
  'address',
  'date_of_birth',
  'join_date',
  'referral_source',
  'deletion_requested_at',
  'height_cm',
  'body_fat_estimated',
  'health_notes',
  'onboarding_completed_at',
  'needs_coach_review',
  'review_reasons',
  'nutrition_goal',
  'nutrition_setting',
  'details_confirm_requested_at',
  'consented_at',
  'custom_calories',
  'custom_protein',
  'custom_carbs',
  'custom_fat',
  'custom_targets_locked',
] as const satisfies readonly (keyof ClientProfileRow)[];

// Compile-time check: if a column is added to ClientProfileRow it must be listed above (or named here as deliberately left out),
// otherwise this line stops compiling. Nothing is left out now: the coach's private notes moved to client_coach_notes (0124).
type LeftOut = never;
type Unlisted = Exclude<keyof ClientProfileRow, (typeof MEMBER_PROFILE_COLUMNS)[number] | LeftOut>;
const everyColumnAccountedFor: [Unlisted] extends [never] ? true : never = true;
void everyColumnAccountedFor;

export const MEMBER_PROFILE_SELECT: string = MEMBER_PROFILE_COLUMNS.join(', ');

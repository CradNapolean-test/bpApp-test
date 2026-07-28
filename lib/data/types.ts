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

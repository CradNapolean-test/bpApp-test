import { CALORIE_FLOOR, calcEngine, weeklyTarget } from './calculations';

// Plain-English activity levels mapped onto the engine's activity multiplier.
export const ACTIVITY_OPTIONS = [
  { value: 1.2, label: 'Mostly seated', hint: 'Desk job, little walking' },
  { value: 1.35, label: 'Lightly active', hint: 'On your feet some of the day' },
  { value: 1.5, label: 'Moderately active', hint: 'Active job or regular exercise' },
  { value: 1.75, label: 'Very active', hint: 'Physical job plus regular training' },
] as const;

export const TRACKING_OPTIONS = [
  {
    value: 'full_tracking',
    label: 'Track every food',
    hint: 'Search or scan foods and log each meal. Most accurate.',
    recommended: true,
  },
  {
    value: 'manual_import',
    label: 'Type in my totals',
    hint: 'Already use another app? Just enter your daily calories and macros.',
    recommended: false,
  },
  {
    value: 'photo_diary',
    label: 'Photo diary',
    hint: 'Snap your meals and add a short description. Your coach reviews them.',
    recommended: false,
  },
] as const;

export type TrackingMode = (typeof TRACKING_OPTIONS)[number]['value'];

export function ageFromDob(dob: string, today: Date = new Date()): number | null {
  const d = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

// Deurenberg: a rough body-fat estimate from BMI, age and sex, used only when a new member does
// not know their body fat. Always flagged as an estimate for the coach to confirm (e.g. InBody).
export function estimateBodyFat(heightCm: number, weightKg: number, age: number, gender: 'Male' | 'Female'): number {
  const bmi = weightKg / (heightCm / 100) ** 2;
  const bf = 1.2 * bmi + 0.23 * age - 10.8 * (gender === 'Male' ? 1 : 0) - 5.4;
  return Math.round(Math.min(55, Math.max(5, bf)) * 10) / 10;
}

export interface OnboardingInputs {
  gender: 'Male' | 'Female';
  age: number;
  startWeight: number;
  goalWeight: number;
  heightCm: number;
  activityLevel: number;
  bodyFatPct: number | null;
  hasHealthNotes: boolean;
}

export interface OnboardingPlan {
  bodyFatPct: number;
  bodyFatEstimated: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  reasons: string[];
}

// The starting plan shown at the end of onboarding: engine defaults (high carb/low fat, tier 1, no
// cycling) and the reasons a coach should look at it. Returns null if the inputs can't be
// calculated. Every new member is flagged for review; these reasons say what to look at.
export function buildOnboardingPlan(input: OnboardingInputs): OnboardingPlan | null {
  const estimated = input.bodyFatPct == null;
  const bodyFatPct = input.bodyFatPct ?? estimateBodyFat(input.heightCm, input.startWeight, input.age, input.gender);
  const profile = {
    age: input.age,
    gender: input.gender,
    startWeight: input.startWeight,
    goalWeight: input.goalWeight,
    bodyFatPct,
    activityLevel: input.activityLevel,
    dietApproach: 'High Carb Low Fat' as const,
    tier: 1 as const,
    cycling: false,
  };
  if (!calcEngine(profile)) return null;
  const week1 = weeklyTarget(profile, 1);
  if (!week1) return null;

  const calories = Math.round(week1.calories / 7);
  const reasons: string[] = ['New member: check the starting plan'];
  if (estimated) reasons.push('Body fat was estimated, not measured');
  if (calories < CALORIE_FLOOR) reasons.push(`Daily target is under ${CALORIE_FLOOR} kcal`);
  if (input.goalWeight >= input.startWeight) reasons.push('Goal weight is not below start weight');
  if (input.startWeight - input.goalWeight > 25) reasons.push('Large weight-loss goal (over 25kg)');
  if (input.age < 18) reasons.push('Under 18');
  if (input.hasHealthNotes) reasons.push('Health or injury notes added');
  reasons.push('Membership may need setting up');

  return {
    bodyFatPct,
    bodyFatEstimated: estimated,
    calories,
    protein: Math.round(week1.protein / 7),
    carbs: Math.round(week1.carbs / 7),
    fat: Math.round(week1.fat / 7),
    reasons,
  };
}

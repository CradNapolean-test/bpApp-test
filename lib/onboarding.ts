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

// ---- who can sign up, and who sees a calorie target (M8) ----
// D18 (recommended default): 16 is the youngest the app will set up on its own; younger members are set up by their coach. The calorie
// engine is for adults, and the sign-up used to take anyone from 10. Change the number here to change the rule everywhere.
export const MIN_AGE = 16;
export const MAX_AGE = 100;
export const UNDER_MIN_AGE_MESSAGE = 'Please ask your coach to set up your account.';

// null when the age is fine; otherwise what to tell the person.
export function ageProblem(age: number | null): string | null {
  if (age == null || age < 0 || age > MAX_AGE) return 'Please check your date of birth.';
  if (age < MIN_AGE) return UNDER_MIN_AGE_MESSAGE;
  return null;
}

// The activity choice has to be one of the offered levels, not any number the browser sends.
export function isActivityLevel(value: number): boolean {
  return ACTIVITY_OPTIONS.some((o) => o.value === value);
}

// Below this BMI a weight-loss target is a clinical question, not a coaching one.
export const BMI_FLOOR = 18.5;
export const bmiOf = (heightCm: number, weightKg: number): number => weightKg / (heightCm / 100) ** 2;

// D6 (recommended default: hold back). A member whose plan is still waiting for their coach (needs_coach_review) is not shown a calorie
// or macro target yet: the starting numbers come straight from a formula and nobody has looked at them. The coach, and the member once
// the coach has marked the plan reviewed, see them as usual. To show targets straight away instead, make this return false.
export function targetsHeldBack(profile: { needs_coach_review?: boolean | null } | null | undefined, isCoachView: boolean): boolean {
  return !isCoachView && profile?.needs_coach_review === true;
}

export const PLAN_BEING_SET_UP = 'Your coach is setting up your plan';

// Shown in place of the targets when there are none and the plan is not simply waiting for review (details missing, so nothing to
// calculate from). A member can type in their own (migration 0146), or their coach can add them.
export const NO_TARGETS_YET = 'No daily targets are set for you yet. Set your own below, or message your coach and they will add them.';

// OB3: the short flow is for existing members confirming details, and never asked for height or weights, so a member whose profile has
// none finished it with nothing to build a plan from. They are asked for what is missing.
export function needsBodyStep(existing: { height_cm?: number | null; start_weight?: number | null; goal_weight?: number | null } | null): boolean {
  if (!existing) return false;
  const missing = (n: number | null | undefined) => !(typeof n === 'number' && n > 0);
  return missing(existing.height_cm) || missing(existing.start_weight) || missing(existing.goal_weight);
}

// True when a database error says a column does not exist (the migration that adds it has not been applied yet). Lets a save that also
// records something new keep working until then, instead of every new member being unable to finish onboarding.
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return (error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find/i.test(message)) && message.includes(column);
}

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

// The starting plan shown at the end of onboarding: engine defaults (high carb/low fat, fat loss, steady, no
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
    goal: 'fat_loss' as const,
    setting: 'steady' as const,
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
  if (bmiOf(input.heightCm, input.startWeight) < BMI_FLOOR) reasons.push(`Starting BMI is under ${BMI_FLOOR}`);
  else if (bmiOf(input.heightCm, input.goalWeight) < BMI_FLOOR) reasons.push(`Goal weight would give a BMI under ${BMI_FLOOR}`);
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

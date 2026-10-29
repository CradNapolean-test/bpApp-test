// Ballistic Performance — calculation engine
// Maintenance is a lean mass + fat mass BMR x activity (ported from a validated prototype). The calorie
// change and macro split follow the Muscle & Strength Nutrition Pyramid and the gym's nutrition SOP
// (docs/SOPS.md section 4): a goal (fat loss or muscle gain) and a setting (steady, moderate,
// aggressive) set the rate of weight change, which sets the daily calories; protein, fat (a share of
// calories) and carbs (the remainder, with minimums) fill them.

export type NutritionGoal = 'fat_loss' | 'muscle_gain';
export type NutritionSetting = 'steady' | 'moderate' | 'aggressive';

export interface ClientProfile {
  age: number;
  gender: 'Male' | 'Female';
  startWeight: number;
  goalWeight: number;
  bodyFatPct: number;
  activityLevel: number;
  dietApproach: 'High Carb Low Fat' | 'Higher Fat';
  goal: NutritionGoal;
  setting: NutritionSetting;
  cycling: boolean;
  // A daily target typed in by the member or their coach. When present it is the target on every day, instead of the calculation.
  customTarget?: CustomTarget;
}

export interface CustomTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface EngineResult {
  bmr: number;
  tdee: number;
  protein: number; // grams/day
  fatPct: number; // share of daily calories from fat (0-1)
  fatMin: number; // grams/day floor
  carbMin: number; // grams/day floor
}

export interface DayTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  floorApplied: boolean; // calories were raised so fat and carbs stay above their minimums
}

export interface WeeklyTarget {
  phase: 1 | 2 | 3;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  floorApplied: boolean;
  dailyFlat?: DayTarget;
  dailyLow?: DayTarget;
  dailyHigh?: DayTarget;
}

// Rate of weight change per setting, as a share of bodyweight. Fat loss is per week (Pyramid:
// 0.5-1%); muscle gain is per month (Pyramid: 0.5-1.5%, slower the more advanced the lifter).
export const RATE_PCT: Record<NutritionGoal, Record<NutritionSetting, number>> = {
  fat_loss: { steady: 0.005, moderate: 0.0075, aggressive: 0.01 }, // per week
  muscle_gain: { steady: 0.005, moderate: 0.01, aggressive: 0.015 }, // per month
};

// 3,500 kcal per lb of bodyweight change (the Pyramid's rule), expressed per kg.
const KCAL_PER_KG = 3500 * 2.2046;

// Daily calories above (+) or below (-) maintenance for a goal and setting at a bodyweight.
export function dailyAdjustment(goal: NutritionGoal, setting: NutritionSetting, weightKg: number): number {
  const kgChange = weightKg * RATE_PCT[goal][setting];
  return goal === 'fat_loss' ? (-kgChange * KCAL_PER_KG) / 7 : (kgChange * KCAL_PER_KG) / 30;
}

// Calorie cycling: 5 lower days and 2 higher days around the flat target, averaging back to it.
const CYCLE_LOW_OFFSET = -200;
const CYCLE_HIGH_OFFSET = 500;

export function phaseForWeek(week: number): 1 | 2 | 3 {
  return week <= 4 ? 1 : week <= 8 ? 2 : 3;
}

// The daily step goal every client is coached towards. The Activity swap screen starts from this.
export const STANDARD_STEP_TARGET = 8000;

// Step target schedule (Program Overview tab equivalent) -- the old week-by-week ramp, no longer
// used by the app (kept because it is covered by the validated test suite and the demo seed).
export function stepTargetForWeek(week: number): number {
  if (week <= 1) return 10000;
  if (week <= 6) return 12000;
  return 13000;
}

// BMR from lean mass and fat mass (so body fat % must be known), with a male offset and an age term:
// 13.587 x lean + 9.613 x fat + 198 (male) - 3.351 x age + 674. This is not the classic Katch-McArdle
// (370 + 21.6 x lean mass); it is the equation from the validated spreadsheet. TDEE = BMR * activity
// level multiplier.
// Fat as a share of calories. 'High Carb Low Fat' sits mid-range for the goal (Pyramid: 15-25% when
// cutting, 20-30% when gaining); 'Higher Fat' goes toward the 40% ceiling for people who do better on
// lower carb.
const FAT_PCT: Record<NutritionGoal, Record<ClientProfile['dietApproach'], number>> = {
  fat_loss: { 'High Carb Low Fat': 0.2, 'Higher Fat': 0.35 },
  muscle_gain: { 'High Carb Low Fat': 0.25, 'Higher Fat': 0.35 },
};
const PROTEIN_PER_KG_GAINING = 2.2; // the gym SOP's gaining example
const FAT_MIN_PER_KG = 0.5;
const CARB_MIN_PER_KG = 1;

export function calcEngine(profile: ClientProfile): EngineResult | null {
  const { age, gender, startWeight, goalWeight, bodyFatPct, activityLevel, dietApproach, goal } = profile;
  if (!age || !startWeight || !goalWeight || !bodyFatPct || !activityLevel) return null;

  const fatMass = startWeight * (bodyFatPct / 100);
  const leanMass = startWeight - fatMass;
  const bmr = 13.587 * leanMass + 9.613 * fatMass + (gender === 'Male' ? 198 : 0) - 3.351 * age + 674;
  const tdee = bmr * activityLevel;

  const gap = startWeight - goalWeight;
  const proteinPerKg =
    goal === 'muscle_gain' ? PROTEIN_PER_KG_GAINING : gap <= 5 ? 2.2 : gap <= 8 ? 2.0 : gap <= 12 ? 1.8 : 1.6;

  return {
    bmr,
    tdee,
    protein: startWeight * proteinPerKg,
    fatPct: FAT_PCT[goal][dietApproach],
    fatMin: startWeight * FAT_MIN_PER_KG,
    carbMin: startWeight * CARB_MIN_PER_KG,
  };
}

// Protein, fat and carbs for one day at a given calorie target. Protein is fixed, fat is a share of
// calories, carbs are what is left. If that leaves fat or carbs under their minimums, calories are
// raised to meet them (the Pyramid prefers a slower loss to starving fat and carbs) and
// floorApplied is set so the coach can see it.
function dayMacros(engine: EngineResult, targetCals: number): DayTarget {
  const { protein, fatPct, fatMin, carbMin } = engine;
  const fatFromPct = (targetCals * fatPct) / 9;
  const fat = Math.max(fatFromPct, fatMin);
  const carbs = (targetCals - protein * 4 - fat * 9) / 4;
  if (carbs >= carbMin) return { calories: targetCals, protein, fat, carbs, floorApplied: fatMin > fatFromPct };
  return { calories: protein * 4 + fat * 9 + carbMin * 4, protein, fat, carbs: carbMin, floorApplied: true };
}

// Full weekly target for a given profile + week number (1-12). The rate of change is the same every
// week; the week only picks the phase label.
export function weeklyTarget(profile: ClientProfile, week: number): WeeklyTarget | null {
  if (profile.customTarget) {
    // A target the person typed in: the same every day, with no minimums applied to it.
    const flat: DayTarget = { ...profile.customTarget, floorApplied: false };
    return {
      phase: phaseForWeek(week),
      calories: flat.calories * 7,
      protein: flat.protein * 7,
      fat: flat.fat * 7,
      carbs: flat.carbs * 7,
      floorApplied: false,
      dailyFlat: flat,
    };
  }
  const engine = calcEngine(profile);
  if (!engine) return null;
  const base = engine.tdee + dailyAdjustment(profile.goal, profile.setting, profile.startWeight);
  const phase = phaseForWeek(week);

  if (profile.cycling) {
    const low = dayMacros(engine, Math.max(base + CYCLE_LOW_OFFSET, 0));
    const high = dayMacros(engine, Math.max(base + CYCLE_HIGH_OFFSET, 0));
    return {
      phase,
      calories: low.calories * 5 + high.calories * 2,
      protein: engine.protein * 7,
      fat: low.fat * 5 + high.fat * 2,
      carbs: low.carbs * 5 + high.carbs * 2,
      floorApplied: low.floorApplied || high.floorApplied,
      dailyLow: low,
      dailyHigh: high,
    };
  }

  const flat = dayMacros(engine, Math.max(base, 0));
  return {
    phase,
    calories: flat.calories * 7,
    protein: flat.protein * 7,
    fat: flat.fat * 7,
    carbs: flat.carbs * 7,
    floorApplied: flat.floorApplied,
    dailyFlat: flat,
  };
}

// General floor warning — not medical advice, just a "this is worth a coach review" flag.
export const CALORIE_FLOOR = 1200;

// Calories are always derived from logged macros, never entered directly.
export function dayCalories(protein: number, carbs: number, fat: number): number {
  return (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
}

// Cycle-day calculation: counts forward from the most recent "period started" date.
export function cycleDayFor(periodStartDates: string[], targetDate: string): number | null {
  const priorStarts = periodStartDates.filter((d) => d <= targetDate).sort();
  if (priorStarts.length === 0) return null;
  const start = new Date(priorStarts[priorStarts.length - 1]);
  const target = new Date(targetDate);
  return Math.round((target.getTime() - start.getTime()) / 86400000) + 1;
}

// MET-based activity swap: calories/min = 0.0175 * MET * bodyweight(kg)
export function calPerMinute(met: number, bodyWeightKg: number): number {
  return 0.0175 * met * bodyWeightKg;
}

export function equivalentMinutesForActivity(
  targetSteps: number,
  minutesPer1000Steps: number,
  bodyWeightKg: number,
  activityMet: number
): number {
  const WALKING_MET = 3.0;
  const targetCalories = calPerMinute(WALKING_MET, bodyWeightKg) * minutesPer1000Steps * (targetSteps / 1000);
  const cpm = calPerMinute(activityMet, bodyWeightKg);
  return cpm > 0 ? targetCalories / cpm : 0;
}

// Adaptive TDEE: real-world maintenance estimate from logged intake vs. actual weight change.
// kcal-per-kg constant (7700) is a standard approximation, not exact for every individual.
export function estimateAdaptiveTdee(
  avgLoggedCalories: number,
  weightChangeKg: number,
  spanDays: number
): number {
  const KCAL_PER_KG = 7700;
  const dailyDelta = (weightChangeKg * KCAL_PER_KG) / (spanDays || 1);
  return avgLoggedCalories - dailyDelta;
}

// Plateau check: true if bodyweight barely moved across the given window.
export function isPlateaued(bodyweightSeries: number[], thresholdKg = 0.3): boolean {
  if (bodyweightSeries.length < 6) return false;
  return Math.abs(bodyweightSeries[bodyweightSeries.length - 1] - bodyweightSeries[0]) < thresholdKg;
}

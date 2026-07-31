// Ballistic Performance — calculation engine
// Ported verbatim from a validated prototype (cross-checked against a real coaching
// spreadsheet already in use with real clients). Treat as source of truth — see
// docs/PROJECT_SPEC.md section 3 for the reasoning behind each formula.

export interface ClientProfile {
  age: number;
  gender: 'Male' | 'Female';
  startWeight: number;
  goalWeight: number;
  bodyFatPct: number;
  activityLevel: number;
  dietApproach: 'High Carb Low Fat' | 'Higher Fat';
  tier: 1 | 2 | 3;
  cycling: boolean;
}

export interface EngineResult {
  bmr: number;
  tdee: number;
  protein: number; // grams/day
  fat: number; // grams/day
}

export interface DayTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface WeeklyTarget {
  phase: 1 | 2 | 3;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  dailyFlat?: DayTarget;
  dailyLow?: DayTarget;
  dailyHigh?: DayTarget;
}

// Weekly deficit table (kcal/day) per phase (1-4, 5-8, 9-12 weeks) and tier (1/2/3).
// "flat" = daily deficit with no calorie cycling. "low"/"high" = cycling day types,
// weighted 5 low + 2 high days to average out to the same weekly deficit as "flat".
const PHASE_DEFICITS: Record<1 | 2 | 3, Record<1 | 2 | 3, { flat: number; low: number; high: number }>> = {
  1: { 1: { flat: 500, low: 700, high: 0 }, 2: { flat: 750, low: 950, high: 50 }, 3: { flat: 1000, low: 1200, high: 300 } },
  2: { 1: { flat: 650, low: 850, high: 150 }, 2: { flat: 900, low: 1100, high: 200 }, 3: { flat: 1150, low: 1350, high: 450 } },
  3: { 1: { flat: 800, low: 1000, high: 300 }, 2: { flat: 1050, low: 1250, high: 350 }, 3: { flat: 1300, low: 1500, high: 600 } },
};

export function phaseForWeek(week: number): 1 | 2 | 3 {
  return week <= 4 ? 1 : week <= 8 ? 2 : 3;
}

// Step target schedule (Program Overview tab equivalent)
export function stepTargetForWeek(week: number): number {
  if (week <= 1) return 10000;
  if (week <= 6) return 12000;
  return 13000;
}

// BMR via Katch-McArdle (uses lean mass, more accurate than Mifflin-St Jeor when body fat
// % is known). TDEE = BMR * activity level multiplier.
export function calcEngine(profile: ClientProfile): EngineResult | null {
  const { age, gender, startWeight, goalWeight, bodyFatPct, activityLevel, dietApproach } = profile;
  if (!age || !startWeight || !goalWeight || !bodyFatPct || !activityLevel) return null;

  const fatMass = startWeight * (bodyFatPct / 100);
  const leanMass = startWeight - fatMass;
  const bmr = 13.587 * leanMass + 9.613 * fatMass + (gender === 'Male' ? 198 : 0) - 3.351 * age + 674;
  const tdee = bmr * activityLevel;

  const gap = startWeight - goalWeight;
  const proteinPerKg = gap <= 5 ? 2.2 : gap <= 8 ? 2.0 : gap <= 12 ? 1.8 : 1.6;
  const fatPerKg = dietApproach === 'High Carb Low Fat' ? 0.8 : 1.2;

  return {
    bmr,
    tdee,
    protein: startWeight * proteinPerKg,
    fat: startWeight * fatPerKg,
  };
}

// Full weekly target for a given profile + week number (1-12), accounting for phase and
// calorie cycling. Carbs always fill whatever calories remain after protein (4kcal/g) and
// fat (9kcal/g) are accounted for.
export function weeklyTarget(profile: ClientProfile, week: number): WeeklyTarget | null {
  const engine = calcEngine(profile);
  if (!engine) return null;
  const { tdee, protein, fat } = engine;
  const phase = phaseForWeek(week);
  const d = PHASE_DEFICITS[phase][profile.tier];
  const carbsFor = (cals: number) => Math.max((cals - protein * 4 - fat * 9) / 4, 0);

  if (profile.cycling) {
    const lowCals = Math.max(tdee - d.low, 0);
    const highCals = Math.max(tdee - d.high, 0);
    const lowCarbs = carbsFor(lowCals);
    const highCarbs = carbsFor(highCals);
    return {
      phase,
      calories: lowCals * 5 + highCals * 2,
      protein: protein * 7,
      fat: fat * 7,
      carbs: lowCarbs * 5 + highCarbs * 2,
      dailyLow: { calories: lowCals, protein, fat, carbs: lowCarbs },
      dailyHigh: { calories: highCals, protein, fat, carbs: highCarbs },
    };
  }

  const flatCals = Math.max(tdee - d.flat, 0);
  const flatCarbs = carbsFor(flatCals);
  return {
    phase,
    calories: flatCals * 7,
    protein: protein * 7,
    fat: fat * 7,
    carbs: flatCarbs * 7,
    dailyFlat: { calories: flatCals, protein, fat, carbs: flatCarbs },
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

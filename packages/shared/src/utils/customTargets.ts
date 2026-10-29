// Daily targets typed in by a member or their coach (migration 0146). The web keeps the same rules in lib/utils/customTargets.ts.

export const CUSTOM_TARGET_LIMITS = { calories: 20000, protein: 2000, carbs: 3000, fat: 1500 } as const;

export const TARGETS_LOCKED_MESSAGE = 'Your coach has locked your daily targets. Ask them if you want them changed.';

export interface CustomTargetInput {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface CustomTargetValues {
  custom_calories: number;
  custom_protein: number;
  custom_carbs: number;
  custom_fat: number;
}

const num = (text: string): number | null => {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

// Protein, carbs and fat are required. Calories can be left empty and are then worked out from the macros (4, 4 and 9 per gram).
export function parseCustomTargets(input: CustomTargetInput): { ok: true; value: CustomTargetValues } | { ok: false; error: string } {
  const protein = num(input.protein);
  const carbs = num(input.carbs);
  const fat = num(input.fat);
  if (protein == null || carbs == null || fat == null) return { ok: false, error: 'Enter protein, carbs and fat in grams.' };
  const typedCalories = num(input.calories);
  if ([protein, carbs, fat, typedCalories].some((n) => n != null && (Number.isNaN(n) || n < 0))) return { ok: false, error: 'Use numbers of 0 or more.' };
  const calories = typedCalories ?? Math.round(protein * 4 + carbs * 4 + fat * 9);
  if (
    protein > CUSTOM_TARGET_LIMITS.protein ||
    carbs > CUSTOM_TARGET_LIMITS.carbs ||
    fat > CUSTOM_TARGET_LIMITS.fat ||
    calories > CUSTOM_TARGET_LIMITS.calories
  ) {
    return { ok: false, error: 'Those numbers are higher than the app allows.' };
  }
  return { ok: true, value: { custom_calories: calories, custom_protein: protein, custom_carbs: carbs, custom_fat: fat } };
}

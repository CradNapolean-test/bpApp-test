import { FOOD_LIMITS } from './foodLimits';

// A Quick Add: a diary row with no food behind it (a restaurant meal, an estimate). The member types a name and whatever figures they
// know. What the boxes hold is checked here, before it is saved, with the ceilings from foodLimits (FS3): calories and grams typed as
// 5000000 used to be accepted and added a day of millions of calories.

export const QUICK_ADD_NAME_MAX = 100;

export type QuickAddFields = { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
export type QuickAddText = { name: string; calories: string; protein: string; carbs: string; fat: string };

type Box = { value: number | null } | { error: string };

// An empty box means "not known"; a comma works as a decimal point ("12,5"); figures are kept to one decimal.
function readBox(text: string, label: string, max: number, unit: string): Box {
  const t = text.trim().replace(',', '.');
  if (t === '') return { value: null };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { error: `${label} must be a number.` };
  const n = Number(t);
  if (n > max) return { error: `${label} can be at most ${max.toLocaleString('en-GB')}${unit}.` };
  return { value: Math.round(n * 10) / 10 };
}

export function readQuickAdd(text: QuickAddText): { error: string } | { fields: QuickAddFields } {
  const name = text.name.trim();
  if (!name) return { error: 'Give it a name.' };
  if (name.length > QUICK_ADD_NAME_MAX) return { error: `The name can be up to ${QUICK_ADD_NAME_MAX} characters.` };
  const calories = readBox(text.calories, 'Calories', FOOD_LIMITS.kcal, ' kcal');
  if ('error' in calories) return calories;
  const protein = readBox(text.protein, 'Protein', FOOD_LIMITS.grams, ' g');
  if ('error' in protein) return protein;
  const carbs = readBox(text.carbs, 'Carbs', FOOD_LIMITS.grams, ' g');
  if ('error' in carbs) return carbs;
  const fat = readBox(text.fat, 'Fat', FOOD_LIMITS.grams, ' g');
  if ('error' in fat) return fat;
  if (calories.value === null && protein.value === null && carbs.value === null && fat.value === null) {
    return { error: 'Add the calories, or at least one of protein, carbs or fat.' };
  }
  return { fields: { name, calories: calories.value, protein: protein.value, carbs: carbs.value, fat: fat.value } };
}

// What a saved Quick Add looks like in the boxes, for editing it.
export function quickAddText(e: { quick_add_name: string | null; quick_add_calories: number | null; quick_add_protein: number | null; quick_add_carbs: number | null; quick_add_fat: number | null }): QuickAddText {
  const s = (n: number | null) => (n == null ? '' : String(n));
  return { name: e.quick_add_name ?? '', calories: s(e.quick_add_calories), protein: s(e.quick_add_protein), carbs: s(e.quick_add_carbs), fat: s(e.quick_add_fat) };
}

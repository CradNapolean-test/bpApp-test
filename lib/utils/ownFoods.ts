import { dayCalories } from '@/lib/calculations';

// A member's own food (NU18): the same café wrap was a fresh Quick Add every day. Now a member saves it once (name, serving, and the
// protein, carbs and fat of one serving) and finds it in search, private to them and their gym's coaches (migration 0169). It is stored like
// every other food: per gram when the serving's weight is known (with that serving as the food's own, shown first), else per serving
// ("1 wrap"). The database checks the same limits. Twin of packages/shared/src/utils/ownFoods.ts (the phone app): keep the two the same.

export interface OwnFoodText {
  name: string;
  // what one serving is called ("wrap"); "serving" when left empty
  serving: string;
  // how much one serving weighs, if known
  grams: string;
  protein: string;
  carbs: string;
  fat: string;
}

export const EMPTY_OWN_FOOD: OwnFoodText = { name: '', serving: '', grams: '', protein: '', carbs: '', fat: '' };

export interface OwnFoodRow {
  name: string;
  portion: string;
  protein: number;
  carbs: number;
  fat: number;
  serving_options: { label: string; grams: number; default: true }[] | null;
}

export const OWN_FOOD_NAME_MAX = 100;
const SERVING_MAX = 30;
const MACRO_MAX = 1000;
const GRAMS_MAX = 5000;

const num = (text: string) => Number(text.trim().replace(',', '.'));
const perGram = (value: number, grams: number) => Math.round((value / grams) * 1e6) / 1e6;

export type OwnFoodResult = { ok: true; row: OwnFoodRow; perServing: { calories: number; protein: number; carbs: number; fat: number } } | { ok: false; error: string };

export function readOwnFood(text: OwnFoodText): OwnFoodResult {
  const name = text.name.trim();
  if (!name) return { ok: false, error: 'Give the food a name.' };
  if (name.length > OWN_FOOD_NAME_MAX) return { ok: false, error: `A food name can be up to ${OWN_FOOD_NAME_MAX} characters.` };
  const serving = text.serving.trim() || 'serving';
  if (serving.length > SERVING_MAX) return { ok: false, error: `Keep the serving name under ${SERVING_MAX} characters.` };
  // "1 gram" is how a food stored per gram is marked, so a serving cannot be called that.
  if (/^(g|grams?)$/i.test(serving)) return { ok: false, error: 'Call the serving what it is (like wrap or bar), and put its weight in grams beside it.' };

  const fields = [text.protein, text.carbs, text.fat];
  if (fields.some((f) => f.trim() === '')) return { ok: false, error: 'Enter the protein, carbs and fat in one serving (0 if there is none).' };
  const [protein, carbs, fat] = fields.map(num);
  if ([protein, carbs, fat].some((v) => !Number.isFinite(v) || v < 0)) return { ok: false, error: 'Protein, carbs and fat must be numbers, 0 or more.' };
  if ([protein, carbs, fat].some((v) => v > MACRO_MAX)) return { ok: false, error: `Protein, carbs and fat can be at most ${MACRO_MAX.toLocaleString('en-GB')} g each.` };
  if (protein + carbs + fat === 0) return { ok: false, error: 'Enter at least one of protein, carbs and fat.' };
  const perServing = { calories: dayCalories(protein, carbs, fat), protein, carbs, fat };

  if (text.grams.trim() === '') {
    return { ok: true, perServing, row: { name, portion: `1 ${serving}`, protein, carbs, fat, serving_options: null } };
  }
  const grams = num(text.grams);
  if (!(grams > 0)) return { ok: false, error: 'Enter how many grams one serving weighs, or leave it empty.' };
  if (grams > GRAMS_MAX) return { ok: false, error: 'That serving is heavier than the app allows.' };
  if (protein + carbs + fat > grams * 1.05) return { ok: false, error: 'The protein, carbs and fat add up to more than the serving weighs.' };
  const weight = Math.round(grams * 10) / 10;
  return {
    ok: true,
    perServing,
    row: {
      name,
      portion: '1 gram',
      protein: perGram(protein, weight),
      carbs: perGram(carbs, weight),
      fat: perGram(fat, weight),
      serving_options: [{ label: serving, grams: weight, default: true }],
    },
  };
}

export const isOwnFood = (food: { source?: string | null }) => food.source === 'own';

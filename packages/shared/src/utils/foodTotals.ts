import { dayCalories } from '../calculations';
import type { FoodDiaryEntryRow, MealPlanEntryRow, RecipeIngredientRow } from '../data/types';

export function entryMacros(entry: {
  food: { protein: number; carbs: number; fat: number; fibre?: number | null } | null;
  portions: number;
  quick_add_calories?: number | null;
  quick_add_protein?: number | null;
  quick_add_carbs?: number | null;
  quick_add_fat?: number | null;
}) {
  if (entry.food) {
    const protein = entry.food.protein * entry.portions;
    const carbs = entry.food.carbs * entry.portions;
    const fat = entry.food.fat * entry.portions;
    // Fibre only counts where the food has a figure; foods without one add nothing.
    const fibre = (entry.food.fibre ?? 0) * entry.portions;
    return { protein, carbs, fat, fibre, calories: dayCalories(protein, carbs, fat) };
  }
  // Quick Add row -- macros may be partially unknown (e.g. "650 kcal, don't know the split"),
  // so calories is taken as-entered rather than always re-derived from protein/carbs/fat.
  if (entry.quick_add_calories != null || entry.quick_add_protein != null) {
    const protein = entry.quick_add_protein ?? 0;
    const carbs = entry.quick_add_carbs ?? 0;
    const fat = entry.quick_add_fat ?? 0;
    const calories = entry.quick_add_calories ?? dayCalories(protein, carbs, fat);
    return { protein, carbs, fat, fibre: 0, calories };
  }
  return { protein: 0, carbs: 0, fat: 0, fibre: 0, calories: 0 };
}

// Most foods are stored per-1g, so an entry's quantity means grams ("150g"); a handful of
// foods without a known gram weight (e.g. "1 Egg") keep their original per-unit portion, so
// the quantity means a count of that unit instead ("2× 1 Egg").
export function formatQuantity(entry: { portions: number; food: { portion: string | null } | null }): string {
  if (entry.food?.portion === '1 gram') return `${entry.portions}g`;
  return `${entry.portions}× ${entry.food?.portion ?? 'unknown portion'}`;
}

export function totalMacros(entries: (FoodDiaryEntryRow | MealPlanEntryRow)[]) {
  return entries.reduce(
    (acc, entry) => {
      const m = entryMacros(entry);
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      acc.fibre += m.fibre;
      acc.calories += m.calories;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, fibre: 0, calories: 0 }
  );
}

// Same {food, portions} shape as totalMacros, just for recipe_ingredients -- kept as its own
// small function rather than widening totalMacros' union, since recipe ingredients aren't
// interchangeable with a logged diary/meal-plan entry anywhere else in the app.
export function totalRecipeMacros(ingredients: RecipeIngredientRow[]) {
  return ingredients.reduce(
    (acc, ingredient) => {
      const m = entryMacros(ingredient);
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      acc.fibre += m.fibre;
      acc.calories += m.calories;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, fibre: 0, calories: 0 }
  );
}

// ---- what a day's diary writes onto its daily_logs row ----
// Protein, carbs, fat and fibre as before, plus the day's calories INCLUDING Quick Adds that have no macros (R11: "300 kcal, no
// split" showed 300 on the Food screen and 0 on every other screen, because everything else worked calories out from the macros).
// A day with no entries at all writes NULLS, not zeros: 0/0/0 reads as "logged", which made a deleted food count as a logged day and
// halved the week's average (M2).
export interface DayFoodFields {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  calories: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const NO_FOOD_FIELDS: DayFoodFields = { protein: null, carbs: null, fat: null, fibre: null, calories: null };

export function dayFieldsFromDiary(entries: Parameters<typeof entryMacros>[0][]): DayFoodFields {
  if (entries.length === 0) return NO_FOOD_FIELDS;
  const total = entries.reduce<{ protein: number; carbs: number; fat: number; fibre: number; calories: number }>(
    (acc, entry) => {
      const m = entryMacros(entry);
      return { protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat, fibre: acc.fibre + m.fibre, calories: acc.calories + m.calories };
    },
    { protein: 0, carbs: 0, fat: 0, fibre: 0, calories: 0 }
  );
  return { protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat), fibre: round1(total.fibre), calories: round1(total.calories) };
}

// Typed-totals mode: an entry may be "400 kcal" with no macros at all; its calories still count. Fibre is not collected in this mode.
export function dayFieldsFromManual(entries: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }[]): Omit<DayFoodFields, 'fibre'> {
  if (entries.length === 0) return { protein: null, carbs: null, fat: null, calories: null };
  const total = entries.reduce<{ protein: number; carbs: number; fat: number; calories: number }>(
    (acc, e) => ({
      protein: acc.protein + (e.protein ?? 0),
      carbs: acc.carbs + (e.carbs ?? 0),
      fat: acc.fat + (e.fat ?? 0),
      calories: acc.calories + (e.calories ?? dayCalories(e.protein ?? 0, e.carbs ?? 0, e.fat ?? 0)),
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  );
  return { protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat), calories: round1(total.calories) };
}

// Photo diary: the estimates for the day's photos. No photos writes nulls. The calories column is left empty (null) so everything
// reads them from the estimated macros as before.
export function dayFieldsFromPhotos(entries: { estimated_protein: number | null; estimated_carbs: number | null; estimated_fat: number | null }[]): Omit<DayFoodFields, 'fibre' | 'calories'> & { calories: null } {
  if (entries.length === 0) return { protein: null, carbs: null, fat: null, calories: null };
  const total = entries.reduce<{ protein: number; carbs: number; fat: number }>(
    (acc, e) => ({ protein: acc.protein + (e.estimated_protein ?? 0), carbs: acc.carbs + (e.estimated_carbs ?? 0), fat: acc.fat + (e.estimated_fat ?? 0) }),
    { protein: 0, carbs: 0, fat: 0 }
  );
  return { protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat), calories: null };
}

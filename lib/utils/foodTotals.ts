import { dayCalories } from '@/lib/calculations';
import type { FoodDiaryEntryRow, MealPlanEntryRow, RecipeIngredientRow } from '@/lib/data/types';

export function entryMacros(entry: {
  food: { protein: number; carbs: number; fat: number } | null;
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
    return { protein, carbs, fat, calories: dayCalories(protein, carbs, fat) };
  }
  // Quick Add row -- macros may be partially unknown (e.g. "650 kcal, don't know the split"),
  // so calories is taken as-entered rather than always re-derived from protein/carbs/fat.
  if (entry.quick_add_calories != null || entry.quick_add_protein != null) {
    const protein = entry.quick_add_protein ?? 0;
    const carbs = entry.quick_add_carbs ?? 0;
    const fat = entry.quick_add_fat ?? 0;
    const calories = entry.quick_add_calories ?? dayCalories(protein, carbs, fat);
    return { protein, carbs, fat, calories };
  }
  return { protein: 0, carbs: 0, fat: 0, calories: 0 };
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
      acc.calories += m.calories;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
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
      acc.calories += m.calories;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  );
}

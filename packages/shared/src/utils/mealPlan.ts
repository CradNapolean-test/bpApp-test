import type { FoodRow, MealPlanSection, MealSectionRow, RecipeWithIngredients } from '../data/types';
import { totalRecipeMacros } from './foodTotals';

// Recipes and the Meal Planner: the fixed meal slots, how a recipe is scaled when it is logged or planned, and the limits
// (migration 0112 enforces the same ones in the database). Same behaviour as the web.

export const MEAL_PLAN_SECTIONS: { key: MealPlanSection; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'mid_morning_snack', label: 'Mid-Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'evening_snack', label: 'Evening Snack' },
];

// Which of the member's own diary sections a planned meal goes into when it is copied to the food diary (matched by name; if
// they renamed or removed it, it goes in unfiled).
export const MEAL_PLAN_DIARY_LABEL: Record<MealPlanSection, string> = {
  breakfast: 'Breakfast',
  mid_morning_snack: 'Snacks',
  lunch: 'Lunch',
  afternoon_snack: 'Snacks',
  dinner: 'Dinner',
  evening_snack: 'Snacks',
};

export function diarySectionIdFor(key: MealPlanSection, sections: Pick<MealSectionRow, 'id' | 'label'>[]): string | null {
  const want = MEAL_PLAN_DIARY_LABEL[key].toLowerCase();
  return sections.find((s) => s.label.trim().toLowerCase() === want)?.id ?? null;
}

export const RECIPE_NAME_MAX = 100;
export const MAX_SERVINGS = 100;
export const MAX_PORTIONS = 10000;

export function validateRecipeName(name: string): string | null {
  if (!name.trim()) return 'Give the recipe a name.';
  if (name.trim().length > RECIPE_NAME_MAX) return `A recipe name can be up to ${RECIPE_NAME_MAX} characters.`;
  return null;
}

// "Makes N servings": a whole number from 1 to 100; anything else becomes the nearest sensible value.
export function parseServings(text: string): number {
  const n = Math.round(Number(text));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_SERVINGS, n);
}

export function validatePortions(portions: number): string | null {
  if (!(portions > 0)) return 'The amount must be more than zero.';
  if (portions > MAX_PORTIONS) return `The amount can be up to ${MAX_PORTIONS.toLocaleString('en-GB')}.`;
  return null;
}

// "1,420 kcal per serving": the whole recipe divided by how many servings it makes.
export function perServing(recipe: Pick<RecipeWithIngredients, 'servings' | 'recipe_ingredients'>) {
  const per = recipe.servings || 1;
  const t = totalRecipeMacros(recipe.recipe_ingredients);
  return { calories: t.calories / per, protein: t.protein / per, carbs: t.carbs / per, fat: t.fat / per };
}

// Logging or planning a recipe copies its ingredients as ordinary food entries. `servings` means "how many of the recipe's own
// serving size" (MyFitnessPal-style), so each amount scales by servings / recipe.servings, not by servings alone.
export function scaleIngredients(
  ingredients: { food_id: string | null; portions: number }[],
  servings: number,
  recipeServings: number,
): { food_id: string; portions: number }[] {
  const scale = servings / (recipeServings || 1);
  return ingredients.filter((i): i is { food_id: string; portions: number } => !!i.food_id).map((i) => ({ food_id: i.food_id, portions: i.portions * scale }));
}

// "150g" for a food stored per gram, "2× 1 Egg" for one stored per unit.
export function amountLabel(portions: number, food: Pick<FoodRow, 'portion'> | null): string {
  return food?.portion === '1 gram' ? `${Math.round(portions * 10) / 10}g` : `${Math.round(portions * 100) / 100}× ${food?.portion ?? ''}`.trim();
}

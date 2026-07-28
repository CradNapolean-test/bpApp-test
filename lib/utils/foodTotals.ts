import { dayCalories } from '@/lib/calculations';
import type { FoodDiaryEntryRow, MealPlanEntryRow } from '@/lib/data/types';

export function entryMacros(entry: { food: { protein: number; carbs: number; fat: number } | null; portions: number }) {
  if (!entry.food) return { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const protein = entry.food.protein * entry.portions;
  const carbs = entry.food.carbs * entry.portions;
  const fat = entry.food.fat * entry.portions;
  return { protein, carbs, fat, calories: dayCalories(protein, carbs, fat) };
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

import type { FoodRow } from '@/lib/data/types';

// Foods a member usually eats together, learned from their own food diary (nothing is stored: it is worked out from the last 60 days
// each time, like "recently logged"). Log chicken and rice at lunch a few times and adding the chicken offers the rice, at the amount
// they usually have.
//
// A "meal" here is one section of one day. Two foods are "together" when they are in the same meal on the same day. A food is offered
// alongside another when they were together at least twice AND in at least 30% of the meals the other one was in, so one lunch that
// happened to have both does not count, and neither does a food that is in everything.

// One diary row with a food (Quick Adds have none and are left out).
export interface PairHistoryRow {
  daily_log_id: string;
  meal_section_id: string | null;
  food_id: string;
  portions: number;
  food: FoodRow | null;
}

export interface PairSuggestion {
  food: FoodRow;
  // The amount the member usually has of it: grams for a per-gram food, else a count of its portion.
  portions: number;
  // In how many meals it was with the food that suggested it, out of how many meals that food was in.
  together: number;
  meals: number;
}

export interface PairIndex {
  foods: Map<string, FoodRow>;
  usual: Map<string, number>;
  meals: Map<string, number>;
  together: Map<string, Map<string, number>>;
}

export const MIN_TOGETHER = 2;
export const MIN_SHARE = 0.3;
// A member with no meal sections logs the whole day under "Other". Everything in a day dumped there would pair with everything else,
// so an unfiled group bigger than this is not read as one meal.
export const MAX_UNFILED_MEAL = 8;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 100) / 100;
}

export function buildPairIndex(rows: PairHistoryRow[]): PairIndex {
  const foods = new Map<string, FoodRow>();
  const amounts = new Map<string, number[]>();
  const mealFoods = new Map<string, { filed: boolean; foods: Set<string> }>();

  for (const row of rows) {
    if (!row.food || row.food.hidden) continue;
    foods.set(row.food_id, row.food);
    amounts.set(row.food_id, [...(amounts.get(row.food_id) ?? []), row.portions]);
    const key = `${row.daily_log_id}|${row.meal_section_id ?? ''}`;
    const meal = mealFoods.get(key) ?? { filed: row.meal_section_id !== null, foods: new Set<string>() };
    meal.foods.add(row.food_id);
    mealFoods.set(key, meal);
  }

  const meals = new Map<string, number>();
  const together = new Map<string, Map<string, number>>();
  for (const meal of mealFoods.values()) {
    if (!meal.filed && meal.foods.size > MAX_UNFILED_MEAL) continue;
    for (const a of meal.foods) {
      meals.set(a, (meals.get(a) ?? 0) + 1);
      const withA = together.get(a) ?? new Map<string, number>();
      for (const b of meal.foods) if (b !== a) withA.set(b, (withA.get(b) ?? 0) + 1);
      together.set(a, withA);
    }
  }

  const usual = new Map<string, number>();
  for (const [id, values] of amounts) usual.set(id, median(values));
  return { foods, usual, meals, together };
}

// What goes with the foods in `basedOn`, leaving out anything in `exclude` (what is already in the meal): best first, at most `limit`.
// With several foods to go on, a food is judged on the one it goes with best.
export function suggestPairs(index: PairIndex, basedOn: string[], exclude: ReadonlySet<string>, limit = 3): PairSuggestion[] {
  const best = new Map<string, PairSuggestion>();
  for (const a of basedOn) {
    const meals = index.meals.get(a) ?? 0;
    if (meals === 0) continue;
    for (const [b, count] of index.together.get(a) ?? []) {
      if (exclude.has(b) || basedOn.includes(b) || count < MIN_TOGETHER || count / meals < MIN_SHARE) continue;
      const food = index.foods.get(b);
      const portions = index.usual.get(b);
      if (!food || portions === undefined || !(portions > 0)) continue;
      const found = best.get(b);
      if (!found || count / meals > found.together / found.meals || (count / meals === found.together / found.meals && count > found.together)) {
        best.set(b, { food, portions, together: count, meals });
      }
    }
  }
  return [...best.values()]
    .sort((x, y) => y.together / y.meals - x.together / x.meals || y.together - x.together || x.food.name.localeCompare(y.food.name))
    .slice(0, limit);
}

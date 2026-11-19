import { dayCalories } from '../calculations';

// One search result per brand and product (D23a, NU5). The Open Food Facts import has the same product many times over: "chicken breast"
// gave 6 "Tesco Chicken breast" rows (71 to 122 kcal) and about 25 near-identical Greek yogurts. Rows from the import and from scans that
// are the same product of the same brand (the same words once the brand is taken out, ignoring case, punctuation and a plural "s") are
// shown as one result, with the others a tap away ("5 more like this"). The groups keep the search's order: a group sits where its first
// row was. The row shown is the middle one by calories, so one badly entered copy does not become the figure people see. UK table foods,
// the original seed and a member's own foods are never grouped. Twin of lib/utils/foodResults.ts (the web): keep the two the same.

export interface FoodGroup<T> {
  food: T;
  // The other rows for the same product, lowest calories first.
  others: T[];
}

type Groupable = {
  id: string;
  name: string;
  brand?: string | null;
  source?: string;
  portion: string | null;
  protein: number;
  carbs: number;
  fat: number;
};

const GROUPED_SOURCES = new Set(['off', 'scan']);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

// What makes two rows "the same product": brand, the name's words without the brand's, and the unit the figures are per. Null when the
// row is never grouped.
export function sameProductKey(food: Groupable): string | null {
  if (!GROUPED_SOURCES.has(food.source ?? '')) return null;
  const brand = words(food.brand ?? '');
  const brandWords = new Set(brand);
  const name = words(food.name).filter((w) => !brandWords.has(w));
  if (name.length === 0) return null;
  return [brand.join(' '), name.join(' '), food.portion ?? ''].join('|');
}

const kcalOf = (f: Groupable) => dayCalories(f.protein, f.carbs, f.fat);

export function groupFoodResults<T extends Groupable>(foods: T[]): FoodGroup<T>[] {
  const groups: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const food of foods) {
    const key = sameProductKey(food);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.push(food);
      continue;
    }
    const items = [food];
    groups.push(items);
    if (key) byKey.set(key, items);
  }
  return groups.map((items) => {
    if (items.length === 1) return { food: items[0], others: [] };
    const byKcal = [...items].sort((a, b) => kcalOf(a) - kcalOf(b));
    const food = byKcal[(byKcal.length - 1) >> 1];
    return { food, others: byKcal.filter((f) => f !== food) };
  });
}

// "5 more like this"
export const moreLikeThis = (count: number) => `${count} more like this`;

// How many results the search asks the database for: more than are shown before grouping, so a list of near-duplicates still leaves a
// screenful of different products.
export const SEARCH_LIMIT = 60;

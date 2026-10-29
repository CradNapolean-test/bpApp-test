import { dayCalories } from '../calculations';

// Manual macro entry: a member whose coach chose "type in your totals" adds protein, carbs and fat per meal. Calories are always
// worked out from the macros (dayCalories, the validated formula), never typed, so they cannot disagree with them.

export const MAX_MANUAL_GRAMS = 10_000; // also the database's limit (migration 0114)
export const MAX_MANUAL_ENTRIES_PER_DAY = 100; // also the database's limit

export type ManualFigures = { protein: number | null; carbs: number | null; fat: number | null };
export type ManualEntryFigures = ManualFigures & { calories: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function manualCalories(f: ManualFigures): number {
  return Math.round(dayCalories(f.protein ?? 0, f.carbs ?? 0, f.fat ?? 0));
}

// One entry's calories as shown in a row: worked out from its macros, or the stored figure for an old entry with none.
export function manualEntryKcal(entry: ManualEntryFigures): number {
  return manualCalories(entry) || Math.round(entry.calories ?? 0);
}

const LABELS = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const;

// A box of grams: empty means "none", a comma works as a decimal point ("12,5"), and the figure is kept to one decimal.
function parseBox(text: string, label: string): { value: number | null } | { error: string } {
  const t = text.trim().replace(',', '.');
  if (t === '') return { value: null };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { error: `${label} must be a number of grams.` };
  const n = Number(t);
  if (n > MAX_MANUAL_GRAMS) return { error: `${label} cannot be more than ${MAX_MANUAL_GRAMS.toLocaleString('en-GB')} g.` };
  return { value: round1(n) };
}

export type ManualEntryResult = { error: string } | { entry: ManualFigures & { calories: number } };

// What the member typed, as the figures to save (calories included), or the message to show.
export function validateManualEntry(typed: { protein: string; carbs: string; fat: string }): ManualEntryResult {
  const figures: ManualFigures = { protein: null, carbs: null, fat: null };
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const parsed = parseBox(typed[key], LABELS[key]);
    if ('error' in parsed) return parsed;
    figures[key] = parsed.value;
  }
  if (figures.protein === null && figures.carbs === null && figures.fat === null) return { error: 'Enter at least one of protein, carbs or fat.' };
  return { entry: { ...figures, calories: manualCalories(figures) } };
}

// The day's totals across its entries (what the totals bar shows).
export function manualTotals(entries: ManualFigures[]): { protein: number; carbs: number; fat: number; calories: number } {
  const sum = entries.reduce<{ protein: number; carbs: number; fat: number }>(
    (acc, e) => ({ protein: acc.protein + (e.protein ?? 0), carbs: acc.carbs + (e.carbs ?? 0), fat: acc.fat + (e.fat ?? 0) }),
    { protein: 0, carbs: 0, fat: 0 },
  );
  return { ...sum, calories: dayCalories(sum.protein, sum.carbs, sum.fat) };
}

// Serving units for per-gram foods: "1 rasher" = 25 g. What is logged is always grams, so totals and targets are unchanged.
// The phone app keeps the same rules in packages/shared/src/utils/foodUnits.ts.

export interface FoodUnit {
  // Stable key for a button: the saved id for a member's own unit, "built-in:<label>" for one that comes with the food.
  key: string;
  label: string;
  grams: number;
  own: boolean;
}

export interface OwnUnitRow {
  id: string;
  food_id: string;
  label: string;
  grams: number;
}

export const MAX_UNIT_LABEL = 30;
export const MAX_UNIT_GRAMS = 5000;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

// The units to offer for a food: its built-in ones, then the member's own for it. Only foods stored per gram have units.
export function unitsFor(
  food: { id: string; portion: string | null; serving_options?: { label: string; grams: number }[] | null },
  own: OwnUnitRow[]
): FoodUnit[] {
  if (food.portion !== '1 gram') return [];
  const builtIn = (food.serving_options ?? [])
    .filter((o) => o && typeof o.label === 'string' && o.grams > 0)
    .map((o) => ({ key: `built-in:${o.label}`, label: o.label, grams: o.grams, own: false }));
  const mine = own.filter((u) => u.food_id === food.id).map((u) => ({ key: u.id, label: u.label, grams: u.grams, own: true }));
  return [...builtIn, ...mine];
}

export const gramsFromCount = (count: number, unit: Pick<FoodUnit, 'grams'>): number => round(count * unit.grams, 1);
export const countFromGrams = (grams: number, unit: Pick<FoodUnit, 'grams'>): number => round(grams / unit.grams, 2);

// "ml" reads as "250 ml"; anything else as "2 rasher" / "1 rasher", with a plain count.
export function describeAmount(count: number, unit: Pick<FoodUnit, 'label'>): string {
  return `${count} ${unit.label}`;
}

export function parseUnitInput(label: string, gramsText: string): { ok: true; label: string; grams: number } | { ok: false; error: string } {
  const name = label.trim();
  if (name === '') return { ok: false, error: 'Give the unit a name, e.g. rasher.' };
  if (name.length > MAX_UNIT_LABEL) return { ok: false, error: `Keep the name under ${MAX_UNIT_LABEL} characters.` };
  const grams = Number(gramsText.trim().replace(',', '.'));
  if (!(grams > 0)) return { ok: false, error: 'Enter how many grams one is.' };
  if (grams > MAX_UNIT_GRAMS) return { ok: false, error: 'That is heavier than the app allows.' };
  return { ok: true, label: name, grams: round(grams, 1) };
}

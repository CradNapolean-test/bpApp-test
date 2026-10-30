// Serving units for per-gram foods: "1 rasher" = 25 g. What is logged is always grams, so totals and targets are unchanged.
// The phone app keeps the same rules in packages/shared/src/utils/foodUnits.ts.

export interface FoodUnit {
  // Stable key for a button: the saved id for a member's own unit, "built-in:<label>" for one that comes with the food.
  key: string;
  label: string;
  grams: number;
  own: boolean;
  // The serving the food comes with by default (shown first, at 1): the pack's stated serving.
  isDefault: boolean;
}

// A serving as stored on the food (foods.serving_options): what the pack says, or what a coach set.
export interface ServingOption {
  label: string;
  grams: number;
  default?: boolean;
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
  food: { id: string; portion: string | null; serving_options?: ServingOption[] | null },
  own: OwnUnitRow[]
): FoodUnit[] {
  if (food.portion !== '1 gram') return [];
  const builtIn = (food.serving_options ?? [])
    .filter((o) => o && typeof o.label === 'string' && o.grams > 0)
    .map((o) => ({ key: `built-in:${o.label}`, label: o.label, grams: o.grams, own: false, isDefault: o.default === true }));
  const mine = own.filter((u) => u.food_id === food.id).map((u) => ({ key: u.id, label: u.label, grams: u.grams, own: true, isDefault: false }));
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

export const MAX_SERVINGS = 12;

export const defaultUnit = (units: FoodUnit[]): FoodUnit | null => units.find((u) => u.isDefault) ?? null;

// "bacon rasher (25 g)" in a dropdown; a unit that is itself a measure (ml) reads as just "ml".
export const unitText = (u: Pick<FoodUnit, 'label' | 'grams'>): string => (u.grams < 5 ? u.label : `${u.label} (${round(u.grams, 1)} g)`);

// What a pack states as its serving: Open Food Facts gives serving_size as text ("30 g", "1 biscuit (15 g)", "2 slices (60g)") and
// serving_quantity as the weight. The weight is the figure that matters; the text only supplies the name of one serving.
export function servingFromPack(servingSize: unknown, grams: number | null): ServingOption | null {
  if (grams == null || !(grams > 0) || grams > MAX_UNIT_GRAMS) return null;
  const text = typeof servingSize === 'string' ? servingSize : '';
  const name = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+([.,]\d+)?\s*(grams?|gr|g|ml|cl|l|fl\.?\s*oz|oz)\b/gi, ' ')
    .replace(/^\s*1\s+(?=[a-z])/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const label = /[a-z]/i.test(name) ? name.slice(0, MAX_UNIT_LABEL) : 'serving';
  return { label, grams: round(grams, 1), default: true };
}

// How much of a food is shown before anything is changed: one of the serving the food comes with (the pack's), else 100 g for a
// per-gram food, else one of its unit.
export function startingAmount(food: { id: string; portion: string | null; serving_options?: ServingOption[] | null }): number {
  if (food.portion !== '1 gram') return 1;
  return defaultUnit(unitsFor(food, []))?.grams ?? 100;
}

// Which unit an amount already in grams reads best in, when it is opened to change (the edit sheet, the amount asked after a scan):
// the food's own serving if the weight is a neat count of it (a quarter or more, in quarters), else another unit it is a neat count of,
// else null (grams). ml-sized units are not picked for you, so a weight in grams is not suddenly shown as millilitres.
export function unitForAmount(units: FoodUnit[], grams: number): FoodUnit | null {
  const neat = (u: FoodUnit) => {
    const count = grams / u.grams;
    return count >= 0.25 && Math.abs(count * 4 - Math.round(count * 4)) < 1e-6;
  };
  return units.find((u) => u.isDefault && neat(u)) ?? units.find((u) => u.grams >= 5 && neat(u)) ?? null;
}

export interface ServingDraft {
  label: string;
  grams: string;
  isDefault: boolean;
}

// A coach's edit, as typed: every row needs a name and a weight, names are not repeated, and at most one is the default.
export function cleanServings(rows: ServingDraft[]): { ok: true; options: ServingOption[] } | { ok: false; error: string } {
  if (rows.length > MAX_SERVINGS) return { ok: false, error: `Keep it to ${MAX_SERVINGS} servings.` };
  const seen = new Set<string>();
  const options: ServingOption[] = [];
  for (const row of rows) {
    const parsed = parseUnitInput(row.label, row.grams);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const key = parsed.label.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `"${parsed.label}" is in the list twice.` };
    seen.add(key);
    options.push({ label: parsed.label, grams: parsed.grams, ...(row.isDefault ? { default: true } : {}) });
  }
  return { ok: true, options };
}

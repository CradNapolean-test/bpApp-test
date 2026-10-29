import { checkFoodNumber } from './foodLimits';

// How a food's quantity is entered. Most foods are stored per 1 gram, so the quantity means grams; a handful
// without a known gram weight (e.g. "1 Egg") keep their per-unit values, so the quantity means a count of that
// unit. Same presets, steps and defaults as the web food picker.
export const GRAM_PRESETS = [50, 100, 150, 200];
export const UNIT_PRESETS = [0.5, 1, 2, 3];

export interface QuantityConfig {
  perGram: boolean;
  step: number;
  presets: number[];
  defaultQuantity: number;
  // "g" for gram foods, "×" for counted foods
  unit: string;
}

export function quantityConfig(food: { portion: string | null }): QuantityConfig {
  const perGram = food.portion === '1 gram';
  return perGram
    ? { perGram, step: 5, presets: GRAM_PRESETS, defaultQuantity: 100, unit: 'g' }
    : { perGram, step: 0.25, presets: UNIT_PRESETS, defaultQuantity: 1, unit: '×' };
}

// How much to suggest after a barcode scan (FT7). A scan used to add exactly 100 g without asking. Now the member is asked, with the pack's
// own serving size filled in when Open Food Facts gave one (otherwise 100 g); a food counted in portions starts at its usual amount.
export function scanSuggestedAmount(food: { portion: string | null }, servingGrams: number | null): number {
  const cfg = quantityConfig(food);
  return cfg.perGram ? (servingGrams ?? 100) : cfg.defaultQuantity;
}

// Whether an amount is allowed for a food: more than zero, and no more than the ceiling for how the food is measured (FS3, FS6): 2,000
// grams, or 50 portions. The member is told before the Add button is pressed.
export function quantityProblem(perGram: boolean, value: number): string | null {
  if (!(value > 0)) return 'The amount must be more than zero.';
  return checkFoodNumber(value, perGram ? 'grams' : 'portions');
}

// Parses what a person typed into a quantity box. Empty or invalid counts as 0 (so it can be cleared and retyped).
export function parseQuantity(text: string): number {
  const n = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(n) || n < 0 ? 0 : n;
}

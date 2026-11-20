import { dayCalories } from '@/lib/calculations';
import { MAX_UNIT_GRAMS, MAX_UNIT_LABEL } from '@/lib/utils/foodUnits';
import type { FoodRow } from '@/lib/data/types';

// A product nobody has added yet (the owner's list, item 6; migration 0173). When a scan finds nothing in the food list or on Open Food
// Facts, the member adds it from the pack (name, brand, serving and the protein, carbs and fat) and it goes into the SHARED food list
// straight away, so the next person who scans it gets it. It is stored like every scanned product: per gram, with the pack's serving as the
// food's own. The figures are checked by the same limits as the other food forms and the database (at most 1 g of protein, carbs or fat
// in a gram, 1.05 g of the three together, not all 0); the database checks them again and keeps one food per barcode.
// Twin of packages/shared/src/utils/barcodeFoods.ts (the phone app): keep the two the same.

// UK packs print a "per 100 g" column, and often a "per serving" one: the member types whichever they are reading.
export type PackBasis = '100g' | 'serving';

export interface BarcodeFoodText {
  name: string;
  brand: string;
  per: PackBasis;
  // what one serving is called ("bar"); "serving" when left empty
  serving: string;
  // what one serving weighs in grams: needed when the figures are per serving, optional when they are per 100 g
  grams: string;
  protein: string;
  carbs: string;
  fat: string;
}

export const EMPTY_BARCODE_FOOD: BarcodeFoodText = { name: '', brand: '', per: '100g', serving: '', grams: '', protein: '', carbs: '', fat: '' };

export const BARCODE_FOOD_NAME_MAX = 100;
export const BARCODE_FOOD_BRAND_MAX = 60;

// What add_barcode_food takes: figures per gram.
export interface BarcodeFoodFields {
  name: string;
  brand: string | null;
  protein: number;
  carbs: number;
  fat: number;
  serving_options: { label: string; grams: number; default: true }[] | null;
}

export type BarcodeFoodRead =
  | { ok: true; fields: BarcodeFoodFields; per100: { calories: number }; perServing: { label: string; grams: number; calories: number } | null }
  | { ok: false; error: string };

// A product number as the database keeps it: 6 to 14 digits (spaces typed between groups are dropped). Null for anything else, such as a
// QR code or a shelf label, which cannot be added as a product.
export function productBarcode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '');
  return /^\d{6,14}$/.test(digits) ? digits : null;
}

const num = (text: string) => Number(text.trim().replace(',', '.'));
const perGram = (value: number, grams: number) => Math.round((value / grams) * 1e6) / 1e6;
const formatGrams = (grams: number) => grams.toLocaleString('en-GB', { maximumFractionDigits: 1 });
// (a hair over, for adding up decimals in floating point, is not over)
const over = (value: number, limit: number) => value > limit + 1e-9;
const fail = (error: string): BarcodeFoodRead => ({ ok: false, error });

export function readBarcodeFood(text: BarcodeFoodText): BarcodeFoodRead {
  const name = text.name.trim();
  if (!name) return fail('Give the product its name from the pack.');
  if (name.length > BARCODE_FOOD_NAME_MAX) return fail(`A product name can be up to ${BARCODE_FOOD_NAME_MAX} characters.`);
  const brand = text.brand.trim();
  if (brand.length > BARCODE_FOOD_BRAND_MAX) return fail(`Keep the brand under ${BARCODE_FOOD_BRAND_MAX} characters.`);

  const servingName = text.serving.trim();
  if (servingName.length > MAX_UNIT_LABEL) return fail(`Keep the serving name under ${MAX_UNIT_LABEL} characters.`);
  // "1 gram" is how a food stored per gram is marked, so a serving cannot be called that.
  if (/^(g|grams?|ml)$/i.test(servingName)) return fail('Call the serving what it is (like bar or bottle), and put its weight in grams beside it.');
  const label = servingName || 'serving';

  let weight: number | null = null;
  if (text.grams.trim() !== '') {
    const grams = num(text.grams);
    const ask = text.per === 'serving' ? `Enter what one ${label} weighs in grams.` : `Enter what one ${label} weighs in grams, or leave it empty.`;
    if (!(grams > 0)) return fail(ask);
    if (grams > MAX_UNIT_GRAMS) return fail('That serving is heavier than the app allows.');
    // kept to 0.1 g, as every other serving
    weight = Math.round(grams * 10) / 10;
    if (!(weight > 0)) return fail(ask);
  }
  if (text.per === 'serving' && weight == null) return fail(`Enter what one ${label} weighs in grams: the figures are for one ${label}.`);
  if (text.per === '100g' && servingName && weight == null) return fail(`Enter what one ${label} weighs, or leave the serving empty.`);

  const typed = [text.protein, text.carbs, text.fat];
  if (typed.some((f) => f.trim() === '')) return fail('Enter the protein, carbs and fat from the pack (0 if there is none).');
  const [protein, carbs, fat] = typed.map(num);
  if ([protein, carbs, fat].some((v) => !Number.isFinite(v) || v < 0)) return fail('Protein, carbs and fat must be numbers, 0 or more.');
  if (protein + carbs + fat === 0) return fail('Enter at least one of protein, carbs and fat.');

  const basis = text.per === '100g' ? 100 : (weight as number);
  const amount = text.per === '100g' ? '100 g' : `one ${label} (${formatGrams(basis)} g)`;
  const values = { protein, carbs, fat };
  const heavier = (['protein', 'carbs', 'fat'] as const).find((key) => over(values[key], basis));
  if (heavier) return fail(`There is more ${heavier} than ${amount} weighs. Check the figures on the pack.`);
  if (over(protein + carbs + fat, basis * 1.05)) return fail(`The protein, carbs and fat add up to more than ${amount} weighs. Check the figures on the pack.`);

  const per = { protein: perGram(protein, basis), carbs: perGram(carbs, basis), fat: perGram(fat, basis) };
  const caloriesIn = (grams: number) => dayCalories(per.protein * grams, per.carbs * grams, per.fat * grams);
  return {
    ok: true,
    fields: {
      name,
      brand: brand || null,
      ...per,
      serving_options: weight != null ? [{ label, grams: weight, default: true }] : null,
    },
    per100: { calories: caloriesIn(100) },
    perServing: weight != null ? { label, grams: weight, calories: caloriesIn(weight) } : null,
  };
}

// A scanned product's figures as a coach corrects them (Library > Foods): name, brand and per 100 g, checked as above.
export function productText(food: Pick<FoodRow, 'name' | 'brand' | 'protein' | 'carbs' | 'fat'>): BarcodeFoodText {
  const per100 = (n: number) => String(Math.round(Number(n) * 1000) / 10);
  return { ...EMPTY_BARCODE_FOOD, name: food.name, brand: food.brand ?? '', protein: per100(food.protein), carbs: per100(food.carbs), fat: per100(food.fat) };
}

// What add_barcode_food answered: the food (the one just added, or the one someone added first) and whether it was already there. Null
// for anything else.
export function addedProduct(data: unknown): { food: FoodRow; existing: boolean } | null {
  if (!data || typeof data !== 'object') return null;
  const { food, existing } = data as { food?: unknown; existing?: unknown };
  if (!food || typeof food !== 'object' || typeof (food as { id?: unknown }).id !== 'string') return null;
  const row = food as FoodRow;
  // numeric columns can come back as strings from a JSON object built in SQL; the app counts with numbers
  const n = (v: unknown) => (v == null ? v : Number(v)) as number;
  return { food: { ...row, protein: n(row.protein), carbs: n(row.carbs), fat: n(row.fat), fibre: row.fibre == null ? row.fibre : n(row.fibre) }, existing: existing === true };
}

// Said after "Add this product" when someone else had added it first: their food is used.
export const ADDED_BY_SOMEONE_ELSE = 'Someone added this product just before you, so theirs is used. Check its figures before you add it.';
// Said when a scan finds a product a coach has taken off the list (it was wrong).
export const PRODUCT_TAKEN_OFF = 'A coach has taken this product off the food list. Use Quick Add for it, or ask your coach.';

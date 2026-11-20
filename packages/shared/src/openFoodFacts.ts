import { servingFromPack, type ServingOption } from './utils/foodUnits';

// Free, open barcode-lookup API — no key required. Runs client-side (called from
// BarcodeScanner, a 'use client' component) since it's just a public read-only GET.
export interface OpenFoodFactsProduct {
  name: string;
  // null (rather than a total lookup miss) means OFF has this product but a contributor never
  // filled in that nutrient -- common for smaller/private-label brands. The caller prompts for
  // whatever's missing instead of treating an existing-but-incomplete entry as "not found".
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  // Grams of fibre per gram; null when OFF has no figure (the food then adds no fibre).
  fibre: number | null;
  // The pack's stated serving in grams, when OFF has one that makes sense; null otherwise (FT7).
  servingGrams: number | null;
  // The same serving as a food serving choice ("1 biscuit", 15 g) to store on the food, so it is offered next time; null when the pack states none.
  serving: ServingOption | null;
}

// OFF's serving_quantity is grams (a number or a numeric string). Anything missing, zero or silly is no serving.
export function servingFrom(raw: unknown): number | null {
  const grams = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(grams) && grams > 0 && grams <= 2000 ? Math.round(grams * 10) / 10 : null;
}

// Said when Open Food Facts could not be asked (no connection, or it answered with an error such as 503 or 429). That is not "nobody has
// this product", so the scan says to try again rather than offering to add the product for everyone from the pack.
export const OFF_UNAVAILABLE = 'Could not reach the online product list just now. Try the scan again in a moment, or search instead.';

// Null only when Open Food Facts says it does not have the product (404, or status 0); any other failure throws OFF_UNAVAILABLE.
export async function lookupBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`).catch(() => null);
  if (!res) throw new Error(OFF_UNAVAILABLE);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(OFF_UNAVAILABLE);

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const nutriments = product.nutriments ?? {};
  // Open Food Facts reports per-100g; the app's foods table stores per-1g throughout, so
  // divide down here rather than carrying a "100g" special case through the rest of the code.
  const perGram = (value: unknown): number | null => (typeof value === 'number' ? value / 100 : null);

  const servingGrams = servingFrom(product.serving_quantity);
  return {
    name: product.product_name || product.generic_name || `Unknown product (${barcode})`,
    protein: perGram(nutriments.proteins_100g),
    carbs: perGram(nutriments.carbohydrates_100g),
    fat: perGram(nutriments.fat_100g),
    fibre: perGram(nutriments.fiber_100g),
    servingGrams,
    serving: servingFromPack(product.serving_size, servingGrams),
  };
}

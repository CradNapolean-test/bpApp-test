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
}

export async function lookupBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const nutriments = product.nutriments ?? {};
  // Open Food Facts reports per-100g; the app's foods table stores per-1g throughout, so
  // divide down here rather than carrying a "100g" special case through the rest of the code.
  const perGram = (value: unknown): number | null => (typeof value === 'number' ? value / 100 : null);

  return {
    name: product.product_name || product.generic_name || `Unknown product (${barcode})`,
    protein: perGram(nutriments.proteins_100g),
    carbs: perGram(nutriments.carbohydrates_100g),
    fat: perGram(nutriments.fat_100g),
    fibre: perGram(nutriments.fiber_100g),
  };
}

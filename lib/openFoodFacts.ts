// Free, open barcode-lookup API — no key required. Runs client-side (called from
// BarcodeScanner, a 'use client' component) since it's just a public read-only GET.
export interface OpenFoodFactsProduct {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
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
  const protein = nutriments.proteins_100g;
  const carbs = nutriments.carbohydrates_100g;
  const fat = nutriments.fat_100g;
  if (protein == null || carbs == null || fat == null) return null;

  return {
    name: product.product_name || product.generic_name || `Unknown product (${barcode})`,
    protein: Number(protein) / 100,
    carbs: Number(carbs) / 100,
    fat: Number(fat) / 100,
  };
}

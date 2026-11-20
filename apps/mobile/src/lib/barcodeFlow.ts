import { useRef, useState } from 'react';

import type { FoodRow } from '@ballistic/shared/data/types';
import { extractBarcode } from '@ballistic/shared/utils/barcode';
import { ADDED_BY_SOMEONE_ELSE, PRODUCT_TAKEN_OFF, productBarcode, type BarcodeFoodFields } from '@ballistic/shared/utils/barcodeFoods';
import { scanSuggestedAmount } from '@ballistic/shared/utils/foodQuantity';
import { defaultUnit, unitsFor, type ServingOption } from '@ballistic/shared/utils/foodUnits';

import { addBarcodeFood, findFoodByBarcode, lookupBarcode, setFoodServings, upsertFoodFromBarcode } from '@/lib/food';

export type ScanTarget = { id: string | null; label: string };
export type PendingScan = { barcode: string; name: string; protein: number | null; carbs: number | null; fat: number | null; servingGrams: number | null; serving: ServingOption | null; target: ScanTarget | null };
// A scanned food waiting for the member to say how much (FT7).
export type ScanConfirm = { food: FoodRow; amount: number; target: ScanTarget | null };
// A product nobody has added (not in the food list, not on Open Food Facts), waiting to be added from the pack (owner's list item 6).
export type NewProduct = { barcode: string; name: string; target: ScanTarget | null };

// The barcode flow, same order as the web: start a scan aimed at a diary section, look the code up (our food
// database first, then Open Food Facts), then ASK how much (the pack's serving size is filled in when it has one) before the food
// is handed back to be added. If Open Food Facts has the product but not every nutrient, ask for just what is missing instead of
// treating it as a total miss. If nobody has it at all, the member can add it from the pack, for everyone (migration 0173).
// iOS does not show a sheet (a Modal) asked for while another is still sliding away, so a hand-over from one sheet straight to the next
// waits this long. (Hand-overs with a lookup in between, such as scanner to "how much", are slower than this anyway.)
export const SHEET_HANDOFF_MS = 400;

// The pack's own serving when the food has one, else the usual suggestion (100 g).
const suggestedAmount = (food: FoodRow, servingGrams: number | null) => defaultUnit(unitsFor(food, []))?.grams ?? scanSuggestedAmount(food, servingGrams);

export function useBarcodeFlow(onAddFood: (food: FoodRow, grams: number, target: ScanTarget | null) => void) {
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [confirming, setConfirming] = useState<ScanConfirm | null>(null);
  const [adding, setAdding] = useState<NewProduct | null>(null);
  // What the member had searched for when they chose to scan instead ("Has a barcode?"), to start the product's name with.
  const nameHint = useRef('');

  function start(target: ScanTarget, name = '') {
    nameHint.current = name;
    setScanTarget(target);
    setStatus(null);
  }

  async function handleDetected(scanned: string) {
    const barcode = extractBarcode(scanned);
    const target = scanTarget;
    setScanTarget(null);
    setStatus('Looking up…');
    try {
      const known = await findFoodByBarcode(barcode);
      // A coach took this product off the list because it was wrong: say so, rather than caching it or adding it again.
      if (known.hidden) {
        setStatus(PRODUCT_TAKEN_OFF);
        return;
      }
      let food = known.food;
      let servingGrams: number | null = null;
      if (food && (food.source === 'scan' || food.source === 'off') && !food.serving_options?.length) {
        // Scanned before servings existed: take the pack's serving from Open Food Facts now, once, so it is offered from here on.
        const product = await lookupBarcode(barcode).catch(() => null);
        if (product?.serving && (await setFoodServings(food.id, [product.serving]).catch(() => false))) food = { ...food, serving_options: [product.serving] };
      }
      if (!food) {
        const product = await lookupBarcode(barcode);
        if (!product) {
          // Nobody has this product: the member can add it from the pack, for everyone. Not something that is not a product number.
          const code = productBarcode(barcode);
          if (!code) {
            setStatus(`No product found for barcode ${barcode}. Try search instead.`);
            return;
          }
          setStatus(null);
          setAdding({ barcode: code, name: nameHint.current, target });
          return;
        }
        if (product.protein == null || product.carbs == null || product.fat == null) {
          setStatus(null);
          setPending({ barcode, name: product.name, protein: product.protein, carbs: product.carbs, fat: product.fat, servingGrams: product.servingGrams, serving: product.serving, target });
          return;
        }
        food = await upsertFoodFromBarcode(barcode, { name: product.name, portion: '1 gram', protein: product.protein, carbs: product.carbs, fat: product.fat, fibre: product.fibre, serving_options: product.serving ? [product.serving] : null });
        servingGrams = product.servingGrams;
      }
      setStatus(null);
      setConfirming({ food, amount: suggestedAmount(food, servingGrams), target });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Lookup failed.');
    }
  }

  // Macros arrive per 100 g (as printed on the pack) and are stored per gram.
  async function handleComplete(per100: { protein: number; carbs: number; fat: number }) {
    if (!pending) return;
    const { barcode, name, target, servingGrams, serving } = pending;
    setPending(null);
    setStatus('Saving…');
    try {
      const food = await upsertFoodFromBarcode(barcode, { name, portion: '1 gram', protein: per100.protein / 100, carbs: per100.carbs / 100, fat: per100.fat / 100, serving_options: serving ? [serving] : null });
      setStatus(null);
      setConfirming({ food, amount: suggestedAmount(food, servingGrams), target });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  // "Add this product": into the shared food list, then on to how much, as for any scan. If someone added it first, theirs is used.
  // Returns a message for the form when it could not be added.
  async function handleAddProduct(fields: BarcodeFoodFields): Promise<string | null> {
    if (!adding) return null;
    const { barcode, target } = adding;
    const result = await addBarcodeFood(barcode, fields).catch(() => null);
    if (!result) return 'Could not add that product. Check your connection and try again.';
    if ('error' in result) return result.error;
    setAdding(null);
    setStatus(result.existing ? ADDED_BY_SOMEONE_ELSE : null);
    // the "Add this product" sheet slides away first, then "how much" opens
    const confirm = { food: result.food, amount: suggestedAmount(result.food, null), target };
    setTimeout(() => setConfirming(confirm), SHEET_HANDOFF_MS);
    return null;
  }

  // The member said how much: now the food is added.
  function confirmAmount(amount: number) {
    const c = confirming;
    if (!c) return;
    setConfirming(null);
    onAddFood(c.food, amount, c.target);
    setStatus(`Added ${c.food.name} to ${c.target?.label ?? 'Other'}.`);
  }

  return {
    scanTarget,
    status,
    pending,
    confirming,
    adding,
    confirmAmount,
    cancelConfirm: () => setConfirming(null),
    start,
    clearStatus: () => setStatus(null),
    cancelScan: () => setScanTarget(null),
    cancelPending: () => setPending(null),
    cancelAdding: () => setAdding(null),
    handleDetected,
    handleComplete,
    handleAddProduct,
  };
}

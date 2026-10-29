import { useState } from 'react';

import type { FoodRow } from '@ballistic/shared/data/types';
import { extractBarcode } from '@ballistic/shared/utils/barcode';
import { scanSuggestedAmount } from '@ballistic/shared/utils/foodQuantity';
import { defaultUnit, unitsFor, type ServingOption } from '@ballistic/shared/utils/foodUnits';

import { getFoodByBarcode, lookupBarcode, setFoodServings, upsertFoodFromBarcode } from '@/lib/food';

export type ScanTarget = { id: string | null; label: string };
export type PendingScan = { barcode: string; name: string; protein: number | null; carbs: number | null; fat: number | null; servingGrams: number | null; serving: ServingOption | null; target: ScanTarget | null };
// A scanned food waiting for the member to say how much (FT7).
export type ScanConfirm = { food: FoodRow; amount: number; target: ScanTarget | null };

// The barcode flow, same order as the web: start a scan aimed at a diary section, look the code up (our food
// database first, then Open Food Facts), then ASK how much (the pack's serving size is filled in when it has one) before the food
// is handed back to be added. If Open Food Facts has the product but not every nutrient, ask for just what is missing instead of
// treating it as a total miss.
// The pack's own serving when the food has one, else the usual suggestion (100 g).
const suggestedAmount = (food: FoodRow, servingGrams: number | null) => defaultUnit(unitsFor(food, []))?.grams ?? scanSuggestedAmount(food, servingGrams);

export function useBarcodeFlow(onAddFood: (food: FoodRow, grams: number, target: ScanTarget | null) => void) {
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [confirming, setConfirming] = useState<ScanConfirm | null>(null);

  function start(target: ScanTarget) {
    setScanTarget(target);
    setStatus(null);
  }

  async function handleDetected(scanned: string) {
    const barcode = extractBarcode(scanned);
    const target = scanTarget;
    setScanTarget(null);
    setStatus('Looking up…');
    try {
      let food = await getFoodByBarcode(barcode);
      let servingGrams: number | null = null;
      if (food && (food.source === 'scan' || food.source === 'off') && !food.serving_options?.length) {
        // Scanned before servings existed: take the pack's serving from Open Food Facts now, once, so it is offered from here on.
        const product = await lookupBarcode(barcode).catch(() => null);
        if (product?.serving && (await setFoodServings(food.id, [product.serving]).catch(() => false))) food = { ...food, serving_options: [product.serving] };
      }
      if (!food) {
        const product = await lookupBarcode(barcode);
        if (!product) {
          setStatus(`No product found for barcode ${barcode}. Try search instead.`);
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

  // The member said how much: now the food is added.
  function confirmAmount(amount: number) {
    const c = confirming;
    if (!c) return;
    setConfirming(null);
    onAddFood(c.food, amount, c.target);
    setStatus(`Added ${c.food.name} to ${c.target?.label ?? 'Other'}.`);
  }

  return { scanTarget, status, pending, confirming, confirmAmount, cancelConfirm: () => setConfirming(null), start, clearStatus: () => setStatus(null), cancelScan: () => setScanTarget(null), cancelPending: () => setPending(null), handleDetected, handleComplete };
}

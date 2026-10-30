'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode, Search } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { getFavoriteFoods, getFoodByBarcode, getFoodPairHistory, getRecentlyLoggedFoods, setFavoriteFood, setFoodServings, upsertFoodFromBarcode } from '@/lib/data/foods';
import { buildPairIndex, type PairIndex } from '@/lib/foodPairs';
import { lookupBarcode } from '@/lib/openFoodFacts';
import { useToast } from '@/app/_components/ToastProvider';
import { BarcodeScanner } from './BarcodeScanner';
import { QuantitySheet } from './QuantitySheet';
import type { FoodRow } from '@/lib/data/types';
import { defaultUnit, unitsFor, type ServingOption } from '@/lib/utils/foodUnits';

// Shared by Food Tracking, the Meal Planner and Recipes so adding a food looks and works the same
// everywhere: the same "Add food" + barcode buttons, the same favourites / recently-logged shortcuts
// in the food sheet, and the same barcode scan flow.

export interface FoodTarget {
  id: string | null;
  label: string;
}

// Favourites and recently logged foods for the "Add food" sheet. Loaded once, on demand.
export function useFoodShortcuts(clientId: string, enabled: boolean) {
  const [favorites, setFavorites] = useState<FoodRow[]>([]);
  const [recentlyLogged, setRecentlyLogged] = useState<FoodRow[]>([]);
  const toast = useToast();
  // A failed load leaves the lists empty (they are shortcuts, not essential) instead of an unhandled rejection (FT5).
  useEffect(() => {
    if (!enabled) return;
    getFavoriteFoods(clientId).then(setFavorites).catch(() => {});
    getRecentlyLoggedFoods(clientId).then(setRecentlyLogged).catch(() => {});
  }, [clientId, enabled]);
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // The star flips straight away; if saving fails it flips back and says so (it used to stay changed on screen while nothing was saved).
  async function toggleFavorite(food: FoodRow, isFavorite: boolean) {
    const before = favorites;
    setFavorites((prev) => (isFavorite ? [food, ...prev.filter((f) => f.id !== food.id)] : prev.filter((f) => f.id !== food.id)));
    try {
      await setFavoriteFood(clientId, food.id, isFavorite);
    } catch {
      setFavorites(before);
      toast.error('Could not update your favourites. Please try again.');
    }
  }
  return { favorites, recentlyLogged, favoriteIds, toggleFavorite };
}

// What this member usually eats with what, worked out from their last 60 days of food (lib/foodPairs.ts), loaded once. Only Food Tracking
// uses it, so it is its own hook rather than part of useFoodShortcuts (the Meal Planner and Recipes would pay for a load they never use).
// Null until it arrives, and for good if it fails: suggestions are a nicety, and a failed load is no suggestions, not an error (FT5).
export function useFoodPairs(clientId: string, enabled: boolean): PairIndex | null {
  const [index, setIndex] = useState<PairIndex | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getFoodPairHistory(clientId)
      .then((rows) => {
        if (!cancelled) setIndex(buildPairIndex(rows));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId, enabled]);
  return index;
}

// Shown when a barcode scan hits a real Open Food Facts product that's missing one or more
// macros (common for smaller/private-label brands where a contributor never filled in the
// full nutrition panel) -- lets the user complete just what's missing instead of the scan
// silently failing as if OFF had no record of the product at all. Inputs are per-100g (what's
// on the packaging) and converted to the foods table's per-gram storage on save.
function CompleteScannedFoodForm({
  product,
  onCancel,
  onSave,
}: {
  product: { name: string; protein: number | null; carbs: number | null; fat: number | null };
  onCancel: () => void;
  onSave: (macros: { protein: number; carbs: number; fat: number }) => void;
}) {
  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';
  const toPer100 = (v: number | null) => (v != null ? String(Math.round(v * 100 * 10) / 10) : '');
  const [protein, setProtein] = useState(toPer100(product.protein));
  const [carbs, setCarbs] = useState(toPer100(product.carbs));
  const [fat, setFat] = useState(toPer100(product.fat));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (protein === '' || carbs === '' || fat === '') return;
    onSave({ protein: Number(protein) / 100, carbs: Number(carbs) / 100, fat: Number(fat) / 100 });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <p className="text-sm font-medium text-black dark:text-zinc-50">{product.name}</p>
      <p className="text-xs text-zinc-500">
        Found on Open Food Facts, but missing some nutrition info — fill in the rest (per 100g) to save it.
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Protein g</span>
          <input type="number" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Carbs g</span>
          <input type="number" step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Fat g</span>
          <input type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Save &amp; add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// A scan should be a plain product number, but some packs carry a retailer label with the number
// buried in text (e.g. "COLA5000129396980V1"). Take the product number out of it: the longest run of
// 8-14 digits.
export function extractBarcode(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{6,14}$/.test(trimmed)) return trimmed;
  const runs = trimmed.match(/\d{8,14}/g);
  if (!runs) return trimmed;
  return runs.sort((a, b) => b.length - a.length)[0];
}

// The barcode flow: start a scan aimed at a target (a diary section, a plan meal, a recipe), look
// the code up (our food database first, then Open Food Facts), ask how much (the pack's serving when
// Open Food Facts states one, else 100 g) and hand the food back to be added. It used to add 100 g
// silently (FT7). `panel` is the scanner / "fill in the missing macros" form / quantity sheet / status
// line to render once anywhere on the screen.
export function useBarcodeAdd(onAddFood: (food: FoodRow, portions: number, target: FoodTarget | null) => Promise<unknown> | void) {
  const [scanTarget, setScanTarget] = useState<FoodTarget | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    barcode: string;
    name: string;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    target: FoodTarget | null;
    servingGrams: number | null;
    serving: ServingOption | null;
  } | null>(null);
  // A product that was found and is waiting for the member to say how much.
  const [quantity, setQuantity] = useState<{ food: FoodRow; target: FoodTarget | null; initial: number } | null>(null);

  function start(target: FoodTarget) {
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
        if (product?.serving) {
          const saved = await setFoodServings(food.id, [product.serving]).catch(() => null);
          if (saved?.ok) food = { ...food, serving_options: [product.serving] };
        }
      }
      if (!food) {
        const product = await lookupBarcode(barcode);
        if (!product) {
          setStatus(`No product found for barcode ${barcode} — try search instead.`);
          return;
        }
        if (product.protein == null || product.carbs == null || product.fat == null) {
          // OFF has this product but a contributor never filled in every nutrient -- ask for
          // just what's missing rather than discarding a real match as if it were a total miss.
          setStatus(null);
          setPending({ barcode, name: product.name, protein: product.protein, carbs: product.carbs, fat: product.fat, target, servingGrams: product.servingGrams, serving: product.serving });
          return;
        }
        servingGrams = product.servingGrams;
        food = await upsertFoodFromBarcode(barcode, {
          name: product.name,
          portion: '1 gram',
          protein: product.protein,
          carbs: product.carbs,
          fat: product.fat,
          fibre: product.fibre,
          serving_options: product.serving ? [product.serving] : null,
        });
      }
      setStatus(null);
      const stated = defaultUnit(unitsFor(food, []));
      setQuantity({ food, target, initial: stated?.grams ?? servingGrams ?? 100 });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Lookup failed.');
    }
  }

  async function handleComplete(macros: { protein: number; carbs: number; fat: number }) {
    if (!pending) return;
    const { barcode, name, target, servingGrams, serving } = pending;
    setPending(null);
    setStatus('Saving…');
    try {
      const food = await upsertFoodFromBarcode(barcode, { name, portion: '1 gram', ...macros, serving_options: serving ? [serving] : null });
      setStatus(null);
      const stated = defaultUnit(unitsFor(food, []));
      setQuantity({ food, target, initial: stated?.grams ?? servingGrams ?? 100 });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  const panel = (
    <>
      {scanTarget && <BarcodeScanner onDetected={handleDetected} onClose={() => setScanTarget(null)} />}
      {pending && <CompleteScannedFoodForm product={pending} onCancel={() => setPending(null)} onSave={handleComplete} />}
      {quantity && (
        <QuantitySheet
          title={quantity.food.name}
          unitLabel="grams"
          initial={quantity.initial}
          food={quantity.food}
          onClose={() => setQuantity(null)}
          onSave={async (grams) => {
            const { food, target } = quantity;
            setQuantity(null);
            setStatus('Adding…');
            try {
              const result = await onAddFood(food, grams, target);
              // The screen's add reports false when it could not save, and has already said why.
              setStatus(result === false ? null : `Added ${food.name} to ${target?.label ?? 'Other'}.`);
            } catch (err) {
              setStatus(err instanceof Error ? err.message : 'Could not add it.');
            }
          }}
        />
      )}
      {status && <p className="text-sm text-zinc-500">{status}</p>}
    </>
  );

  return { start, panel };
}

// The standard "add a food" control: a pill that opens the search sheet beside a barcode button.
export function AddFoodButtons({
  onAdd,
  onScan,
  scanLabel,
  prominent = false,
  label = 'Add food',
}: {
  onAdd: () => void;
  onScan: () => void;
  scanLabel: string;
  prominent?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onAdd}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full text-sm ${
          prominent ? 'h-11 bg-accent font-extrabold text-accent-foreground' : 'h-10 bg-accent-soft font-bold text-accent'
        }`}
      >
        <Search className="h-4 w-4" />
        {label}
      </button>
      <button
        type="button"
        aria-label={scanLabel}
        onClick={onScan}
        className={`flex w-12 items-center justify-center rounded-full border border-black/10 text-zinc-600 dark:border-white/10 dark:text-zinc-300 ${
          prominent ? 'h-11' : 'h-10'
        }`}
      >
        <Barcode className="h-4 w-4" />
      </button>
    </div>
  );
}

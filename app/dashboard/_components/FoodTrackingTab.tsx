'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { addFoodDiaryEntry, removeFoodDiaryEntry, syncFoodDiaryToLog } from '@/lib/data/foodDiary';
import { getFoodByBarcode, upsertFoodFromBarcode } from '@/lib/data/foods';
import { lookupBarcode } from '@/lib/openFoodFacts';
import { formatQuantity, totalMacros } from '@/lib/utils/foodTotals';
import { FoodSearchPicker } from './FoodSearchPicker';
import { BarcodeScanner } from './BarcodeScanner';
import type { FoodDiaryEntryRow, FoodRow } from '@/lib/data/types';

export function FoodTrackingTab({
  dailyLogId,
  initialEntries,
  readOnly,
}: {
  dailyLogId: string | null;
  initialEntries: FoodDiaryEntryRow[];
  readOnly: boolean;
}) {
  const { run } = useAction();
  const { run: runSync, busy: syncing } = useAction();
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const totals = totalMacros(initialEntries);

  async function handleAdd(food: FoodRow, portions: number) {
    if (!dailyLogId) return;
    await run(() => addFoodDiaryEntry(dailyLogId, food.id, portions), { success: `${food.name} added` });
  }

  async function handleBarcodeDetected(barcode: string) {
    setScanning(false);
    setScanStatus('Looking up…');
    try {
      let food = await getFoodByBarcode(barcode);
      if (!food) {
        const product = await lookupBarcode(barcode);
        if (!product) {
          setScanStatus(`No product found for barcode ${barcode} — try search below.`);
          return;
        }
        food = await upsertFoodFromBarcode(barcode, { ...product, portion: '1 gram' });
      }
      await handleAdd(food, 100);
      setScanStatus(`Added ${food.name}.`);
    } catch (err) {
      setScanStatus(err instanceof Error ? err.message : 'Lookup failed.');
    }
  }

  async function handleRemove(id: string) {
    await run(() => removeFoodDiaryEntry(id), { success: 'Removed' });
  }

  async function handleSync() {
    if (!dailyLogId) return;
    await runSync(() => syncFoodDiaryToLog(dailyLogId), { success: "Synced to today's Weekly Log" });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Today&apos;s totals</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-zinc-500">Calories</dt><dd>{Math.round(totals.calories)} kcal</dd></div>
          <div><dt className="text-zinc-500">Protein</dt><dd>{Math.round(totals.protein)} g</dd></div>
          <div><dt className="text-zinc-500">Carbs</dt><dd>{Math.round(totals.carbs)} g</dd></div>
          <div><dt className="text-zinc-500">Fat</dt><dd>{Math.round(totals.fat)} g</dd></div>
        </dl>
        {!readOnly && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10"
          >
            {syncing ? 'Syncing…' : "Sync to today's Weekly Log"}
          </button>
        )}
      </div>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {initialEntries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between p-3">
            <div className="text-sm">
              <p className="font-medium text-black dark:text-zinc-50">{entry.food?.name ?? 'Unknown food'}</p>
              <p className="text-xs text-zinc-500">{formatQuantity(entry)}</p>
            </div>
            {!readOnly && (
              <button
                onClick={() => handleRemove(entry.id)}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {initialEntries.length === 0 && (
          <li className="p-3 text-sm text-zinc-500">Nothing logged yet today.</li>
        )}
      </ul>

      {!readOnly && (
        <div className="space-y-2">
          {!scanning && (
            <button
              onClick={() => {
                setScanning(true);
                setScanStatus(null);
              }}
              className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Scan barcode
            </button>
          )}
          {scanning && (
            <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanning(false)} />
          )}
          {scanStatus && <p className="text-sm text-zinc-500">{scanStatus}</p>}
          <FoodSearchPicker onAdd={handleAdd} />
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { addMealPlanEntry, removeMealPlanEntry } from '@/lib/data/mealPlan';
import { formatQuantity, totalMacros } from '@/lib/utils/foodTotals';
import { FoodSearchPicker } from './FoodSearchPicker';
import type { MealPlanEntryRow, MealPlanSection, FoodRow } from '@/lib/data/types';

const SECTIONS: { key: MealPlanSection; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'mid_morning_snack', label: 'Mid-Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'evening_snack', label: 'Evening Snack' },
];

export function MealPlannerTab({
  clientId,
  initialEntries,
  readOnly,
}: {
  clientId: string;
  initialEntries: MealPlanEntryRow[];
  readOnly: boolean;
}) {
  const { run } = useAction();
  const [openSection, setOpenSection] = useState<MealPlanSection | null>(null);

  async function handleAdd(section: MealPlanSection, food: FoodRow, portions: number) {
    await run(() => addMealPlanEntry(clientId, section, food.id, portions), {
      success: `${food.name} added`,
      onDone: () => setOpenSection(null),
    });
  }

  async function handleRemove(id: string) {
    await run(() => removeMealPlanEntry(id), { success: 'Removed' });
  }

  const dayTotals = totalMacros(initialEntries);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Typical day totals</h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-zinc-500">Calories</dt><dd>{Math.round(dayTotals.calories)} kcal</dd></div>
          <div><dt className="text-zinc-500">Protein</dt><dd>{Math.round(dayTotals.protein)} g</dd></div>
          <div><dt className="text-zinc-500">Carbs</dt><dd>{Math.round(dayTotals.carbs)} g</dd></div>
          <div><dt className="text-zinc-500">Fat</dt><dd>{Math.round(dayTotals.fat)} g</dd></div>
        </dl>
      </div>

      {SECTIONS.map(({ key, label }) => {
        const entries = initialEntries.filter((e) => e.section === key);
        return (
          <div key={key} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-black dark:text-zinc-50">{label}</h4>
              {!readOnly && (
                <button
                  onClick={() => setOpenSection(openSection === key ? null : key)}
                  className="text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-400"
                >
                  {openSection === key ? 'Close' : '+ Add food'}
                </button>
              )}
            </div>
            <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {entry.food?.name} <span className="text-zinc-500">{formatQuantity(entry)}</span>
                  </span>
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
              {entries.length === 0 && <li className="py-2 text-sm text-zinc-500">Nothing planned.</li>}
            </ul>
            {openSection === key && (
              <div className="mt-3">
                <FoodSearchPicker onAdd={(food, portions) => handleAdd(key, food, portions)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NotebookPen } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMealPlanEntry, logPlanToDiary, removeMealPlanEntry, updateMealPlanEntryPortions } from '@/lib/data/mealPlan';
import { addRecipeToMealPlan } from '@/lib/data/recipes';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { AddFoodButtons, useBarcodeAdd, useFoodShortcuts } from './FoodEntryTools';
import { NutritionSummary } from './NutritionSummary';
import { QuantitySheet } from './QuantitySheet';
import type { ClientProfileRow, MealPlanEntryRow, MealPlanSection, FoodRow, RecipeRow } from '@/lib/data/types';

const SECTIONS: { key: MealPlanSection; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'mid_morning_snack', label: 'Mid-Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'evening_snack', label: 'Evening Snack' },
];

const amountLabel = (entry: MealPlanEntryRow) =>
  entry.food?.portion === '1 gram' ? `${Math.round(entry.portions * 10) / 10}g` : `${Math.round(entry.portions * 100) / 100}× ${entry.food?.portion ?? ''}`;

function EntryRow({
  entry,
  readOnly,
  onRemove,
  onUpdatePortions,
}: {
  entry: MealPlanEntryRow;
  readOnly: boolean;
  onRemove: (id: string) => void;
  onUpdatePortions: (id: string, portions: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const macros = entryMacros(entry);
  return (
    <li>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.food?.name ?? 'Unknown food'}</span>
          <span className="block text-xs text-zinc-500">{amountLabel(entry)}</span>
        </span>
        <span className="shrink-0 text-sm text-zinc-500">{Math.round(macros.calories)} kcal</span>
      </button>
      {editing && !readOnly && (
        <QuantitySheet
          title={entry.food?.name ?? 'Planned food'}
          unitLabel={entry.food?.portion === '1 gram' ? 'grams' : `× ${entry.food?.portion ?? 'portion'}`}
          initial={entry.portions}
          onClose={() => setEditing(false)}
          onSave={(portions) => {
            onUpdatePortions(entry.id, portions);
            setEditing(false);
          }}
          onDelete={() => {
            onRemove(entry.id);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

export function MealPlannerTab({
  clientId,
  initialEntries,
  recipes,
  readOnly,
  profile,
  programWeek,
  todayLogId,
}: {
  clientId: string;
  initialEntries: MealPlanEntryRow[];
  recipes: RecipeRow[];
  readOnly: boolean;
  profile: ClientProfileRow | null;
  programWeek: number;
  // Today's diary, so a planned meal can be copied into it. Null for a coach's read-only view.
  todayLogId: string | null;
}) {
  const router = useRouter();
  const { run } = useAction();
  const { run: runRecipe } = useAction();
  const { run: runUpdate } = useAction();
  const { run: runLog, busy: logging } = useAction();
  const { favorites, recentlyLogged, favoriteIds, toggleFavorite } = useFoodShortcuts(clientId, !readOnly);
  const [addFoodSection, setAddFoodSection] = useState<{ key: MealPlanSection; label: string } | null>(null);

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  async function handleAdd(section: MealPlanSection, food: FoodRow, portions: number) {
    await run(() => addMealPlanEntry(clientId, section, food.id, portions), { success: `${food.name} added` });
  }

  const scan = useBarcodeAdd(async (food, portions, target) => {
    const section = SECTIONS.find((x) => x.label === target?.label);
    if (section) await addMealPlanEntry(clientId, section.key, food.id, portions);
    router.refresh();
  });

  async function handleAddRecipe(section: MealPlanSection, recipeId: string, servings: number) {
    const recipe = recipes.find((r) => r.id === recipeId);
    await runRecipe(() => addRecipeToMealPlan(clientId, section, recipeId, servings), {
      success: recipe ? `${recipe.name} added` : 'Recipe added',
    });
  }

  async function handleRemove(id: string) {
    await run(() => removeMealPlanEntry(id), { success: 'Removed' });
  }

  async function handleUpdatePortions(id: string, portions: number) {
    await runUpdate(() => updateMealPlanEntryPortions(id, portions), { success: 'Updated' });
  }

  async function handleLog(sectionKey: MealPlanSection | 'all', label: string) {
    if (!todayLogId) return;
    await runLog(() => logPlanToDiary(clientId, todayLogId, sectionKey), {
      success: sectionKey === 'all' ? "Plan added to today's diary" : `${label} added to today's diary`,
    });
  }

  const dayTotals = totalMacros(initialEntries);
  const canLog = !readOnly && !!todayLogId;

  return (
    <div className="space-y-4">
      <NutritionSummary totals={dayTotals} target={dayTarget} title={readOnly ? "Their typical day" : "Your typical day"} dateLabel={readOnly ? "vs their daily target" : "vs your daily target"} />

      {canLog && initialEntries.length > 0 && (
        <button
          type="button"
          disabled={logging}
          onClick={() => handleLog('all', 'Plan')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-60"
        >
          <NotebookPen className="h-4 w-4" /> Add the whole plan to today&apos;s diary
        </button>
      )}

      {!readOnly && <div className="space-y-2">{scan.panel}</div>}

      {SECTIONS.map(({ key, label }) => {
        const entries = initialEntries.filter((e) => e.section === key);
        const sectionKcal = totalMacros(entries).calories;
        return (
          <div key={key} className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-bold text-black dark:text-zinc-50">{label}</h4>
              {entries.length > 0 && <span className="text-sm text-zinc-500">{Math.round(sectionKcal)} kcal</span>}
            </div>
            <ul className="mt-1 divide-y divide-black/5 dark:divide-white/5">
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} readOnly={readOnly} onRemove={handleRemove} onUpdatePortions={handleUpdatePortions} />
              ))}
              {entries.length === 0 && (
                <li>
                  <EmptyState compact title="Nothing planned yet" />
                </li>
              )}
            </ul>
            {!readOnly && (
              <div className="mt-3 space-y-2">
                <AddFoodButtons
                  onAdd={() => setAddFoodSection({ key, label })}
                  onScan={() => scan.start({ id: key, label })}
                  scanLabel={`Scan a barcode into ${label}`}
                />
                {canLog && entries.length > 0 && (
                  <button
                    type="button"
                    disabled={logging}
                    onClick={() => handleLog(key, label)}
                    className="w-full rounded-full border border-black/10 py-2 text-xs font-bold text-zinc-600 disabled:opacity-60 dark:border-white/15 dark:text-zinc-300"
                  >
                    Add {label} to today&apos;s diary
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {addFoodSection && (
        <AddFoodSheet
          sectionLabel={addFoodSection.label}
          onAdd={(food, portions) => handleAdd(addFoodSection.key, food, portions)}
          recipes={recipes}
          onAddRecipe={(recipeId, servings) => handleAddRecipe(addFoodSection.key, recipeId, servings)}
          favorites={favorites}
          recentlyLogged={recentlyLogged}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onClose={() => setAddFoodSection(null)}
        />
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { addMealPlanEntry, removeMealPlanEntry, updateMealPlanEntryPortions } from '@/lib/data/mealPlan';
import { addRecipeToMealPlan } from '@/lib/data/recipes';
import { entryMacros, totalMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import type { MealPlanEntryRow, MealPlanSection, FoodRow, RecipeRow } from '@/lib/data/types';

const SECTIONS: { key: MealPlanSection; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'mid_morning_snack', label: 'Mid-Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'evening_snack', label: 'Evening Snack' },
];

// Tap a planned entry to correct its quantity or delete it, matching the shared bottom-sheet
// edit pattern used by Food Tracking, instead of only ever having a bare "Remove" button.
function EditEntrySheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: MealPlanEntryRow;
  onClose: () => void;
  onSave: (portions: number) => void;
  onDelete: () => void;
}) {
  const [portions, setPortions] = useState(entry.portions);
  const unitLabel = entry.food?.portion === '1 gram' ? 'Grams' : `× ${entry.food?.portion ?? 'portion'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit planned food"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">{entry.food?.name ?? 'Unknown food'}</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Quantity ({unitLabel})</label>
          <input
            type="number"
            min={0}
            step="any"
            autoFocus
            value={portions}
            onChange={(e) => setPortions(Number(e.target.value))}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => onSave(portions)} disabled={portions <= 0}>
            Save
          </Button>
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

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
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm disabled:cursor-default"
      >
        <span className="truncate text-black dark:text-zinc-50">{entry.food?.name ?? 'Unknown food'}</span>
        <span className="shrink-0 text-zinc-500">{Math.round(macros.calories)} kcal</span>
      </button>
      {editing && !readOnly && (
        <EditEntrySheet
          entry={entry}
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
}: {
  clientId: string;
  initialEntries: MealPlanEntryRow[];
  recipes: RecipeRow[];
  readOnly: boolean;
}) {
  const { run } = useAction();
  const { run: runRecipe } = useAction();
  const { run: runUpdate } = useAction();
  const [addFoodSection, setAddFoodSection] = useState<{ key: MealPlanSection; label: string } | null>(null);

  async function handleAdd(section: MealPlanSection, food: FoodRow, portions: number) {
    await run(() => addMealPlanEntry(clientId, section, food.id, portions), { success: `${food.name} added` });
  }

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

  const dayTotals = totalMacros(initialEntries);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <h3 className="text-sm text-zinc-500">Typical day totals</h3>
        <p className="text-2xl font-bold text-black dark:text-zinc-50">{Math.round(dayTotals.calories).toLocaleString()} kcal</p>
      </div>

      {SECTIONS.map(({ key, label }) => {
        const entries = initialEntries.filter((e) => e.section === key);
        return (
          <div key={key} className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <h4 className="font-medium text-black dark:text-zinc-50">{label}</h4>
            <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
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
              <button
                type="button"
                onClick={() => setAddFoodSection({ key, label })}
                className="mt-2 text-sm font-medium text-accent hover:underline"
              >
                + Add food
              </button>
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
          onClose={() => setAddFoodSection(null)}
        />
      )}
    </div>
  );
}

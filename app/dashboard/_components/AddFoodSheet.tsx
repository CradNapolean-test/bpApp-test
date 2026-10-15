'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { FoodSearchPicker } from './FoodSearchPicker';
import { useBackHandler } from '@/app/_components/useBackHandler';
import type { FoodRow, RecipeRow } from '@/lib/data/types';

// Bottom-sheet "Add food" modal -- shared by the Nutrition header's "Search foods" button and
// every meal section's own "+ Add food" button, matching the prototype's single shared sheet
// (addFoodModal) rather than an always-visible inline search panel per section.
export function AddFoodSheet({
  sectionLabel,
  onAdd,
  recipes,
  onAddRecipe,
  onAddQuickAdd,
  favorites,
  recentlyLogged,
  favoriteIds,
  onToggleFavorite,
  onClose,
}: {
  sectionLabel: string;
  // These return whether the add worked (or nothing, which counts as worked). The sheet closes only on success, so a failed add keeps
  // what was typed (FS5).
  onAdd: (food: FoodRow, portions: number) => unknown;
  recipes?: RecipeRow[];
  onAddRecipe?: (recipeId: string, servings: number) => unknown;
  onAddQuickAdd?: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => unknown;
  favorites?: FoodRow[];
  recentlyLogged?: FoodRow[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
  onClose: () => void;
}) {
  useBackHandler(true, onClose);
  const [busy, setBusy] = useState(false);
  // Runs the add, shows that it is working (no second tap), and closes only if it did not fail.
  async function finish(add: () => unknown) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await add();
      if (result !== false) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add food · ${sectionLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-black dark:text-zinc-50">Add food &middot; {sectionLabel}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div aria-busy={busy} className={busy ? 'pointer-events-none opacity-60' : undefined}>
          <FoodSearchPicker
            onAdd={(food, portions) => finish(() => onAdd(food, portions))}
            recipes={recipes}
            onAddRecipe={onAddRecipe ? (recipeId, servings) => finish(() => onAddRecipe(recipeId, servings)) : undefined}
            onAddQuickAdd={onAddQuickAdd ? (fields) => finish(() => onAddQuickAdd(fields)) : undefined}
            favorites={favorites}
            recentlyLogged={recentlyLogged}
            favoriteIds={favoriteIds}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { X } from 'lucide-react';
import { FoodSearchPicker } from './FoodSearchPicker';
import type { FoodRow, RecipeRow } from '@/lib/data/types';

// Bottom-sheet "Add food" modal -- shared by the Nutrition header's "Search foods" button and
// every meal section's own "+ Add food" button, matching the prototype's single shared sheet
// (addFoodModal) rather than an always-visible inline search panel per section.
export function AddFoodSheet({
  sectionLabel,
  onAdd,
  recipes,
  onAddRecipe,
  onClose,
}: {
  sectionLabel: string;
  onAdd: (food: FoodRow, portions: number) => void;
  recipes?: RecipeRow[];
  onAddRecipe?: (recipeId: string, servings: number) => void;
  onClose: () => void;
}) {
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
        <FoodSearchPicker
          onAdd={(food, portions) => {
            onAdd(food, portions);
            onClose();
          }}
          recipes={recipes}
          onAddRecipe={
            onAddRecipe
              ? (recipeId, servings) => {
                  onAddRecipe(recipeId, servings);
                  onClose();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

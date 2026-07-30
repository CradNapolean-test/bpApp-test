'use client';

import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addRecipeIngredient, createRecipe, deleteRecipe, removeRecipeIngredient } from '@/lib/data/recipes';
import { FoodSearchPicker } from './FoodSearchPicker';
import type { FoodRow, RecipeWithIngredients } from '@/lib/data/types';

export function RecipesTab({
  clientId,
  initialRecipes,
  readOnly,
}: {
  clientId: string;
  initialRecipes: RecipeWithIngredients[];
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const [name, setName] = useState('');
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createRecipe(clientId, name), { success: 'Recipe created', onDone: () => setName('') });
  }

  async function handleDelete(id: string, recipeName: string) {
    const ok = await confirm({
      title: `Delete “${recipeName}”?`,
      body: 'This removes the recipe and its ingredient list. It does not affect anything already logged.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteRecipe(id), {
      success: 'Recipe deleted',
      onDone: () => setOpenRecipeId((cur) => (cur === id ? null : cur)),
    });
  }

  async function handleAddIngredient(recipeId: string, food: FoodRow, portions: number) {
    await runMutate(() => addRecipeIngredient(recipeId, food.id, portions), { success: `${food.name} added` });
  }

  async function handleRemoveIngredient(id: string) {
    await runMutate(() => removeRecipeIngredient(id), { success: 'Ingredient removed' });
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <form onSubmit={handleCreate} className="flex items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-zinc-500">New recipe name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Protein overnight oats"
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create recipe'}
          </button>
        </form>
      )}

      {initialRecipes.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="No recipes yet"
          hint={
            readOnly
              ? 'Your client hasn’t saved any recipes yet.'
              : 'Build a recipe once, then log or plan the whole thing in a couple of taps.'
          }
        />
      ) : (
        <div className="space-y-3">
          {initialRecipes.map((recipe) => {
            const open = openRecipeId === recipe.id;
            return (
              <div key={recipe.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setOpenRecipeId(open ? null : recipe.id)}
                    className="text-left font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {recipe.name}
                  </button>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(recipe.id, recipe.name)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/5">
                  {recipe.recipe_ingredients.map((ing) => (
                    <li key={ing.id} className="flex items-center justify-between py-1.5">
                      <span>
                        {ing.food?.name ?? 'Unknown food'}{' '}
                        <span className="text-zinc-500">
                          {ing.food?.portion === '1 gram' ? `${ing.portions}g` : `${ing.portions}× ${ing.food?.portion ?? ''}`}
                        </span>
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => handleRemoveIngredient(ing.id)}
                          className="text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {recipe.recipe_ingredients.length === 0 && (
                    <li className="py-1.5 text-zinc-500">No ingredients yet.</li>
                  )}
                </ul>

                {open && !readOnly && (
                  <div className="mt-3">
                    <FoodSearchPicker onAdd={(food, portions) => handleAddIngredient(recipe.id, food, portions)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

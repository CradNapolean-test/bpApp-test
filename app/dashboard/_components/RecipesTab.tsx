'use client';

import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addRecipeIngredient,
  createRecipe,
  deleteRecipe,
  removeRecipeIngredient,
  updateRecipeServings,
} from '@/lib/data/recipes';
import { totalRecipeMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import type { FoodRow, RecipeWithIngredients } from '@/lib/data/types';

function ServingsInput({ recipeId, initial }: { recipeId: string; initial: number }) {
  const { run } = useAction();
  const [value, setValue] = useState(String(initial));

  async function handleBlur() {
    const parsed = Math.max(1, Number(value) || 1);
    setValue(String(parsed));
    if (parsed === initial) return;
    await run(() => updateRecipeServings(recipeId, parsed));
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      Servings
      <input
        type="number"
        min={1}
        className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
    </label>
  );
}

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
  const [servings, setServings] = useState(1);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [addingRecipe, setAddingRecipe] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let newId: string | null = null;
    await runCreate(
      async () => {
        newId = await createRecipe(clientId, name, servings);
      },
      {
        success: 'Recipe created',
        onDone: () => {
          setName('');
          setServings(1);
          setAddingRecipe(false);
          // Jump straight to adding ingredients instead of leaving the coach to find and
          // click back into the recipe they just created.
          if (newId) setOpenRecipeId(newId);
        },
      }
    );
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
            const totals = totalRecipeMacros(recipe.recipe_ingredients);
            const servings = recipe.servings || 1;
            return (
              <div key={recipe.id} className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setOpenRecipeId(open ? null : recipe.id);
                      setAddingIngredient(false);
                    }}
                    className="text-left text-base font-bold text-black hover:underline dark:text-zinc-50"
                  >
                    {recipe.name}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {!readOnly ? (
                      <ServingsInput recipeId={recipe.id} initial={servings} />
                    ) : (
                      <span className="text-xs text-zinc-500">{servings} serving{servings === 1 ? '' : 's'}</span>
                    )}
                    {!readOnly && (
                      <Button variant="danger" size="sm" onClick={() => handleDelete(recipe.id, recipe.name)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {recipe.recipe_ingredients.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">Per serving: {Math.round(totals.calories / servings)} kcal</p>
                )}
                <p className="mt-0.5 text-xs text-zinc-400">
                  {recipe.recipe_ingredients.length} ingredient{recipe.recipe_ingredients.length === 1 ? '' : 's'}
                </p>

                {open && (
                  <>
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
                            <Button variant="danger" size="sm" onClick={() => handleRemoveIngredient(ing.id)}>
                              Remove
                            </Button>
                          )}
                        </li>
                      ))}
                      {recipe.recipe_ingredients.length === 0 && (
                        <li className="py-1.5 text-zinc-500">No ingredients yet.</li>
                      )}
                    </ul>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAddingIngredient(true)}>
                        + Add ingredient
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly &&
        (addingRecipe ? (
          <form onSubmit={handleCreate} className="flex items-end gap-2 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-zinc-500">Recipe name</label>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Protein overnight oats"
                className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-xs font-medium text-zinc-500">Servings</label>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              />
            </div>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Creating…' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAddingRecipe(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingRecipe(true)}
            className="w-full rounded-2xl border-[1.5px] border-dashed border-black/15 py-3 text-sm font-semibold text-zinc-500 dark:border-white/15"
          >
            + New recipe
          </button>
        ))}

      {openRecipeId && addingIngredient && (
        <AddFoodSheet
          sectionLabel={initialRecipes.find((r) => r.id === openRecipeId)?.name ?? 'Recipe'}
          onAdd={(food, portions) => handleAddIngredient(openRecipeId, food, portions)}
          onClose={() => setAddingIngredient(false)}
        />
      )}
    </div>
  );
}

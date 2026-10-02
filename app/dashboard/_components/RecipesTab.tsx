'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, ChevronDown, Trash2 } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addRecipeIngredient,
  createRecipe,
  deleteRecipe,
  removeRecipeIngredient,
  updateRecipeIngredientPortions,
  updateRecipeServings,
} from '@/lib/data/recipes';
import { entryMacros, totalRecipeMacros } from '@/lib/utils/foodTotals';
import { AddFoodSheet } from './AddFoodSheet';
import { AddFoodButtons, useBarcodeAdd, useFoodShortcuts } from './FoodEntryTools';
import { QuantitySheet } from './QuantitySheet';
import type { FoodRow, RecipeIngredientRow, RecipeWithIngredients } from '@/lib/data/types';

const MACRO_COLORS = { protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' };
const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10';

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
    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
      Makes
      <input
        type="number"
        inputMode="numeric"
        min={1}
        className="w-16 rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-center text-sm dark:border-white/10"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
      serving{initial === 1 ? '' : 's'}
    </label>
  );
}

const amountLabel = (ing: RecipeIngredientRow) =>
  ing.food?.portion === '1 gram' ? `${Math.round(ing.portions * 10) / 10}g` : `${Math.round(ing.portions * 100) / 100}× ${ing.food?.portion ?? ''}`;

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
  const router = useRouter();
  const { favorites, recentlyLogged, favoriteIds, toggleFavorite } = useFoodShortcuts(clientId, !readOnly);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<RecipeIngredientRow | null>(null);
  const [addingRecipe, setAddingRecipe] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let newId: string | null = null;
    await runCreate(
      async () => {
        newId = await createRecipe(clientId, name, Math.max(1, Number(servings) || 1));
      },
      {
        success: 'Recipe created',
        onDone: () => {
          setName('');
          setServings('1');
          setAddingRecipe(false);
          // Jump straight to adding ingredients instead of leaving the member to find and
          // click back into the recipe they just created.
          if (newId) {
            setOpenRecipeId(newId);
            setAddingIngredient(true);
          }
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

  const scan = useBarcodeAdd(async (food, portions, target) => {
    if (target?.id) await addRecipeIngredient(target.id, food.id, portions);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      {!readOnly && <div className="space-y-2">{scan.panel}</div>}
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
            const per = recipe.servings || 1;
            const count = recipe.recipe_ingredients.length;
            return (
              <div key={recipe.id} className="rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setOpenRecipeId(open ? null : recipe.id);
                    setAddingIngredient(false);
                  }}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-black dark:text-zinc-50">{recipe.name}</p>
                    {count > 0 ? (
                      <>
                        <p className="mt-0.5 text-sm font-bold text-black dark:text-zinc-50">
                          {Math.round(totals.calories / per)} <span className="text-xs font-semibold text-zinc-500">kcal per serving</span>
                        </p>
                        <p className="text-xs font-semibold">
                          <span style={{ color: MACRO_COLORS.protein }}>P {Math.round(totals.protein / per)}g</span>{' · '}
                          <span style={{ color: MACRO_COLORS.carbs }}>C {Math.round(totals.carbs / per)}g</span>{' · '}
                          <span style={{ color: MACRO_COLORS.fat }}>F {Math.round(totals.fat / per)}g</span>
                        </p>
                      </>
                    ) : (
                      <p className="mt-0.5 text-xs text-zinc-500">No ingredients yet</p>
                    )}
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {count} ingredient{count === 1 ? '' : 's'} · makes {per} serving{per === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="border-t border-black/[.05] px-4 pb-4 dark:border-white/10">
                    <ul className="divide-y divide-black/5 dark:divide-white/5">
                      {recipe.recipe_ingredients.map((ing) => (
                        <li key={ing.id}>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setEditingIngredient(ing)}
                            className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-default"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{ing.food?.name ?? 'Unknown food'}</span>
                              <span className="block text-xs text-zinc-500">{amountLabel(ing)}</span>
                            </span>
                            <span className="shrink-0 text-sm text-zinc-500">{Math.round(entryMacros(ing).calories)} kcal</span>
                          </button>
                        </li>
                      ))}
                      {count === 0 && <li className="py-2.5 text-sm text-zinc-500">Add the first ingredient to see the calories.</li>}
                    </ul>
                    {!readOnly && (
                      <div className="mt-2 space-y-3">
                        <AddFoodButtons
                          label="Add ingredient"
                          onAdd={() => setAddingIngredient(true)}
                          onScan={() => scan.start({ id: recipe.id, label: recipe.name })}
                          scanLabel={`Scan a barcode into ${recipe.name}`}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <ServingsInput recipeId={recipe.id} initial={per} />
                          <button
                            type="button"
                            aria-label="Delete recipe"
                            onClick={() => handleDelete(recipe.id, recipe.name)}
                            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-danger"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly &&
        (addingRecipe ? (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">Recipe name</label>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Protein overnight oats"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500">How many servings does it make?</label>
              <input type="number" inputMode="numeric" min={1} value={servings} onChange={(e) => setServings(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-extrabold text-accent-foreground disabled:opacity-50">
                {creating ? 'Creating…' : 'Create & add ingredients'}
              </button>
              <button type="button" onClick={() => setAddingRecipe(false)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-zinc-500">
                Cancel
              </button>
            </div>
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
          favorites={favorites}
          recentlyLogged={recentlyLogged}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onClose={() => setAddingIngredient(false)}
        />
      )}

      {editingIngredient && (
        <QuantitySheet
          title={editingIngredient.food?.name ?? 'Ingredient'}
          unitLabel={editingIngredient.food?.portion === '1 gram' ? 'grams' : `× ${editingIngredient.food?.portion ?? 'portion'}`}
          initial={editingIngredient.portions}
          onClose={() => setEditingIngredient(null)}
          onSave={(portions) => {
            const id = editingIngredient.id;
            setEditingIngredient(null);
            runMutate(() => updateRecipeIngredientPortions(id, portions), { success: 'Updated' });
          }}
          onDelete={() => {
            const id = editingIngredient.id;
            setEditingIngredient(null);
            runMutate(() => removeRecipeIngredient(id), { success: 'Ingredient removed' });
          }}
        />
      )}
    </div>
  );
}

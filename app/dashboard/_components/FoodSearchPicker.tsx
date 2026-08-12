'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { searchFoods } from '@/lib/data/foods';
import { dayCalories } from '@/lib/calculations';
import type { FoodRow, RecipeRow } from '@/lib/data/types';

const GRAM_PRESETS = [50, 100, 150, 200];
const UNIT_PRESETS = [0.5, 1, 2, 3];

export function FoodSearchPicker({
  onAdd,
  recipes,
  onAddRecipe,
}: {
  onAdd: (food: FoodRow, grams: number) => void;
  // When provided (even empty), a "Foods / Recipes" toggle appears so the same picker can
  // fan a saved recipe out into diary/meal-plan entries instead of one food at a time.
  recipes?: RecipeRow[];
  onAddRecipe?: (recipeId: string, servings: number) => void;
}) {
  const [mode, setMode] = useState<'foods' | 'recipes'>('foods');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodRow[]>([]);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [servings, setServings] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();

  function handleQueryChange(value: string) {
    setQuery(value);
    startTransition(async () => {
      const foods = await searchFoods(value);
      setResults(foods);
    });
  }

  if (recipes && mode === 'recipes') {
    return (
      <div className="rounded-2xl border border-black/[.05] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(['foods', 'recipes'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <ul className="mt-2 max-h-64 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {recipes.map((recipe) => {
            const s = servings[recipe.id] ?? 1;
            return (
              <li key={recipe.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-black dark:text-zinc-50">{recipe.name}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={s}
                    onChange={(e) => setServings((v) => ({ ...v, [recipe.id]: Number(e.target.value) }))}
                    aria-label="Servings"
                    className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
                  />
                  <span className="text-xs text-zinc-500">servings</span>
                  <Button variant="primary" size="sm" onClick={() => onAddRecipe?.(recipe.id, s)}>
                    Add
                  </Button>
                </div>
              </li>
            );
          })}
          {recipes.length === 0 && <EmptyState compact title="No recipes yet — build one under Recipes." />}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      {recipes && (
        <div className="mb-2 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {(['foods', 'recipes'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder="Search foods…"
        className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => query === '' && handleQueryChange('')}
      />
      {isPending && <p className="mt-2 text-xs text-zinc-500">Searching…</p>}
      <ul className="mt-2 max-h-80 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
        {results.map((food) => {
          // Most foods are stored per-1g (see docs/PROJECT_SPEC.md food data notes), so the
          // quantity field means grams and defaults to a plausible serving. A handful of
          // foods without a known gram weight (e.g. "1 Egg") keep their original per-unit
          // values, so the field means a count of that unit instead.
          const isPerGram = food.portion === '1 gram';
          const defaultQty = isPerGram ? 100 : 1;
          const step = isPerGram ? 5 : 0.25;
          const min = isPerGram ? 5 : 0.25;
          const qty = grams[food.id] ?? defaultQty;
          const presets = isPerGram ? GRAM_PRESETS : UNIT_PRESETS;

          function setQty(value: number) {
            setGrams((g) => ({ ...g, [food.id]: Math.max(min, value) }));
          }

          const protein = food.protein * qty;
          const carbs = food.carbs * qty;
          const fat = food.fat * qty;
          const calories = dayCalories(protein, carbs, fat);

          return (
            <li key={food.id} className="space-y-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium text-black dark:text-zinc-50">{food.name}</p>
                  <p className="text-xs text-zinc-500">per {food.portion}</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => onAdd(food, qty)}>
                  Add
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => setQty(p)}
                    className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      qty === p
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
                    }`}
                  >
                    {isPerGram ? `${p}g` : `${p}×`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setQty(qty - step)} aria-label="Decrease quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
                  −
                </Button>
                <input
                  type="number"
                  min={min}
                  step={step}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  aria-label={isPerGram ? 'Grams' : 'Quantity'}
                  className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
                />
                <Button variant="outline" size="sm" onClick={() => setQty(qty + step)} aria-label="Increase quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
                  +
                </Button>
                {isPerGram && <span className="text-xs text-zinc-500">g</span>}
                <span className="ml-1 text-xs text-zinc-500">
                  {Math.round(calories)} kcal · {Math.round(protein)}P / {Math.round(carbs)}C / {Math.round(fat)}F
                </span>
              </div>
            </li>
          );
        })}
        {!isPending && results.length === 0 && (
          <li>
            <EmptyState compact title={query ? `No results for "${query}"` : 'Start typing to search foods'} />
          </li>
        )}
      </ul>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { searchFoods } from '@/lib/data/foods';
import { dayCalories } from '@/lib/calculations';
import type { FoodRow, RecipeRow } from '@/lib/data/types';

const GRAM_PRESETS = [50, 100, 150, 200];
const UNIT_PRESETS = [0.5, 1, 2, 3];

// Shared by the search-results list and the Favorites/Recently Logged lists shown before a
// query is typed -- same grams/units quantity picker either way, just a different source list.
function FoodResultRow({
  food,
  qty,
  onQtyChange,
  onAdd,
  isFavorite,
  onToggleFavorite,
}: {
  food: FoodRow;
  qty: number;
  onQtyChange: (value: number) => void;
  onAdd: (food: FoodRow, qty: number) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
}) {
  // Most foods are stored per-1g (see docs/PROJECT_SPEC.md food data notes), so the quantity
  // field means grams and defaults to a plausible serving. A handful of foods without a known
  // gram weight (e.g. "1 Egg") keep their original per-unit values, so the field means a count
  // of that unit instead.
  const isPerGram = food.portion === '1 gram';
  const step = isPerGram ? 5 : 0.25;
  const min = isPerGram ? 5 : 0.25;
  const presets = isPerGram ? GRAM_PRESETS : UNIT_PRESETS;

  const protein = food.protein * qty;
  const carbs = food.carbs * qty;
  const fat = food.fat * qty;
  const calories = dayCalories(protein, carbs, fat);

  return (
    <li className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(food, !isFavorite)}
              aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
              className="shrink-0 text-zinc-400 hover:text-amber-500"
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-black dark:text-zinc-50">{food.name}</p>
            <p className="text-xs text-zinc-500">per {food.portion}</p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => onAdd(food, qty)}>
          Add
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onQtyChange(p)}
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
        <Button variant="outline" size="sm" onClick={() => onQtyChange(qty - step)} aria-label="Decrease quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
          −
        </Button>
        <input
          type="number"
          min={min}
          step={step}
          value={qty}
          onChange={(e) => onQtyChange(Number(e.target.value))}
          aria-label={isPerGram ? 'Grams' : 'Quantity'}
          className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm dark:border-white/10"
        />
        <Button variant="outline" size="sm" onClick={() => onQtyChange(qty + step)} aria-label="Increase quantity" className="!p-0 flex h-8 w-8 items-center justify-center">
          +
        </Button>
        {isPerGram && <span className="text-xs text-zinc-500">g</span>}
        <span className="ml-1 text-xs text-zinc-500">
          {Math.round(calories)} kcal · {Math.round(protein)}P / {Math.round(carbs)}C / {Math.round(fat)}F
        </span>
      </div>
    </li>
  );
}

function QuickAddForm({ onAdd }: { onAdd: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => void }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10';
  const canSubmit = name.trim() && (calories || protein || carbs || fat);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd({
      name: name.trim(),
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
      carbs: carbs === '' ? null : Number(carbs),
      fat: fat === '' ? null : Number(fat),
    });
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-black/[.05] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <p className="mb-2 text-xs text-zinc-500">
        For something not in the food database — a restaurant meal, an estimate. Calories or macros (whatever you know).
      </p>
      <div className="space-y-2">
        <input type="text" placeholder="What is it?" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <input type="number" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} className={inputCls} />
          <input type="number" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} className={inputCls} />
          <input type="number" placeholder="carbs g" value={carbs} onChange={(e) => setCarbs(e.target.value)} className={inputCls} />
          <input type="number" placeholder="fat g" value={fat} onChange={(e) => setFat(e.target.value)} className={inputCls} />
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          Add
        </Button>
      </div>
    </form>
  );
}

export function FoodSearchPicker({
  onAdd,
  recipes,
  onAddRecipe,
  onAddQuickAdd,
  favorites,
  recentlyLogged,
  favoriteIds,
  onToggleFavorite,
}: {
  onAdd: (food: FoodRow, grams: number) => void;
  // When provided (even empty), a "Foods / Recipes" toggle appears so the same picker can
  // fan a saved recipe out into diary/meal-plan entries instead of one food at a time.
  recipes?: RecipeRow[];
  onAddRecipe?: (recipeId: string, servings: number) => void;
  // Quick Add tab only appears when provided -- the Meal Planner also uses this picker (no
  // "date-specific logging" concept there, so quick-add wouldn't make sense) while Food
  // Tracking does.
  onAddQuickAdd?: (fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) => void;
  // Favorites/Recently Logged only appear (before a query is typed) when provided -- same
  // "Meal Planner has no per-client favoriting concept wired up" reasoning as Quick Add above.
  favorites?: FoodRow[];
  recentlyLogged?: FoodRow[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (food: FoodRow, isFavorite: boolean) => void;
}) {
  const [mode, setMode] = useState<'foods' | 'recipes' | 'quick_add'>('foods');
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

  const modes: ('foods' | 'recipes' | 'quick_add')[] = [
    'foods',
    ...(recipes ? (['recipes'] as const) : []),
    ...(onAddQuickAdd ? (['quick_add'] as const) : []),
  ];

  if (onAddQuickAdd && mode === 'quick_add') {
    return (
      <div className="space-y-2">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
            </button>
          ))}
        </div>
        <QuickAddForm onAdd={onAddQuickAdd} />
      </div>
    );
  }

  if (recipes && mode === 'recipes') {
    return (
      <div className="rounded-2xl border border-black/[.05] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
        <div className="flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
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
      {modes.length > 1 && (
        <div className="mb-2 flex gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                mode === m ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50' : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
              }`}
            >
              {m === 'quick_add' ? 'Quick Add' : m}
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

      {query === '' && !isPending && results.length === 0 && ((favorites && favorites.length > 0) || (recentlyLogged && recentlyLogged.length > 0)) ? (
        <div className="mt-2 max-h-80 space-y-3 overflow-y-auto">
          {favorites && favorites.length > 0 && (
            <div>
              <p className="px-0.5 text-xs font-semibold text-zinc-500">Favorites</p>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {favorites.map((food) => (
                  <FoodResultRow
                    key={food.id}
                    food={food}
                    qty={grams[food.id] ?? (food.portion === '1 gram' ? 100 : 1)}
                    onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(food.portion === '1 gram' ? 5 : 0.25, v) }))}
                    onAdd={onAdd}
                    isFavorite={favoriteIds?.has(food.id) ?? true}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </ul>
            </div>
          )}
          {recentlyLogged && recentlyLogged.length > 0 && (
            <div>
              <p className="px-0.5 text-xs font-semibold text-zinc-500">Recently logged</p>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {recentlyLogged.map((food) => (
                  <FoodResultRow
                    key={food.id}
                    food={food}
                    qty={grams[food.id] ?? (food.portion === '1 gram' ? 100 : 1)}
                    onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(food.portion === '1 gram' ? 5 : 0.25, v) }))}
                    onAdd={onAdd}
                    isFavorite={favoriteIds?.has(food.id) ?? false}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
          {results.map((food) => (
            <FoodResultRow
              key={food.id}
              food={food}
              qty={grams[food.id] ?? (food.portion === '1 gram' ? 100 : 1)}
              onQtyChange={(v) => setGrams((g) => ({ ...g, [food.id]: Math.max(food.portion === '1 gram' ? 5 : 0.25, v) }))}
              onAdd={onAdd}
              isFavorite={favoriteIds?.has(food.id) ?? false}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
          {!isPending && results.length === 0 && (
            <li>
              <EmptyState compact title={query ? `No results for "${query}"` : 'Start typing to search foods'} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

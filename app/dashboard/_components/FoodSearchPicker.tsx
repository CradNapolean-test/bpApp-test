'use client';

import { useState, useTransition } from 'react';
import { searchFoods } from '@/lib/data/foods';
import type { FoodRow } from '@/lib/data/types';

export function FoodSearchPicker({ onAdd }: { onAdd: (food: FoodRow, portions: number) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodRow[]>([]);
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();

  function handleQueryChange(value: string) {
    setQuery(value);
    startTransition(async () => {
      const foods = await searchFoods(value);
      setResults(foods);
    });
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <input
        type="text"
        placeholder="Search foods…"
        className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => query === '' && handleQueryChange('')}
      />
      {isPending && <p className="mt-2 text-xs text-zinc-500">Searching…</p>}
      <ul className="mt-2 max-h-64 divide-y divide-black/5 overflow-y-auto dark:divide-white/5">
        {results.map((food) => (
          <li key={food.id} className="flex items-center justify-between gap-2 py-2">
            <div className="text-sm">
              <p className="font-medium text-black dark:text-zinc-50">{food.name}</p>
              <p className="text-xs text-zinc-500">
                {food.portion} · {food.protein}P / {food.carbs}C / {food.fat}F
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={portions[food.id] ?? 1}
                onChange={(e) =>
                  setPortions({ ...portions, [food.id]: Number(e.target.value) })
                }
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
              />
              <button
                onClick={() => onAdd(food, portions[food.id] ?? 1)}
                className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background"
              >
                Add
              </button>
            </div>
          </li>
        ))}
        {!isPending && results.length === 0 && (
          <li className="py-2 text-sm text-zinc-500">No results.</li>
        )}
      </ul>
    </div>
  );
}

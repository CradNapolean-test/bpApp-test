'use client';

import { X } from 'lucide-react';
import { formatQuantity } from '@/lib/utils/foodTotals';
import type { PairSuggestion } from '@/lib/foodPairs';

// Shown under a meal just after a food is added to it: the foods this member usually has with it, each at the amount they usually have.
// One tap adds it; nothing is added unasked. It goes away when dismissed, when the day changes, or when there is nothing left to offer.
export function PairSuggestions({
  basedOn,
  suggestions,
  onAdd,
  onDismiss,
}: {
  basedOn: string;
  suggestions: PairSuggestion[];
  // Resolves to whether the add worked; the row stays either way so the member can carry on.
  onAdd: (suggestion: PairSuggestion) => unknown;
  onDismiss: () => void;
}) {
  return (
    <div role="group" aria-label={`Usually with ${basedOn}`} className="mt-3 rounded-xl bg-accent-soft px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-zinc-600 dark:text-zinc-300">
          Usually with <b className="font-bold text-black dark:text-zinc-50">{basedOn}</b>
        </p>
        <button
          type="button"
          aria-label="Dismiss suggestions"
          onClick={onDismiss}
          className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.food.id}
            type="button"
            onClick={() => onAdd(s)}
            className="flex max-w-full items-center gap-1 rounded-full border border-accent/30 bg-[var(--background)] px-3 py-2 text-xs font-semibold text-accent"
          >
            <span aria-hidden>+</span>
            <span className="truncate">{s.food.name}</span>
            <span className="shrink-0 font-normal text-zinc-500">· {formatQuantity({ portions: s.portions, food: s.food })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

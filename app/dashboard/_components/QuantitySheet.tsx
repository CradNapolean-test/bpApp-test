'use client';

import { useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { checkFoodNumber, type FoodField } from '@/lib/foodLimits';
import { countFromGrams, gramsFromCount } from '@/lib/utils/foodUnits';

// Change how much of a food (or ingredient) there is, or remove it. The box can be emptied while
// typing (counts as 0) and shows the real number again when you tap away, so a number starting
// with 1 can be typed freely.
export function QuantitySheet({
  title,
  unitLabel,
  initial,
  onSave,
  onDelete,
  onClose,
  limit = 'grams',
  serving,
}: {
  title: string;
  unitLabel: string;
  initial: number;
  onSave: (value: number) => void;
  onDelete?: () => void;
  onClose: () => void;
  // Which ceiling applies: grams (2,000) or portions (50). The database limits are the backstop (FT9).
  limit?: Extract<FoodField, 'grams' | 'portions'>;
  // A serving the food comes with (the pack's): when given, the box counts servings of it, with a switch to grams. The value stays grams.
  serving?: { label: string; grams: number };
}) {
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const [byServing, setByServing] = useState(serving != null);
  const problem = checkFoodNumber(value, limit);
  const counting = serving != null && byServing;
  const shown = counting ? countFromGrams(value, serving) : value;

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1">
          {serving && (
            <div className="flex gap-1.5 pb-1">
              {[true, false].map((by) => (
                <button
                  key={String(by)}
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setByServing(by);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    byServing === by ? 'border-accent bg-accent-soft text-accent' : 'border-black/10 text-zinc-500 dark:border-white/10'
                  }`}
                >
                  {by ? `${serving.label} (${serving.grams} g)` : 'grams'}
                </button>
              ))}
            </div>
          )}
          <label className="text-xs font-semibold text-zinc-500">{counting ? `Servings of ${serving.label} (${serving.grams} g each)` : `Quantity (${unitLabel})`}</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            autoFocus
            value={draft ?? String(shown)}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
              setValue(counting ? gramsFromCount(n, serving) : n);
            }}
            onBlur={() => setDraft(null)}
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-3 text-base dark:border-white/10"
          />
          {problem && <p className="text-xs font-semibold text-danger">{problem}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!(value > 0) || problem != null}
            onClick={() => onSave(value)}
            className="flex-1 rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-40"
          >
            Save
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="rounded-full border border-danger/30 px-5 py-3 text-sm font-bold text-danger">
              Remove
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

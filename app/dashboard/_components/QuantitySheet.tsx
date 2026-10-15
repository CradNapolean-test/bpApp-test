'use client';

import { useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { checkFoodNumber, type FoodField } from '@/lib/foodLimits';

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
}: {
  title: string;
  unitLabel: string;
  initial: number;
  onSave: (value: number) => void;
  onDelete?: () => void;
  onClose: () => void;
  // Which ceiling applies: grams (2,000) or portions (50). The database limits are the backstop (FT9).
  limit?: Extract<FoodField, 'grams' | 'portions'>;
}) {
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const problem = checkFoodNumber(value, limit);

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-500">Quantity ({unitLabel})</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            autoFocus
            value={draft ?? String(value)}
            onChange={(e) => {
              setDraft(e.target.value);
              setValue(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)));
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

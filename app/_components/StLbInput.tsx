'use client';

import { useState } from 'react';
import { parseStLb, sameWeightReading, stLbFields } from '@/lib/utils/weightUnits';

// Two boxes, stones and pounds, for a weight stored in kilograms (D16). `onChange` is called with kilograms only when the reading really
// changes, so a weight is never nudged by being converted back and forth; null when both boxes are emptied.
export function StLbInput({
  kg,
  onChange,
  label,
  inputClassName,
  disabled = false,
  showKg = false,
}: {
  kg: number | null;
  onChange: (kg: number | null) => void;
  // Names the boxes for a screen reader: "<label>, stones".
  label: string;
  inputClassName: string;
  disabled?: boolean;
  // The same weight in kilograms underneath (the coach's view).
  showKg?: boolean;
}) {
  const [draft, setDraft] = useState<{ st: string; lb: string; error: string | null } | null>(null);
  const shown = draft ?? { ...stLbFields(kg), error: null };

  function change(st: string, lb: string) {
    const parsed = parseStLb(st, lb);
    setDraft({ st, lb, error: parsed.ok ? null : parsed.error });
    if (parsed.ok && !sameWeightReading(kg, parsed.kg, 'st_lb')) onChange(parsed.kg);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          aria-label={`${label}, stones`}
          disabled={disabled}
          className={inputClassName}
          value={shown.st}
          onChange={(e) => change(e.target.value.replace(/[^0-9]/g, ''), shown.lb)}
        />
        <span className="text-sm font-bold text-zinc-500">st</span>
        <input
          type="text"
          inputMode="decimal"
          maxLength={4}
          aria-label={`${label}, pounds`}
          disabled={disabled}
          className={inputClassName}
          value={shown.lb}
          onChange={(e) => change(shown.st, e.target.value.replace(/[^0-9.,]/g, ''))}
        />
        <span className="text-sm font-bold text-zinc-500">lb</span>
      </div>
      {shown.error ? (
        <p className="text-xs font-semibold text-danger">{shown.error}</p>
      ) : (
        showKg && kg != null && kg > 0 && <p className="text-xs text-zinc-500">{kg.toFixed(1)} kg</p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { PROGRAM_WEEKDAYS, WEEKDAY_SHORT } from '@/lib/utils/dates';

// Mon-Sat chips; tap the chosen one again to clear it.
export function WeekdayChips({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROGRAM_WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(value === d ? null : d)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            value === d ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
          }`}
        >
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

// "Add a workout to this week": a name and, optionally, the weekday it falls on.
export function AddWorkoutSheet({
  title,
  defaultLabel,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  defaultLabel: string;
  busy: boolean;
  onSubmit: (label: string, weekday: number | null) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [weekday, setWeekday] = useState<number | null>(null);
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input
            autoFocus
            className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500">Day of the week (optional)</label>
          <WeekdayChips value={weekday} onChange={setWeekday} />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit(label.trim() || 'Workout', weekday)}
          className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add workout'}
        </button>
      </div>
    </BottomSheet>
  );
}

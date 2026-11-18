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
          className={`h-11 min-w-11 rounded-xl px-3 text-sm font-bold ${
            value === d ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
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
          className="h-12 w-full rounded-xl bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add workout'}
        </button>
      </div>
    </BottomSheet>
  );
}

// Rename a workout. A block usually repeats the same workout every week, so by default the new name is
// applied to the same workout in every week.
export function RenameWorkoutSheet({
  initial,
  otherWeeks,
  busy,
  onSubmit,
  onClose,
}: {
  initial: string;
  // How many other weeks have a workout with this name.
  otherWeeks: number;
  busy: boolean;
  onSubmit: (name: string, allWeeks: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [allWeeks, setAllWeeks] = useState(true);
  return (
    <BottomSheet title="Rename workout" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim(), allWeeks);
        }}
        className="space-y-4"
      >
        <input
          autoFocus
          required
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {otherWeeks > 0 && (
          <label className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={allWeeks} onChange={(e) => setAllWeeks(e.target.checked)} />
            Also rename it in the other {otherWeeks} week{otherWeeks === 1 ? '' : 's'}
          </label>
        )}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </BottomSheet>
  );
}

'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { MUSCLE_GROUPS } from '@/app/_components/workouts/muscleGroups';
import type { ExerciseLibraryRow } from '@/lib/data/types';

// First consumer of a modal overlay in this app besides ConfirmDialog -- mirrors its exact
// `fixed inset-0 z-50` + backdrop + centered panel pattern rather than introducing a separate
// visual language, but isn't extracted into a shared `Modal` primitive since there's only one
// caller today; extract if/when a second modal need shows up.
export function BrowseExercisesModal({
  library,
  onPick,
  onClose,
}: {
  library: ExerciseLibraryRow[];
  onPick: (entry: ExerciseLibraryRow) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const results = library.filter((e) => {
    const matchesQuery = query.trim() ? e.name.toLowerCase().includes(query.trim().toLowerCase()) : true;
    const matchesGroup = groupFilter ? e.muscle_group === groupFilter : true;
    return matchesQuery && matchesGroup;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Browse exercises"
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-black/10 bg-[var(--background)] p-5 shadow-xl dark:border-white/10"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">Browse exercises</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="w-full rounded-full bg-black/5 py-2 pl-9 pr-3 text-sm dark:bg-white/10"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setGroupFilter('')}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              groupFilter === '' ? 'bg-[#141414] text-white' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
            }`}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(g === groupFilter ? '' : g)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                groupFilter === g ? 'bg-[#141414] text-white' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="mt-3 grid flex-1 grid-cols-2 gap-2 overflow-y-auto">
          {results.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                onPick(entry);
                onClose();
              }}
              className="rounded-2xl border border-black/[.05] p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.02)] hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
            >
              <p className="font-bold text-black dark:text-zinc-50">{entry.name}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {[
                  entry.muscle_group,
                  entry.default_sets != null ? `${entry.default_sets}×${entry.default_reps ?? '—'}` : null,
                  entry.default_rpe != null ? `RPE ${entry.default_rpe}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </button>
          ))}
          {results.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-zinc-500">No exercises match.</p>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { getExerciseOptions } from '@/lib/data/exerciseLibrary';
import { recordExerciseMax } from '@/lib/data/clientExerciseMaxes';

// Either party can record a tested/estimated max (RLS: owns_client) -- this is what makes
// %1RM prescriptions resolve to an actual target load for a given client.
// `forExercise` fixes the exercise (the prompt under a %1RM lift with no tested max, TR14): no list to load or pick from.
export function RecordMaxForm({ clientId, bare = false, forExercise }: { clientId: string; bare?: boolean; forExercise?: { libraryId: string; name: string } }) {
  // The exercise list is read when the form opens (R13/M1): the whole library rode on every member page just for this one list.
  const options = useOnDemand(() => (forExercise ? Promise.resolve([]) : getExerciseOptions()), forExercise ? `max-for:${forExercise.libraryId}` : 'exercise-options');
  const library = options.data ?? [];
  const { run, busy } = useAction();
  const [libraryId, setLibraryId] = useState(forExercise?.libraryId ?? '');
  const [max, setMax] = useState<number | ''>('');
  const [reps, setReps] = useState<number | ''>(1);
  const [estimated, setEstimated] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!libraryId || max === '') return;
    await run(() => recordExerciseMax(clientId, libraryId, max, estimated, reps === '' ? 1 : reps), {
      success: 'Tested max recorded',
      onDone: () => {
        setLibraryId(forExercise?.libraryId ?? '');
        setMax('');
        setReps(1);
        setEstimated(false);
      },
    });
  }

  if (!forExercise && options.data != null && library.length === 0) return null;

  const inputBase = 'h-11 w-full min-w-0 rounded-xl border border-black/10 bg-transparent px-3 text-base dark:border-white/10';

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-3 ${bare ? '' : 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10'}`}
    >
      {!forExercise && (
      <div className="space-y-1">
        {!bare && <label className="text-xs font-medium text-zinc-500">Record a tested max</label>}
        <select required className={inputBase} value={libraryId} disabled={options.data == null} onChange={(e) => setLibraryId(e.target.value)}>
          <option value="" disabled>
            {options.data == null ? (options.error ? 'Could not load exercises' : 'Loading exercises…') : 'Exercise…'}
          </option>
          {library.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-zinc-500">Weight</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            required
            className={inputBase}
            value={max}
            onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-zinc-500">Reps</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            required
            title="1 = a true 1RM. More than 1 (e.g. a 3-rep or 5-rep max) gets converted to an estimated 1RM automatically."
            className={inputBase}
            value={reps}
            onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-500">
          <input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />
          Estimated
        </label>
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b] px-6 text-sm font-bold disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

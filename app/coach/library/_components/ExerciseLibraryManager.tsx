'use client';

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createLibraryExercise, deleteLibraryExercise } from '@/lib/data/exerciseLibrary';
import type { ExerciseLibraryRow } from '@/lib/data/types';

export function ExerciseLibraryManager({ initialExercises }: { initialExercises: ExerciseLibraryRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [name, setName] = useState('');
  const [defaultSets, setDefaultSets] = useState<number | ''>(3);
  const [defaultReps, setDefaultReps] = useState('8-10');
  const [defaultRpe, setDefaultRpe] = useState<number | ''>('');
  const [videoUrl, setVideoUrl] = useState('');
  const [notes, setNotes] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createLibraryExercise({
          name,
          default_sets: defaultSets === '' ? null : defaultSets,
          default_reps: defaultReps || null,
          default_rpe: defaultRpe === '' ? null : defaultRpe,
          video_url: videoUrl || null,
          notes: notes || null,
        }),
      {
        success: 'Exercise added to library',
        onDone: () => {
          setName('');
          setVideoUrl('');
          setNotes('');
        },
      }
    );
  }

  async function handleDelete(id: string, exerciseName: string) {
    const ok = await confirm({
      title: `Delete “${exerciseName}” from the library?`,
      body: 'This only removes it from the shared library — programs that already used it are unaffected.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteLibraryExercise(id), { success: 'Exercise removed' });
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10 sm:grid-cols-4">
        <div className="col-span-2 space-y-1 sm:col-span-4">
          <label className="text-xs font-medium text-zinc-500">Exercise name</label>
          <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Default sets</label>
          <input
            type="number"
            className={inputCls}
            value={defaultSets}
            onChange={(e) => setDefaultSets(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Default reps</label>
          <input className={inputCls} value={defaultReps} onChange={(e) => setDefaultReps(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Default RPE</label>
          <input
            type="number"
            className={inputCls}
            value={defaultRpe}
            onChange={(e) => setDefaultRpe(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Video URL</label>
          <input className={inputCls} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-4">
          <label className="text-xs font-medium text-zinc-500">Notes</label>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50 sm:col-span-4"
        >
          {saving ? 'Adding…' : 'Add to library'}
        </button>
      </form>

      {initialExercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No library exercises yet"
          hint="Add exercises here once and pick them when building any client's program or a programme template."
        />
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {initialExercises.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {ex.name}
                {ex.default_sets != null ? ` — ${ex.default_sets}×${ex.default_reps ?? '—'}` : ''}
                {ex.default_rpe != null ? ` RPE ${ex.default_rpe}` : ''}
              </span>
              <button
                onClick={() => handleDelete(ex.id, ex.name)}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

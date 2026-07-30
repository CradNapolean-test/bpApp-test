'use client';

import { useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createLibraryExercise, deleteLibraryExercise } from '@/lib/data/exerciseLibrary';
import type { ExerciseLibraryRow } from '@/lib/data/types';

const MUSCLE_GROUPS = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Full Body', 'Mobility'];

export function ExerciseLibraryManager({ initialExercises }: { initialExercises: ExerciseLibraryRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [name, setName] = useState('');
  const [defaultSets, setDefaultSets] = useState<number | ''>(3);
  const [defaultReps, setDefaultReps] = useState('8-10');
  const [defaultRpe, setDefaultRpe] = useState<number | ''>('');
  const [defaultRestSeconds, setDefaultRestSeconds] = useState<number | ''>('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createLibraryExercise({
          name,
          default_sets: defaultSets === '' ? null : defaultSets,
          default_reps: defaultReps || null,
          default_rpe: defaultRpe === '' ? null : defaultRpe,
          default_rest_seconds: defaultRestSeconds === '' ? null : defaultRestSeconds,
          muscle_group: muscleGroup || null,
          equipment: equipment || null,
          video_url: videoUrl || null,
          image_url: imageUrl || null,
          instructions: instructions || null,
          notes: notes || null,
        }),
      {
        success: 'Exercise added to library',
        onDone: () => {
          setName('');
          setVideoUrl('');
          setImageUrl('');
          setInstructions('');
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

  const filteredExercises = useMemo(
    () => (filterGroup ? initialExercises.filter((ex) => ex.muscle_group === filterGroup) : initialExercises),
    [initialExercises, filterGroup]
  );

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10 sm:grid-cols-4">
        <div className="col-span-2 space-y-1 sm:col-span-4">
          <label className="text-xs font-medium text-zinc-500">Exercise name</label>
          <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Muscle group</label>
          <select className={inputCls} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
            <option value="">—</option>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Equipment</label>
          <input className={inputCls} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Barbell" />
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
          <label className="text-xs font-medium text-zinc-500">Default rest (s)</label>
          <input
            type="number"
            className={inputCls}
            value={defaultRestSeconds}
            onChange={(e) => setDefaultRestSeconds(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Video URL</label>
          <input className={inputCls} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Image URL</label>
          <input className={inputCls} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-4">
          <label className="text-xs font-medium text-zinc-500">Instructions</label>
          <textarea rows={2} className={inputCls} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
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

      {initialExercises.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Filter:</span>
          <button
            onClick={() => setFilterGroup('')}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              filterGroup === ''
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
            }`}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setFilterGroup(g)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                filterGroup === g
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {filteredExercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={initialExercises.length === 0 ? 'No library exercises yet' : 'No exercises match that filter'}
          hint={
            initialExercises.length === 0
              ? 'Add exercises here once and pick them when building any client\'s program or a programme template.'
              : 'Try a different muscle group, or clear the filter.'
          }
        />
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {filteredExercises.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {ex.name}
                {ex.muscle_group ? ` · ${ex.muscle_group}` : ''}
                {ex.default_sets != null ? ` — ${ex.default_sets}×${ex.default_reps ?? '—'}` : ''}
                {ex.default_rpe != null ? ` RPE ${ex.default_rpe}` : ''}
                {ex.default_rest_seconds != null ? ` · ${ex.default_rest_seconds}s rest` : ''}
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

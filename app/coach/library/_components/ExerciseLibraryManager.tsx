'use client';

import { useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { MUSCLE_GROUPS } from '@/app/_components/workouts/muscleGroups';
import { createLibraryExercise, deleteLibraryExercise, updateLibraryExercise } from '@/lib/data/exerciseLibrary';
import type { ExerciseLibraryRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

// Inline edit -- replaces the card's own content in place, matching the desktop pattern used
// by ClassManager's row edit (plenty of width for this instead of a mobile bottom sheet).
function EditExerciseCard({
  exercise,
  onClose,
  onDelete,
}: {
  exercise: ExerciseLibraryRow;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { run, busy: saving } = useAction();
  const [name, setName] = useState(exercise.name);
  const [muscleGroup, setMuscleGroup] = useState(exercise.muscle_group ?? '');
  const [equipment, setEquipment] = useState(exercise.equipment ?? '');
  const [defaultSets, setDefaultSets] = useState<number | ''>(exercise.default_sets ?? '');
  const [defaultReps, setDefaultReps] = useState(exercise.default_reps ?? '');
  const [defaultRpe, setDefaultRpe] = useState<number | ''>(exercise.default_rpe ?? '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateLibraryExercise(exercise.id, {
          name,
          muscle_group: muscleGroup || null,
          equipment: equipment || null,
          default_sets: defaultSets === '' ? null : defaultSets,
          default_reps: defaultReps || null,
          default_rpe: defaultRpe === '' ? null : defaultRpe,
        }),
      { success: 'Exercise updated', onDone: onClose }
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Sets</label>
            <input
              type="number"
              className={inputCls}
              value={defaultSets}
              onChange={(e) => setDefaultSets(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Reps</label>
            <input className={inputCls} value={defaultReps} onChange={(e) => setDefaultReps(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">RPE</label>
            <input
              type="number"
              className={inputCls}
              value={defaultRpe}
              onChange={(e) => setDefaultRpe(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => onDelete(exercise.id, exercise.name)}>
            Delete
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function AddExerciseCard({ onDone }: { onDone: () => void }) {
  const { run: runCreate, busy: saving } = useAction();
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
      { success: 'Exercise added to library', onDone }
    );
  }

  return (
    <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10 sm:grid-cols-4">
      <div className="col-span-2 space-y-1 sm:col-span-4">
        <label className="text-xs font-medium text-zinc-500">Exercise name</label>
        <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add to library'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ExerciseLibraryManager({ initialExercises }: { initialExercises: ExerciseLibraryRow[] }) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [addingExercise, setAddingExercise] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState('');

  async function handleDelete(id: string, exerciseName: string) {
    const ok = await confirm({
      title: `Delete “${exerciseName}” from the library?`,
      body: 'This only removes it from the shared library — programs that already used it are unaffected.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteLibraryExercise(id), { success: 'Exercise removed', onDone: () => setEditingId(null) });
  }

  const filteredExercises = useMemo(
    () => (filterGroup ? initialExercises.filter((ex) => ex.muscle_group === filterGroup) : initialExercises),
    [initialExercises, filterGroup]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingExercise(true)}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + Add exercise
        </button>
      </div>

      {addingExercise && <AddExerciseCard onDone={() => setAddingExercise(false)} />}

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredExercises.map((ex) =>
            editingId === ex.id ? (
              <EditExerciseCard key={ex.id} exercise={ex} onClose={() => setEditingId(null)} onDelete={handleDelete} />
            ) : (
              <div
                key={ex.id}
                className="rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{ex.name}</p>
                  <div className="flex shrink-0 gap-2.5 text-sm font-semibold">
                    <button type="button" onClick={() => setEditingId(ex.id)} className="text-black hover:underline dark:text-zinc-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(ex.id, ex.name)} className="text-danger hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ') || '—'}
                </p>
                {ex.default_sets != null && (
                  <p className="mt-1 text-sm text-zinc-500">
                    Default {ex.default_sets}×{ex.default_reps ?? '—'}
                    {ex.default_rpe != null ? ` · RPE ${ex.default_rpe}` : ''}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

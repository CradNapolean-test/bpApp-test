'use client';

import { useMemo, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { DefaultMuscleGroupIcon, MUSCLE_GROUPS, MUSCLE_GROUP_ICONS } from '@/app/_components/workouts/muscleGroups';
import { createLibraryExercise, deleteLibraryExercise, updateLibraryExercise } from '@/lib/data/exerciseLibrary';
import type { ExerciseLibraryRow } from '@/lib/data/types';

// Tap-to-edit sheet for an existing library entry -- name/muscle group/sets/reps/RPE, or
// delete. Mirrors the create form's fields but scoped to just what the prototype's edit
// sheet covers, not the full create form's equipment/video/image/instructions/notes set.
function EditExerciseSheet({
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
  const [defaultSets, setDefaultSets] = useState<number | ''>(exercise.default_sets ?? '');
  const [defaultReps, setDefaultReps] = useState(exercise.default_reps ?? '');
  const [defaultRpe, setDefaultRpe] = useState<number | ''>(exercise.default_rpe ?? '');

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateLibraryExercise(exercise.id, {
          name,
          muscle_group: muscleGroup || null,
          default_sets: defaultSets === '' ? null : defaultSets,
          default_reps: defaultReps || null,
          default_rpe: defaultRpe === '' ? null : defaultRpe,
        }),
      { success: 'Exercise updated', onDone: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit exercise"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">Edit exercise</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Name</label>
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
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="danger" onClick={() => onDelete(exercise.id, exercise.name)}>
              Delete
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ExerciseLibraryManager({ initialExercises }: { initialExercises: ExerciseLibraryRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [addingExercise, setAddingExercise] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
          setAddingExercise(false);
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
    await runDelete(() => deleteLibraryExercise(id), { success: 'Exercise removed', onDone: () => setEditingId(null) });
  }

  const filteredExercises = useMemo(
    () => (filterGroup ? initialExercises.filter((ex) => ex.muscle_group === filterGroup) : initialExercises),
    [initialExercises, filterGroup]
  );

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      {!addingExercise && (
        <button
          type="button"
          onClick={() => setAddingExercise(true)}
          className="w-full rounded-2xl border-[1.5px] border-dashed border-black/15 py-3 text-sm font-semibold text-zinc-500 dark:border-white/15"
        >
          + Add exercise
        </button>
      )}
      {addingExercise && (
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
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add to library'}
          </button>
          <Button type="button" variant="ghost" onClick={() => setAddingExercise(false)}>
            Cancel
          </Button>
        </div>
      </form>
      )}

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
          {filteredExercises.map((ex) => {
            const Icon = MUSCLE_GROUP_ICONS[ex.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => setEditingId(ex.id)}
                  className="flex w-full items-center gap-2.5 p-3 text-left text-sm"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/10">
                    {ex.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- coach-entered arbitrary URLs, no remote-image config configured
                      <img src={ex.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-4 w-4 text-zinc-500" />
                    )}
                  </span>
                  <span className="truncate">
                    {ex.name}
                    {ex.muscle_group ? ` · ${ex.muscle_group}` : ''}
                    {ex.default_sets != null ? ` — ${ex.default_sets}×${ex.default_reps ?? '—'}` : ''}
                    {ex.default_rpe != null ? ` RPE ${ex.default_rpe}` : ''}
                    {ex.default_rest_seconds != null ? ` · ${ex.default_rest_seconds}s rest` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editingId && (
        <EditExerciseSheet
          exercise={initialExercises.find((ex) => ex.id === editingId)!}
          onClose={() => setEditingId(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

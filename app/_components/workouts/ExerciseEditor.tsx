'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import type { BlockType, ClientExerciseMaxRow, ExerciseLibraryRow, PrescriptionType } from '@/lib/data/types';
import { groupBySuperset, nextSupersetLetter } from './exerciseGrouping';

const MUSCLE_GROUPS = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Full Body', 'Mobility'];

// The fields every exercise row needs regardless of whether it's a live workout_exercises row
// or a program_template_exercises row.
export interface EditableExercise {
  id: string;
  exercise_library_id: string | null;
  name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  rpe: number | null;
  notes: string | null;
  video_url: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  sort_order: number;
  block_type: BlockType;
  prescription_type: PrescriptionType;
  percent_1rm: number | null;
}

export interface NewExerciseFields {
  exercise_library_id: string | null;
  name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  rpe: number | null;
  notes: string | null;
  video_url: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  sort_order: number;
  block_type: BlockType;
  prescription_type: PrescriptionType;
  percent_1rm: number | null;
  // Template-only -- ignored by live workout_exercises callers.
  progression_load_increment: number | null;
  progression_every_weeks: number;
}

// Resolves the latest tested max on file for a library exercise, or null if none logged yet.
function latestMax(maxes: ClientExerciseMaxRow[] | undefined, libraryId: string | null): number | null {
  if (!maxes || !libraryId) return null;
  const matches = maxes.filter((m) => m.exercise_library_id === libraryId);
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.tested_date + b.created_at).localeCompare(a.tested_date + a.created_at));
  return matches[0].tested_max;
}

function AddExerciseForm({
  library,
  nextSortOrder,
  onAdd,
  clientExerciseMaxes,
  showProgression,
}: {
  library: ExerciseLibraryRow[];
  nextSortOrder: number;
  onAdd: (fields: NewExerciseFields) => Promise<unknown>;
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  showProgression?: boolean;
}) {
  const { run, busy } = useAction();
  const [libraryId, setLibraryId] = useState('');
  const [name, setName] = useState('');
  const [blockType, setBlockType] = useState<BlockType>('exercise');
  const [prescriptionType, setPrescriptionType] = useState<PrescriptionType>('absolute');
  const [sets, setSets] = useState<number | ''>(3);
  const [reps, setReps] = useState('8-10');
  const [load, setLoad] = useState<number | ''>('');
  const [percent1rm, setPercent1rm] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [videoUrl, setVideoUrl] = useState('');
  const [supersetGroup, setSupersetGroup] = useState('');
  const [restSeconds, setRestSeconds] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [progressionIncrement, setProgressionIncrement] = useState<number | ''>('');
  const [progressionWeeks, setProgressionWeeks] = useState<number | ''>(1);

  function handlePickLibrary(id: string) {
    setLibraryId(id);
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    setName(entry.name);
    if (entry.default_sets != null) setSets(entry.default_sets);
    if (entry.default_reps != null) setReps(entry.default_reps);
    if (entry.default_rpe != null) setRpe(entry.default_rpe);
    if (entry.video_url != null) setVideoUrl(entry.video_url);
    if (entry.default_rest_seconds != null) setRestSeconds(entry.default_rest_seconds);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isCircuit = blockType === 'circuit';
    const isPercent = !isCircuit && prescriptionType === 'percent_1rm';
    await run(
      () =>
        onAdd({
          exercise_library_id: libraryId || null,
          name,
          sets: isCircuit ? null : sets === '' ? null : sets,
          reps: isCircuit ? null : reps || null,
          load: isCircuit || isPercent ? null : load === '' ? null : load,
          rpe: isCircuit ? null : rpe === '' ? null : rpe,
          notes: notes || null,
          video_url: videoUrl || null,
          superset_group: isCircuit ? null : supersetGroup || null,
          rest_seconds: isCircuit ? null : restSeconds === '' ? null : restSeconds,
          sort_order: nextSortOrder,
          block_type: blockType,
          prescription_type: isCircuit ? 'absolute' : prescriptionType,
          percent_1rm: isPercent ? (percent1rm === '' ? null : percent1rm) : null,
          progression_load_increment:
            showProgression && !isCircuit && !isPercent ? (progressionIncrement === '' ? null : progressionIncrement) : null,
          progression_every_weeks: showProgression ? (progressionWeeks === '' ? 1 : progressionWeeks) : 1,
        }),
      {
        success: 'Exercise added',
        onDone: () => {
          setLibraryId('');
          setName('');
          setVideoUrl('');
          setSupersetGroup('');
          setRestSeconds('');
          setNotes('');
          setPercent1rm('');
          setProgressionIncrement('');
        },
      }
    );
  }

  const filteredLibrary = filterGroup ? library.filter((e) => e.muscle_group === filterGroup) : library;
  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';
  const segBtnCls = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs font-medium ${active ? 'bg-accent text-accent-foreground' : 'border border-black/10 dark:border-white/10'}`;
  const isCircuit = blockType === 'circuit';
  const hasMaxOnFile = latestMax(clientExerciseMaxes, libraryId || null) != null;

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1">
          <button type="button" className={segBtnCls(blockType === 'exercise')} onClick={() => setBlockType('exercise')}>
            Exercise
          </button>
          <button type="button" className={segBtnCls(blockType === 'circuit')} onClick={() => setBlockType('circuit')}>
            Circuit
          </button>
        </div>
        {!isCircuit && (
          <div className="flex gap-1">
            <button type="button" className={segBtnCls(prescriptionType === 'absolute')} onClick={() => setPrescriptionType('absolute')}>
              Absolute
            </button>
            <button type="button" className={segBtnCls(prescriptionType === 'percent_1rm')} onClick={() => setPrescriptionType('percent_1rm')}>
              % 1RM
            </button>
          </div>
        )}
      </div>

      {!isCircuit && prescriptionType === 'percent_1rm' && clientExerciseMaxes !== undefined && !hasMaxOnFile && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          No tested max on file for this exercise yet — log one so the target load can resolve.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {library.length > 0 && (
          <>
            <select className={`${inputCls} w-24`} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">All groups</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select className={`${inputCls} w-32`} value={libraryId} onChange={(e) => handlePickLibrary(e.target.value)}>
              <option value="">From library…</option>
              {filteredLibrary.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </>
        )}
        <input required placeholder="Exercise" className={`${inputCls} w-32`} value={name} onChange={(e) => setName(e.target.value)} />

        {!isCircuit && (
          <>
            <input type="number" placeholder="Sets" className={`${inputCls} w-16`} value={sets} onChange={(e) => setSets(e.target.value === '' ? '' : Number(e.target.value))} />
            <input placeholder="Reps" className={`${inputCls} w-20`} value={reps} onChange={(e) => setReps(e.target.value)} />
            {prescriptionType === 'percent_1rm' ? (
              <input type="number" placeholder="% 1RM" className={`${inputCls} w-16`} value={percent1rm} onChange={(e) => setPercent1rm(e.target.value === '' ? '' : Number(e.target.value))} />
            ) : (
              <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
            )}
            <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
            <input placeholder="Superset (e.g. A)" className={`${inputCls} w-24`} value={supersetGroup} onChange={(e) => setSupersetGroup(e.target.value)} />
            <input type="number" placeholder="Rest (s)" className={`${inputCls} w-20`} value={restSeconds} onChange={(e) => setRestSeconds(e.target.value === '' ? '' : Number(e.target.value))} />
          </>
        )}
        <input placeholder="Video URL (optional)" className={`${inputCls} w-40`} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>

      {isCircuit && (
        <textarea
          placeholder="Instructions (e.g. 3 rounds: 20 mountain climbers, 15 KB swings, 400m row)"
          className={`${inputCls} w-full`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      )}

      {showProgression && !isCircuit && prescriptionType === 'absolute' && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">Progression:</span>
          <span className="text-[11px] text-zinc-500">+</span>
          <input type="number" placeholder="0" className={`${inputCls} w-14`} value={progressionIncrement} onChange={(e) => setProgressionIncrement(e.target.value === '' ? '' : Number(e.target.value))} />
          <span className="text-[11px] text-zinc-500">load every</span>
          <input type="number" placeholder="1" className={`${inputCls} w-14`} value={progressionWeeks} onChange={(e) => setProgressionWeeks(e.target.value === '' ? '' : Number(e.target.value))} />
          <span className="text-[11px] text-zinc-500">week(s)</span>
        </div>
      )}

      <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

function SortableExerciseRow<T extends EditableExercise>({
  exercise,
  previousExercise,
  canEdit,
  onDelete,
  onUpdate,
  clientExerciseMaxes,
  renderExtra,
}: {
  exercise: T;
  previousExercise: T | undefined;
  canEdit: boolean;
  onDelete: (id: string, name: string) => Promise<unknown>;
  onUpdate: (id: string, fields: Partial<EditableExercise>) => Promise<unknown>;
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  renderExtra?: (exercise: T) => ReactNode;
}) {
  const confirm = useConfirm();
  const { run } = useAction();
  const { run: runLink } = useAction();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });

  async function handleDelete() {
    const ok = await confirm({ title: `Delete “${exercise.name}”?`, destructive: true });
    if (!ok) return;
    await run(() => onDelete(exercise.id, exercise.name), { success: 'Exercise deleted' });
  }

  async function handleLinkWithPrevious() {
    if (!previousExercise) return;
    const group = previousExercise.superset_group ?? nextSupersetLetter([previousExercise, exercise]);
    if (!previousExercise.superset_group) {
      await runLink(() => onUpdate(previousExercise.id, { superset_group: group }));
    }
    await runLink(() => onUpdate(exercise.id, { superset_group: group }));
  }

  async function handleUnlink() {
    await runLink(() => onUpdate(exercise.id, { superset_group: null }));
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCircuit = exercise.block_type === 'circuit';
  const isPercent = exercise.prescription_type === 'percent_1rm';
  const resolvedMax = isPercent ? latestMax(clientExerciseMaxes, exercise.exercise_library_id) : null;

  return (
    <div ref={setNodeRef} style={style} className="rounded-md bg-black/[.02] p-2 text-sm dark:bg-white/[.03]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {canEdit && (
            <button
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="shrink-0 cursor-grab touch-none text-zinc-400 active:cursor-grabbing dark:text-zinc-600"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="truncate">
            {exercise.name}
            {!isCircuit && (
              <>
                {' '}— {exercise.sets}×{exercise.reps}
                {isPercent
                  ? exercise.percent_1rm != null
                    ? ` @ ${exercise.percent_1rm}% 1RM${resolvedMax != null ? ` (≈ ${Math.round((resolvedMax * exercise.percent_1rm) / 100)})` : ''}`
                    : ''
                  : exercise.load != null
                    ? ` @ ${exercise.load}`
                    : ''}
                {exercise.rpe != null ? ` RPE ${exercise.rpe}` : ''}
                {exercise.rest_seconds != null ? ` · ${exercise.rest_seconds}s rest` : ''}
              </>
            )}
          </span>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            {!isCircuit && exercise.superset_group ? (
              <button onClick={handleUnlink} className="text-xs text-zinc-500 hover:underline">
                Unlink
              </button>
            ) : (
              !isCircuit &&
              previousExercise && (
                <button onClick={handleLinkWithPrevious} className="text-xs text-accent hover:underline">
                  Link with previous
                </button>
              )
            )}
            <button onClick={handleDelete} className="text-xs text-red-600 hover:underline dark:text-red-400">
              Delete
            </button>
          </div>
        )}
      </div>
      {isCircuit && exercise.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{exercise.notes}</p>}
      {renderExtra?.(exercise)}
    </div>
  );
}

export function ExerciseEditor<T extends EditableExercise>({
  exercises,
  library,
  canEdit,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  clientExerciseMaxes,
  showProgression,
  renderExtra,
}: {
  exercises: T[];
  library: ExerciseLibraryRow[];
  canEdit: boolean;
  onAdd: (fields: NewExerciseFields) => Promise<unknown>;
  onUpdate: (id: string, fields: Partial<EditableExercise>) => Promise<unknown>;
  onDelete: (id: string, name: string) => Promise<unknown>;
  onReorder: (orderedIds: string[]) => Promise<unknown>;
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  showProgression?: boolean;
  renderExtra?: (exercise: T) => ReactNode;
}) {
  const { run: runReorder } = useAction();
  const sorted = [...exercises].sort((a, b) => a.sort_order - b.sort_order);
  const idsKey = sorted.map((e) => e.id).join(',');
  const [orderedIds, setOrderedIds] = useState<string[]>(() => sorted.map((e) => e.id));
  const prevIdsKey = useRef(idsKey);

  useEffect(() => {
    if (prevIdsKey.current !== idsKey) {
      prevIdsKey.current = idsKey;
      setOrderedIds(sorted.map((e) => e.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldOrder = orderedIds;
    const oldIndex = oldOrder.indexOf(String(active.id));
    const newIndex = oldOrder.indexOf(String(over.id));
    const next = arrayMove(oldOrder, oldIndex, newIndex);
    setOrderedIds(next);
    const success = await runReorder(() => onReorder(next));
    if (!success) setOrderedIds(oldOrder);
  }

  const byId = new Map(sorted.map((e) => [e.id, e]));
  const displayOrder = orderedIds.map((id) => byId.get(id)).filter((e): e is T => e != null);
  const supersetGroups = groupBySuperset(displayOrder);

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ul className="mt-2 space-y-2">
            {supersetGroups.map((sg, sgIndex) => (
              <li key={sgIndex} className={sg.group ? 'space-y-1 rounded-md border border-accent/30 p-1.5' : 'space-y-1'}>
                {sg.group && <p className="px-1 text-[10px] font-semibold text-accent">Superset {sg.group}</p>}
                {sg.exercises.map((ex) => {
                  const indexInDay = displayOrder.findIndex((e) => e.id === ex.id);
                  return (
                    <SortableExerciseRow
                      key={ex.id}
                      exercise={ex}
                      previousExercise={displayOrder[indexInDay - 1]}
                      canEdit={canEdit}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      clientExerciseMaxes={clientExerciseMaxes}
                      renderExtra={renderExtra}
                    />
                  );
                })}
              </li>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {canEdit && (
        <AddExerciseForm
          library={library}
          nextSortOrder={displayOrder.length}
          onAdd={onAdd}
          clientExerciseMaxes={clientExerciseMaxes}
          showProgression={showProgression}
        />
      )}
    </div>
  );
}

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
import { useClickOutside } from '@/app/_components/useClickOutside';
import { DropdownMenu, type DropdownMenuItem } from '@/app/_components/DropdownMenu';
import { BrowseExercisesModal } from '@/app/coach/library/_components/BrowseExercisesModal';
import { DefaultMuscleGroupIcon, MUSCLE_GROUP_ICONS } from './muscleGroups';
import type { BlockType, ClientExerciseMaxRow, ExerciseLibraryRow, PrescriptionType } from '@/lib/data/types';
import { groupBySuperset, nextSupersetLetter } from './exerciseGrouping';

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

export interface ResolvedMax {
  estimated1RM: number;
  source: ClientExerciseMaxRow;
}

// Resolves the latest tested max on file for a library exercise, converting a rep max
// (reps > 1, e.g. a 3RM) into an estimated 1RM via the Epley formula -- a coach/client rarely
// tests a true 1RM directly, so treating every recorded weight as if it were one would
// resolve %1RM prescriptions off the wrong number. reps === 1 (the default, matching every
// pre-existing row) is already a true 1RM, no conversion needed.
function latestMax(maxes: ClientExerciseMaxRow[] | undefined, libraryId: string | null): ResolvedMax | null {
  if (!maxes || !libraryId) return null;
  const matches = maxes.filter((m) => m.exercise_library_id === libraryId);
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.tested_date + b.created_at).localeCompare(a.tested_date + a.created_at));
  const source = matches[0];
  const estimated1RM = source.reps > 1 ? source.tested_max * (1 + source.reps / 30) : source.tested_max;
  return { estimated1RM, source };
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</label>
      {children}
    </div>
  );
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
  const [progressionIncrement, setProgressionIncrement] = useState<number | ''>('');
  const [progressionWeeks, setProgressionWeeks] = useState<number | ''>(1);
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [browseOpen, setBrowseOpen] = useState(false);

  const comboRef = useClickOutside<HTMLDivElement>(() => setShowResults(false), showResults);

  function handlePickLibrary(id: string) {
    setLibraryId(id);
    setShowResults(false);
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    setName(entry.name);
    if (entry.default_sets != null) setSets(entry.default_sets);
    if (entry.default_reps != null) setReps(entry.default_reps);
    if (entry.default_rpe != null) setRpe(entry.default_rpe);
    if (entry.video_url != null) setVideoUrl(entry.video_url);
    if (entry.default_rest_seconds != null) setRestSeconds(entry.default_rest_seconds);
  }

  const results = name.trim()
    ? library
        .filter(
          (e) =>
            e.name.toLowerCase().includes(name.trim().toLowerCase()) ||
            (e.muscle_group ?? '').toLowerCase().includes(name.trim().toLowerCase())
        )
        .slice(0, 8)
    : [];

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handlePickLibrary(results[highlightIndex].id);
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isCircuit = blockType === 'circuit';
    const isPercent = !isCircuit && prescriptionType === 'percent_1rm';
    // %1RM rows need a linked library exercise to resolve a target load against (DB check
    // constraint enforces this too, but that surfaces as a raw Postgres error -- catch it
    // here first with a message that explains why).
    if (isPercent && !libraryId) return;
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

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';
  const segBtnCls = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs font-medium ${active ? 'bg-accent text-accent-foreground' : 'border border-black/10 dark:border-white/10'}`;
  const isCircuit = blockType === 'circuit';
  const hasMaxOnFile = latestMax(clientExerciseMaxes, libraryId || null) != null;

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button type="button" className={segBtnCls(blockType === 'exercise')} onClick={() => setBlockType('exercise')}>
            Exercise
          </button>
          <button type="button" className={segBtnCls(blockType === 'circuit')} onClick={() => setBlockType('circuit')}>
            Circuit
          </button>
        </div>
        {!isCircuit && (
          <>
            <div className="h-5 w-px bg-black/10 dark:bg-white/10" />
            <div className="flex gap-1">
              <button type="button" className={segBtnCls(prescriptionType === 'absolute')} onClick={() => setPrescriptionType('absolute')}>
                Absolute
              </button>
              <button type="button" className={segBtnCls(prescriptionType === 'percent_1rm')} onClick={() => setPrescriptionType('percent_1rm')}>
                % 1RM
              </button>
            </div>
          </>
        )}
      </div>

      {!isCircuit && (
        <p className="text-[11px] text-zinc-500">
          {prescriptionType === 'absolute'
            ? 'Absolute — a fixed weight you set.'
            : "% 1RM — a percentage of the client's tested max for this exercise; the app calculates the actual target weight for you."}
        </p>
      )}

      {!isCircuit && prescriptionType === 'percent_1rm' && !libraryId && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Pick an exercise from the library first — % 1RM needs a linked exercise to resolve against.
        </p>
      )}
      {!isCircuit && prescriptionType === 'percent_1rm' && libraryId && clientExerciseMaxes !== undefined && !hasMaxOnFile && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          No tested max on file for this exercise yet — log one so the target load can resolve.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div ref={comboRef} className="relative w-48">
          <LabeledField label="Exercise">
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setLibraryId('');
                setShowResults(true);
                setHighlightIndex(0);
              }}
              onFocus={() => setShowResults(true)}
              onKeyDown={handleNameKeyDown}
              placeholder="Search or type a name"
              className={inputCls}
            />
          </LabeledField>
          {showResults && results.length > 0 && (
            <div
              role="listbox"
              className="absolute z-10 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-black/10 bg-[var(--background)] py-1 shadow-lg dark:border-white/10"
            >
              {results.map((entry, i) => {
                const Icon = MUSCLE_GROUP_ICONS[entry.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={i === highlightIndex}
                    onClick={() => handlePickLibrary(entry.id)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      i === highlightIndex ? 'bg-black/5 dark:bg-white/5' : ''
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{entry.name}</span>
                    {entry.muscle_group && <span className="shrink-0 text-zinc-500">{entry.muscle_group}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Browse exercises
        </button>
      </div>

      {!isCircuit && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LabeledField label="Sets">
            <input type="number" className={inputCls} value={sets} onChange={(e) => setSets(e.target.value === '' ? '' : Number(e.target.value))} />
          </LabeledField>
          <LabeledField label="Reps">
            <input className={inputCls} value={reps} onChange={(e) => setReps(e.target.value)} />
          </LabeledField>
          {prescriptionType === 'percent_1rm' ? (
            <LabeledField label="% 1RM">
              <input type="number" className={inputCls} value={percent1rm} onChange={(e) => setPercent1rm(e.target.value === '' ? '' : Number(e.target.value))} />
            </LabeledField>
          ) : (
            <LabeledField label="Load">
              <input type="number" className={inputCls} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
            </LabeledField>
          )}
          <LabeledField label="RPE">
            <input type="number" className={inputCls} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
          </LabeledField>
          <LabeledField label="Rest (s)">
            <input type="number" className={inputCls} value={restSeconds} onChange={(e) => setRestSeconds(e.target.value === '' ? '' : Number(e.target.value))} />
          </LabeledField>
          <LabeledField label="Superset">
            <input placeholder="e.g. A" className={inputCls} value={supersetGroup} onChange={(e) => setSupersetGroup(e.target.value)} />
          </LabeledField>
        </div>
      )}
      <LabeledField label="Video URL (optional)">
        <input className={inputCls} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </LabeledField>

      {isCircuit && (
        <LabeledField label="Instructions">
          <textarea
            placeholder="e.g. 3 rounds: 20 mountain climbers, 15 KB swings, 400m row"
            className={inputCls}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </LabeledField>
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

      {browseOpen && (
        <BrowseExercisesModal library={library} onPick={(entry: ExerciseLibraryRow) => handlePickLibrary(entry.id)} onClose={() => setBrowseOpen(false)} />
      )}
    </form>
  );
}

// Non-coach viewers (the client) get this instead of EditableField -- same box look, no input,
// no onUpdate path (mutations are coach-only, both by RLS and by intent).
function ReadOnlyField({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate rounded-md border border-black/10 px-1.5 py-1 text-xs dark:border-white/10">{value ?? '—'}</p>
    </div>
  );
}

// A single editable value box: local state seeded from `value`, saves onBlur only if changed,
// synced back if the parent's value changes underneath it (e.g. after a save round-trips
// through router.refresh()). Mirrors the same pattern already used by PhaseLabelInput.
function EditableField({
  label,
  value,
  numeric,
  onSave,
}: {
  label: string;
  value: string | number | null;
  numeric?: boolean;
  onSave: (raw: string) => void;
}) {
  const initial = value == null ? '' : String(value);
  const [local, setLocal] = useState(initial);
  const prevInitial = useRef(initial);

  useEffect(() => {
    if (prevInitial.current !== initial) {
      prevInitial.current = initial;
      setLocal(initial);
    }
  }, [initial]);

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <input
        type={numeric ? 'number' : 'text'}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== initial) onSave(local);
        }}
        className="mt-0.5 w-full rounded-md border border-black/10 bg-transparent px-1.5 py-1 text-xs dark:border-white/10"
      />
    </div>
  );
}

function SortableExerciseRow<T extends EditableExercise>({
  exercise,
  previousExercise,
  index,
  library,
  canEdit,
  onDelete,
  onUpdate,
  clientExerciseMaxes,
  renderExtra,
}: {
  exercise: T;
  previousExercise: T | undefined;
  index: number;
  library: ExerciseLibraryRow[];
  canEdit: boolean;
  onDelete: (id: string, name: string) => Promise<unknown>;
  onUpdate: (id: string, fields: Partial<EditableExercise>) => Promise<unknown>;
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  renderExtra?: (exercise: T) => ReactNode;
}) {
  const { run } = useAction();
  const { run: runLink } = useAction();
  const { run: runField } = useAction();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });

  async function handleDelete() {
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

  function saveField(field: keyof EditableExercise, raw: string, numeric: boolean) {
    const value = numeric ? (raw.trim() === '' ? null : Number(raw)) : raw.trim() === '' ? null : raw;
    runField(() => onUpdate(exercise.id, { [field]: value }));
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCircuit = exercise.block_type === 'circuit';
  const isPercent = exercise.prescription_type === 'percent_1rm';
  const resolvedMax = isPercent ? latestMax(clientExerciseMaxes, exercise.exercise_library_id) : null;
  const libraryEntry = exercise.exercise_library_id ? library.find((e) => e.id === exercise.exercise_library_id) : undefined;
  const Icon = MUSCLE_GROUP_ICONS[libraryEntry?.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;

  const menuItems: DropdownMenuItem[] = [];
  if (canEdit) {
    if (!isCircuit && exercise.superset_group) {
      menuItems.push({ label: 'Unlink', onSelect: handleUnlink });
    } else if (!isCircuit && previousExercise) {
      menuItems.push({ label: 'Link with previous', onSelect: handleLinkWithPrevious });
    }
    menuItems.push({ label: 'Delete', onSelect: handleDelete, destructive: true });
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-black/[.05] bg-black/[.02] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/5 dark:bg-white/[.03]">
      <div className="flex items-start gap-2">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="mt-1 shrink-0 cursor-grab touch-none text-zinc-400 active:cursor-grabbing dark:text-zinc-600"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {index + 1}
        </span>
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/10">
          {libraryEntry?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- coach-entered arbitrary URLs, no remote-image config configured
            <img src={libraryEntry.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-4 w-4 text-zinc-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{exercise.name}</p>
            {canEdit && menuItems.length > 0 && <DropdownMenu items={menuItems} triggerLabel={`${exercise.name} actions`} />}
          </div>

          {!isCircuit && canEdit && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-5">
              <EditableField label="Sets" value={exercise.sets} numeric onSave={(v) => saveField('sets', v, true)} />
              <EditableField label="Reps" value={exercise.reps} onSave={(v) => saveField('reps', v, false)} />
              {isPercent ? (
                <EditableField label="% 1RM" value={exercise.percent_1rm} numeric onSave={(v) => saveField('percent_1rm', v, true)} />
              ) : (
                <EditableField label="Load" value={exercise.load} numeric onSave={(v) => saveField('load', v, true)} />
              )}
              <EditableField label="RPE" value={exercise.rpe} numeric onSave={(v) => saveField('rpe', v, true)} />
              <EditableField label="Rest (s)" value={exercise.rest_seconds} numeric onSave={(v) => saveField('rest_seconds', v, true)} />
            </div>
          )}
          {!isCircuit && !canEdit && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-5">
              <ReadOnlyField label="Sets" value={exercise.sets} />
              <ReadOnlyField label="Reps" value={exercise.reps} />
              {isPercent ? (
                <ReadOnlyField label="% 1RM" value={exercise.percent_1rm} />
              ) : (
                <ReadOnlyField label="Load" value={exercise.load} />
              )}
              <ReadOnlyField label="RPE" value={exercise.rpe} />
              <ReadOnlyField label="Rest (s)" value={exercise.rest_seconds} />
            </div>
          )}
          {isPercent && resolvedMax != null && exercise.percent_1rm != null && (
            <p className="mt-1 text-[11px] text-zinc-500">
              ≈ {Math.round((resolvedMax.estimated1RM * exercise.percent_1rm) / 100)}
              {' ('}
              {resolvedMax.source.reps > 1
                ? `from ${resolvedMax.source.tested_max}×${resolvedMax.source.reps} → est. 1RM ${Math.round(resolvedMax.estimated1RM)}`
                : `from tested 1RM ${resolvedMax.source.tested_max}`}
              {')'}
            </p>
          )}

          {isCircuit && canEdit && (
            <div className="mt-1.5">
              <textarea
                defaultValue={exercise.notes ?? ''}
                rows={2}
                onBlur={(e) => {
                  if (e.target.value !== (exercise.notes ?? '')) runField(() => onUpdate(exercise.id, { notes: e.target.value || null }));
                }}
                className="w-full whitespace-pre-wrap rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
              />
            </div>
          )}
          {isCircuit && !canEdit && exercise.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500">{exercise.notes}</p>
          )}
          {renderExtra?.(exercise)}
        </div>
      </div>
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
            {supersetGroups.map((sg, sgIndex) => {
              const isSequenceable = sg.group && sg.exercises.length >= 2 && sg.exercises.every((e) => e.block_type === 'exercise');
              const minSets = isSequenceable ? Math.min(...sg.exercises.map((e) => e.sets ?? 1)) : 0;
              return (
                <li key={sgIndex} className={sg.group ? 'space-y-2 rounded-md border-l-4 border-accent/40 bg-accent-soft/40 py-2 pl-3 pr-1' : 'space-y-2'}>
                  {sg.group && (
                    <div className="flex items-center gap-1.5 px-0.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                        {sg.group}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Superset</span>
                    </div>
                  )}
                  {sg.exercises.map((ex) => {
                    const indexInDay = displayOrder.findIndex((e) => e.id === ex.id);
                    return (
                      <SortableExerciseRow
                        key={ex.id}
                        exercise={ex}
                        previousExercise={displayOrder[indexInDay - 1]}
                        index={indexInDay}
                        library={library}
                        canEdit={canEdit}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        clientExerciseMaxes={clientExerciseMaxes}
                        renderExtra={renderExtra}
                      />
                    );
                  })}
                  {isSequenceable && (
                    <div className="flex flex-wrap gap-1 px-0.5">
                      {Array.from({ length: minSets }).map((_, i) => (
                        <span key={i} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/10">
                          {sg.exercises.map((_, idx) => idx + 1).join('-')}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
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

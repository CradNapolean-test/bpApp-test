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
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu, type DropdownMenuItem } from '@/app/_components/DropdownMenu';
import { DefaultMuscleGroupIcon, MUSCLE_GROUP_ICONS } from './muscleGroups';
import type { BlockType, ClientExerciseMaxRow, ExerciseLibraryRow, PrescriptionType } from '@/lib/data/types';
import { groupBySuperset, nextSupersetLetter } from './exerciseGrouping';
import {
  BLOCK_FORMATS,
  SECTIONS,
  SECTION_TITLE,
  blockKey,
  blockFormatOf,
  conditioningIsSingle,
  exerciseBlockKey,
  formatDescription,
  normalisedBlock,
  parseBlockKey,
  strongBlock2IsSplit,
  PART_TITLE,
  type BlockPart,
  usesSections,
  slotOptions,
  type WorkoutSection,
} from '@/lib/workoutSections';

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
  section: WorkoutSection;
  block_no: number | null;
  block_format: string | null;
  block_part: BlockPart | null;
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
  section: WorkoutSection;
  block_no: number | null;
  block_format: string | null;
  block_part: BlockPart | null;
  // Template-only -- ignored by live workout_exercises callers.
  progression_load_increment: number | null;
  progression_every_weeks: number;
}

// What an edit can change. The progression fields only exist on template rows.
export type ExerciseUpdate = Partial<EditableExercise> & {
  progression_load_increment?: number | null;
  progression_every_weeks?: number;
};

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

const fieldCls =
  'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function blockLabel(section: WorkoutSection, blockNo: number | null, part: BlockPart | null = null) {
  const b = normalisedBlock(section, blockNo);
  if (b == null) return SECTION_TITLE[section];
  if (b === 0) return `${SECTION_TITLE[section]} · 20 min`;
  const base = `${SECTION_TITLE[section]} · Block ${b}`;
  return section === 'strong' && b === 2 && part ? `${base} · ${PART_TITLE[part]}` : base;
}

function keyLabel(key: string) {
  const { section, blockNo, part } = parseBlockKey(key);
  return blockLabel(section, blockNo, part);
}

// One line saying what to do, e.g. "3 × 8-10 · 20kg · RPE 8 · rest 60s".
function prescriptionSummary(ex: EditableExercise): string {
  if (ex.block_type === 'circuit') return ex.notes ? ex.notes.split('\n')[0] : 'Instructions';
  const parts: string[] = [];
  if (ex.sets != null && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
  else if (ex.sets != null) parts.push(`${ex.sets} sets`);
  else if (ex.reps) parts.push(ex.reps);
  if (ex.prescription_type === 'percent_1rm') {
    if (ex.percent_1rm != null) parts.push(`${ex.percent_1rm}% 1RM`);
  } else if (ex.load != null) parts.push(`${ex.load}kg`);
  if (ex.rpe != null) parts.push(`RPE ${ex.rpe}`);
  if (ex.rest_seconds != null) parts.push(`rest ${ex.rest_seconds}s`);
  return parts.length > 0 ? parts.join(' · ') : 'Tap to set sets and reps';
}

// ------------------------------------------------------------------ edit sheet

function ExerciseSheet<T extends EditableExercise>({
  exercise,
  library,
  showProgression,
  progression,
  blockOptions,
  currentBlock,
  onSave,
  onDelete,
  onClose,
}: {
  exercise: T;
  library: ExerciseLibraryRow[];
  showProgression?: boolean;
  progression: { increment: number | null; everyWeeks: number } | null;
  blockOptions: { key: string; label: string }[];
  currentBlock: string;
  onSave: (fields: ExerciseUpdate) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const isCircuit = exercise.block_type === 'circuit';
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(exercise.sets == null ? '' : String(exercise.sets));
  const [reps, setReps] = useState(exercise.reps ?? '');
  const [prescription, setPrescription] = useState<PrescriptionType>(exercise.prescription_type);
  const [load, setLoad] = useState(exercise.load == null ? '' : String(exercise.load));
  const [percent, setPercent] = useState(exercise.percent_1rm == null ? '' : String(exercise.percent_1rm));
  const [rpe, setRpe] = useState(exercise.rpe == null ? '' : String(exercise.rpe));
  const [rest, setRest] = useState(exercise.rest_seconds == null ? '' : String(exercise.rest_seconds));
  const [superset, setSuperset] = useState(exercise.superset_group ?? '');
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [video, setVideo] = useState(exercise.video_url ?? '');
  const [incr, setIncr] = useState(progression?.increment == null ? '' : String(progression.increment));
  const [every, setEvery] = useState(String(progression?.everyWeeks ?? 1));
  const [target, setTarget] = useState(currentBlock);
  const { run, busy } = useAction();
  const { run: runDelete } = useAction();

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const linked = exercise.exercise_library_id != null && library.some((l) => l.id === exercise.exercise_library_id);
  const percentNeedsLink = !isCircuit && prescription === 'percent_1rm' && !linked;

  async function save() {
    const fields: ExerciseUpdate = { name: name.trim() || exercise.name, notes: notes.trim() || null };
    if (!isCircuit) {
      const isPercent = prescription === 'percent_1rm';
      Object.assign(fields, {
        sets: num(sets),
        reps: reps.trim() || null,
        prescription_type: prescription,
        load: isPercent ? null : num(load),
        percent_1rm: isPercent ? num(percent) : null,
        rpe: num(rpe),
        rest_seconds: num(rest),
        superset_group: superset.trim() || null,
        video_url: video.trim() || null,
      });
      if (showProgression) {
        fields.progression_load_increment = isPercent ? null : num(incr);
        fields.progression_every_weeks = Number(every) > 0 ? Number(every) : 1;
      }
    }
    if (target !== currentBlock) {
      const { section, blockNo, part } = parseBlockKey(target);
      fields.section = section;
      fields.block_no = blockNo;
      fields.block_part = part;
    }
    await run(() => onSave(fields), { success: 'Saved', onDone: onClose });
  }

  return (
    <BottomSheet title={isCircuit ? 'Instructions' : exercise.name} onClose={onClose}>
      <div className="space-y-4">
        {isCircuit ? (
          <>
            <Field label="Title">
              <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="What to do">
              <textarea
                rows={4}
                className={fieldCls}
                placeholder="e.g. 10 min AMRAP: 40s row, 20 push press, 8 burpees"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sets">
                <input type="number" inputMode="numeric" className={fieldCls} value={sets} onChange={(e) => setSets(e.target.value)} />
              </Field>
              <Field label="Reps">
                <input className={fieldCls} value={reps} placeholder="8-10" onChange={(e) => setReps(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                {(['absolute', 'percent_1rm'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrescription(p)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                      prescription === p ? 'bg-accent text-accent-foreground' : 'border border-black/10 dark:border-white/15'
                    }`}
                  >
                    {p === 'absolute' ? 'Fixed weight' : '% of 1RM'}
                  </button>
                ))}
              </div>
              {prescription === 'absolute' ? (
                <Field label="Load (kg)">
                  <input type="number" inputMode="decimal" className={fieldCls} value={load} onChange={(e) => setLoad(e.target.value)} />
                </Field>
              ) : (
                <Field label="% of the member's tested max">
                  <input type="number" inputMode="decimal" className={fieldCls} value={percent} onChange={(e) => setPercent(e.target.value)} />
                </Field>
              )}
              {percentNeedsLink && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  % of 1RM needs the exercise to come from the library. Remove this one and add it from the library.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="RPE">
                <input type="number" inputMode="decimal" className={fieldCls} value={rpe} onChange={(e) => setRpe(e.target.value)} />
              </Field>
              <Field label="Rest (seconds)">
                <input type="number" inputMode="numeric" className={fieldCls} value={rest} onChange={(e) => setRest(e.target.value)} />
              </Field>
            </div>

            <Field label="Coaching notes">
              <textarea
                rows={2}
                className={fieldCls}
                placeholder="e.g. pause for a second at the bottom"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <Field label="Video link">
              <input className={fieldCls} value={video} placeholder="https://" onChange={(e) => setVideo(e.target.value)} />
            </Field>
            <Field label="Superset letter (same letter = done together)">
              <input className={fieldCls} value={superset} maxLength={3} placeholder="A" onChange={(e) => setSuperset(e.target.value)} />
            </Field>

            {showProgression && prescription === 'absolute' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Add (kg)">
                  <input type="number" inputMode="decimal" className={fieldCls} value={incr} placeholder="0" onChange={(e) => setIncr(e.target.value)} />
                </Field>
                <Field label="Every (weeks)">
                  <input type="number" inputMode="numeric" className={fieldCls} value={every} onChange={(e) => setEvery(e.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}

        <Field label="Section">
          <select className={fieldCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            {blockOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="button"
          disabled={busy || percentNeedsLink}
          onClick={save}
          className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => runDelete(onDelete, { success: 'Removed', onDone: onClose })}
          className="w-full rounded-full py-2 text-sm font-bold text-danger"
        >
          Remove from workout
        </button>
      </div>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ add pickers

function ExercisePickerSheet({
  library,
  title,
  onPick,
  onCustom,
  onClose,
}: {
  library: ExerciseLibraryRow[];
  title: string;
  onPick: (entry: ExerciseLibraryRow) => Promise<unknown>;
  onCustom: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, number>>({});

  const muscles = Array.from(new Set(library.map((l) => l.muscle_group).filter((m): m is string => !!m))).sort();
  const q = query.trim().toLowerCase();
  const matches = library.filter(
    (l) => (!muscle || l.muscle_group === muscle) && (!q || l.name.toLowerCase().includes(q))
  );
  const shown = matches.slice(0, 40);
  const exact = library.some((l) => l.name.toLowerCase() === q);
  const addedCount = Object.values(added).reduce((a, b) => a + b, 0);

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-3">
        <input
          autoFocus
          className={fieldCls}
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[null, ...muscles].map((m) => (
            <button
              key={m ?? 'all'}
              type="button"
              onClick={() => setMuscle(m)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                muscle === m ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
              }`}
            >
              {m ?? 'All'}
            </button>
          ))}
        </div>

        <div className="max-h-[48vh] divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {q && !exact && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => onCustom(query.trim()), {
                  onDone: () => {
                    setAdded((a) => ({ ...a, [`custom:${q}`]: (a[`custom:${q}`] ?? 0) + 1 }));
                    setQuery('');
                  },
                })
              }
              className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-bold text-accent"
            >
              + Add “{query.trim()}” as its own exercise
            </button>
          )}
          {shown.map((entry) => {
            const Icon = MUSCLE_GROUP_ICONS[entry.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;
            return (
              <button
                key={entry.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => onPick(entry), { onDone: () => setAdded((a) => ({ ...a, [entry.id]: (a[entry.id] ?? 0) + 1 })) })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10">
                  <Icon className="h-4 w-4 text-zinc-500" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.name}</span>
                  {entry.muscle_group && <span className="text-xs text-zinc-500">{entry.muscle_group}</span>}
                </span>
                {added[entry.id] ? (
                  <span className="shrink-0 text-xs font-bold text-success">Added{added[entry.id] > 1 ? ` ×${added[entry.id]}` : ''} ✓</span>
                ) : (
                  <span className="shrink-0 text-lg font-bold text-accent">+</span>
                )}
              </button>
            );
          })}
          {shown.length === 0 && !(q && !exact) && <p className="p-3 text-sm text-zinc-500">No exercises match.</p>}
          {matches.length > shown.length && (
            <p className="p-3 text-xs text-zinc-500">Showing the first {shown.length} of {matches.length}. Search to narrow down.</p>
          )}
        </div>

        <button type="button" onClick={onClose} className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground">
          {addedCount > 0 ? `Done (${addedCount} added)` : 'Done'}
        </button>
      </div>
    </BottomSheet>
  );
}

function InstructionsSheet({
  title,
  defaultFormat,
  onAdd,
  onClose,
}: {
  title: string;
  defaultFormat: string | null;
  onAdd: (name: string, notes: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [name, setName] = useState(defaultFormat ? `${defaultFormat}` : 'Instructions');
  const [notes, setNotes] = useState('');
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          A line or two of text for the block, such as the rounds and reps. It sits in the list like an exercise.
        </p>
        <Field label="Title">
          <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="What to do">
          <textarea
            autoFocus
            rows={4}
            className={fieldCls}
            placeholder="e.g. 10 min AMRAP: 40s row, 20 push press, 8 burpees, 40s sit-ups"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <button
          type="button"
          disabled={busy || !notes.trim()}
          onClick={() => run(() => onAdd(name.trim() || 'Instructions', notes.trim()), { success: 'Added', onDone: onClose })}
          className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </BottomSheet>
  );
}

function FormatSheet({
  title,
  current,
  onPick,
  onClose,
}: {
  title: string;
  current: string | null;
  onPick: (format: string | null) => Promise<unknown>;
  onClose: () => void;
}) {
  const { run } = useAction();
  const row = (name: string | null, description?: string) => (
    <button
      key={name ?? 'none'}
      type="button"
      onClick={() => run(() => onPick(name), { onDone: onClose })}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-black dark:text-zinc-50">{name ?? 'No format'}</span>
        {description && <span className="text-xs text-zinc-500">{description}</span>}
      </span>
      {current === name && <span className="text-sm font-bold text-accent">✓</span>}
    </button>
  );
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="max-h-[60vh] divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
        {row(null, 'Plain sets and reps')}
        {BLOCK_FORMATS.map((f) => row(f.name, f.description))}
      </div>
    </BottomSheet>
  );
}

// ------------------------------------------------------------------ rows

function BuilderRow<T extends EditableExercise>({
  exercise,
  index,
  library,
  menuItems,
  onOpen,
}: {
  exercise: T;
  index: number;
  library: ExerciseLibraryRow[];
  menuItems: DropdownMenuItem[];
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const libraryEntry = exercise.exercise_library_id ? library.find((e) => e.id === exercise.exercise_library_id) : undefined;
  const Icon = MUSCLE_GROUP_ICONS[libraryEntry?.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-black/[.06] bg-card px-2 py-2 dark:border-white/10"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="shrink-0 cursor-grab touch-none p-1 text-zinc-400 active:cursor-grabbing dark:text-zinc-600"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-[11px] font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {index + 1}
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
          {libraryEntry?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- coach-entered arbitrary URLs, no remote-image config configured
            <img src={libraryEntry.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-4 w-4 text-zinc-500" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{exercise.name}</span>
          <span className="block truncate text-xs text-zinc-500">{prescriptionSummary(exercise)}</span>
        </span>
      </button>
      <DropdownMenu items={menuItems} triggerLabel={`${exercise.name} actions`} />
    </div>
  );
}

// A member's view: a roomy card with the name and prescription on top, and everything they act
// on (video, last time, logging) running full width underneath rather than squeezed beside a
// number and an icon.
function MemberExerciseRow<T extends EditableExercise>({
  exercise,
  index,
  library,
  clientExerciseMaxes,
  renderExtra,
}: {
  exercise: T;
  index: number;
  library: ExerciseLibraryRow[];
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  renderExtra?: (exercise: T) => ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id, disabled: true });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isCircuit = exercise.block_type === 'circuit';
  const isPercent = exercise.prescription_type === 'percent_1rm';
  const resolvedMax = isPercent ? latestMax(clientExerciseMaxes, exercise.exercise_library_id) : null;
  const libraryEntry = exercise.exercise_library_id ? library.find((e) => e.id === exercise.exercise_library_id) : undefined;
  const Icon = MUSCLE_GROUP_ICONS[libraryEntry?.muscle_group ?? ''] ?? DefaultMuscleGroupIcon;
  const pill = 'rounded-full bg-black/[.06] px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300';
  return (
    <div ref={setNodeRef} style={style} className="rounded-2xl border border-black/[.06] bg-card p-4 shadow-sm dark:border-white/10">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-snug text-black dark:text-zinc-50">{exercise.name}</p>
          {!isCircuit && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exercise.sets != null && (
                <span className={pill}>
                  <span className="font-extrabold text-black dark:text-zinc-50">{exercise.sets}</span> sets
                </span>
              )}
              {exercise.reps != null && (
                <span className={pill}>
                  <span className="font-extrabold text-black dark:text-zinc-50">{exercise.reps}</span> reps
                </span>
              )}
              {isPercent
                ? exercise.percent_1rm != null && (
                    <span className={pill}>
                      <span className="font-extrabold text-black dark:text-zinc-50">{exercise.percent_1rm}%</span> 1RM
                    </span>
                  )
                : exercise.load != null && (
                    <span className={pill}>
                      <span className="font-extrabold text-black dark:text-zinc-50">{exercise.load}</span> kg
                    </span>
                  )}
              {exercise.rpe != null && (
                <span className={pill}>
                  RPE <span className="font-extrabold text-black dark:text-zinc-50">{exercise.rpe}</span>
                </span>
              )}
            </div>
          )}
          {isPercent && resolvedMax != null && exercise.percent_1rm != null && (
            <p className="mt-1.5 text-xs text-zinc-500">≈ {Math.round((resolvedMax.estimated1RM * exercise.percent_1rm) / 100)} kg</p>
          )}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/10">
          {libraryEntry?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- coach-entered arbitrary URLs, no remote-image config configured
            <img src={libraryEntry.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-5 w-5 text-zinc-500" />
          )}
        </span>
      </div>
      {exercise.notes && !isCircuit && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{exercise.notes}</p>}
      {isCircuit && exercise.notes && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-black/[.03] p-3 text-sm leading-relaxed text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
          {exercise.notes}
        </p>
      )}
      {renderExtra?.(exercise)}
    </div>
  );
}

// ------------------------------------------------------------------ editor

type SheetState =
  | { kind: 'edit'; id: string }
  | { kind: 'pick'; key: string }
  | { kind: 'note'; key: string }
  | { kind: 'format'; key: string }
  | null;

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
  memberChoices,
}: {
  exercises: T[];
  library: ExerciseLibraryRow[];
  canEdit: boolean;
  onAdd: (fields: NewExerciseFields) => Promise<unknown>;
  onUpdate: (id: string, fields: ExerciseUpdate) => Promise<unknown>;
  onDelete: (id: string, name: string) => Promise<unknown>;
  onReorder: (orderedIds: string[]) => Promise<unknown>;
  clientExerciseMaxes?: ClientExerciseMaxRow[];
  showProgression?: boolean;
  renderExtra?: (exercise: T) => ReactNode;
  // A member's Strong / Conditioning (and Upper / Lower) picks for this workout. When given, the member
  // chooses what to do in each 10-minute slot and only the chosen blocks show.
  memberChoices?: {
    slot1: string | null;
    slot2: string | null;
    // Called straight away on a tap; the caller updates the screen immediately and saves in the background.
    onChoose: (slot: 1 | 2, blockKey: string) => void;
  };
}) {
  const { run: runReorder } = useAction();
  const { run: runMutate } = useAction();
  const sorted = [...exercises].sort((a, b) => a.sort_order - b.sort_order);
  const idsKey = sorted.map((e) => e.id).join(',');
  const [orderedIds, setOrderedIds] = useState<string[]>(() => sorted.map((e) => e.id));
  const prevIdsKey = useRef(idsKey);
  const [sheet, setSheet] = useState<SheetState>(null);
  // A format chosen for a block that has no exercises yet; it is stamped on the first one added.
  const [pendingFormats, setPendingFormats] = useState<Record<string, string | null>>({});
  // Conditioning as one 20-minute block, chosen before any exercise is in it.
  const [pendingSingle, setPendingSingle] = useState(false);
  // Strong block 2 as Upper / Lower, chosen before any exercise is in it.
  const [pendingSplit, setPendingSplit] = useState(false);

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

  const byId = new Map(sorted.map((e) => [e.id, e]));
  const displayOrder = orderedIds.map((id) => byId.get(id)).filter((e): e is T => e != null);
  const blocks = new Map<string, T[]>();
  for (const ex of displayOrder) {
    const key = exerciseBlockKey(ex);
    const list = blocks.get(key);
    if (list) list.push(ex);
    else blocks.set(key, [ex]);
  }

  async function persistOrder(next: string[], previous: string[]) {
    setOrderedIds(next);
    const success = await runReorder(() => onReorder(next));
    if (!success) setOrderedIds(previous);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = byId.get(String(active.id));
    const o = byId.get(String(over.id));
    // Dragging only reorders inside a block; moving between sections is done from the edit sheet.
    if (!a || !o || exerciseBlockKey(a) !== exerciseBlockKey(o)) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    await persistOrder(arrayMove(orderedIds, oldIndex, newIndex), orderedIds);
  }

  const nextSort = (sorted.length === 0 ? -1 : Math.max(...sorted.map((e) => e.sort_order))) + 1;

  function formatFor(key: string): string | null {
    return blockFormatOf(blocks.get(key)) ?? pendingFormats[key] ?? null;
  }

  async function addRow(key: string, partial: Partial<NewExerciseFields> & Pick<NewExerciseFields, 'name' | 'block_type'>) {
    const { section, blockNo, part } = parseBlockKey(key);
    return onAdd({
      exercise_library_id: null,
      sets: null,
      reps: null,
      load: null,
      rpe: null,
      notes: null,
      video_url: null,
      superset_group: null,
      rest_seconds: null,
      sort_order: nextSort,
      prescription_type: 'absolute',
      percent_1rm: null,
      progression_load_increment: null,
      progression_every_weeks: 1,
      section,
      block_no: blockNo,
      block_part: part,
      block_format: formatFor(key),
      ...partial,
    });
  }

  function addFromLibrary(key: string, entry: ExerciseLibraryRow) {
    const { section } = parseBlockKey(key);
    // Warm-up and conditioning are timed or "as many as you can", so they don't start with sets and reps.
    const setsAndReps = section === 'lift' || section === 'strong';
    return addRow(key, {
      block_type: 'exercise',
      exercise_library_id: entry.id,
      name: entry.name,
      sets: setsAndReps ? (entry.default_sets ?? 3) : null,
      reps: setsAndReps ? (entry.default_reps ?? '8-10') : (entry.default_reps ?? null),
      rpe: entry.default_rpe ?? null,
      rest_seconds: entry.default_rest_seconds ?? null,
      video_url: entry.video_url ?? null,
    });
  }

  async function setFormat(key: string, format: string | null) {
    const rows = blocks.get(key) ?? [];
    if (rows.length === 0) {
      setPendingFormats((p) => ({ ...p, [key]: format }));
      return;
    }
    await Promise.all(rows.map((r) => onUpdate(r.id, { block_format: format })));
  }

  function moveWithinBlock(ex: T, direction: -1 | 1) {
    const list = blocks.get(exerciseBlockKey(ex)) ?? [];
    const i = list.findIndex((e) => e.id === ex.id);
    const neighbour = list[i + direction];
    if (!neighbour) return;
    const next = [...orderedIds];
    const a = next.indexOf(ex.id);
    const b = next.indexOf(neighbour.id);
    [next[a], next[b]] = [next[b], next[a]];
    return persistOrder(next, orderedIds);
  }

  function duplicate(ex: T) {
    const rest = ex;
    return runMutate(
      () =>
        onAdd({
          exercise_library_id: rest.exercise_library_id,
          name: rest.name,
          sets: rest.sets,
          reps: rest.reps,
          load: rest.load,
          rpe: rest.rpe,
          notes: rest.notes,
          video_url: rest.video_url,
          superset_group: null,
          rest_seconds: rest.rest_seconds,
          sort_order: nextSort,
          block_type: rest.block_type,
          prescription_type: rest.prescription_type,
          percent_1rm: rest.percent_1rm,
          section: rest.section ?? 'lift',
          block_no: rest.block_no ?? null,
          block_format: rest.block_format ?? null,
          block_part: rest.block_part ?? null,
          progression_load_increment: null,
          progression_every_weeks: 1,
        }),
      { success: 'Duplicated' }
    );
  }

  function menuFor(ex: T, listInBlock: T[]): DropdownMenuItem[] {
    const i = listInBlock.findIndex((e) => e.id === ex.id);
    const prev = listInBlock[i - 1];
    const items: DropdownMenuItem[] = [{ label: 'Edit', onSelect: () => setSheet({ kind: 'edit', id: ex.id }) }];
    items.push({ label: 'Duplicate', onSelect: () => duplicate(ex) });
    if (i > 0) items.push({ label: 'Move up', onSelect: () => moveWithinBlock(ex, -1) });
    if (i < listInBlock.length - 1) items.push({ label: 'Move down', onSelect: () => moveWithinBlock(ex, 1) });
    if (ex.block_type === 'exercise') {
      if (ex.superset_group) {
        items.push({ label: 'Unlink from superset', onSelect: () => runMutate(() => onUpdate(ex.id, { superset_group: null })) });
      } else if (prev && prev.block_type === 'exercise') {
        items.push({
          label: 'Superset with previous',
          onSelect: () =>
            runMutate(async () => {
              const group = prev.superset_group ?? nextSupersetLetter(displayOrder);
              if (!prev.superset_group) await onUpdate(prev.id, { superset_group: group });
              await onUpdate(ex.id, { superset_group: group });
            }),
        });
      }
    }
    items.push({
      label: 'Delete',
      destructive: true,
      onSelect: () => runMutate(() => onDelete(ex.id, ex.name), { success: 'Exercise deleted' }),
    });
    return items;
  }

  const condSingle = conditioningIsSingle(displayOrder) || (pendingSingle && !displayOrder.some((e) => e.section === 'conditioning'));
  const strongSplit = strongBlock2IsSplit(displayOrder) || (pendingSplit && !displayOrder.some((e) => e.section === 'strong' && e.block_no === 2));
  // The blocks a section shows right now, as keyed slots.
  type Slot = { key: string; blockNo: 0 | 1 | 2 | null; part: BlockPart | null };
  const slotsFor = (s: (typeof SECTIONS)[number]): Slot[] => {
    const slot = (blockNo: 0 | 1 | 2 | null, part: BlockPart | null = null): Slot => ({ key: blockKey(s.key, blockNo, part), blockNo, part });
    if (s.key === 'strong') return strongSplit ? [slot(1), slot(2, 'upper'), slot(2, 'lower')] : [slot(1), slot(2)];
    if (s.key === 'conditioning') return condSingle ? [slot(0)] : [slot(1), slot(2)];
    return s.blocks.map((b) => slot(b));
  };
  const blockOptions = SECTIONS.flatMap((s) => slotsFor(s).map((sl) => ({ key: sl.key, label: keyLabel(sl.key) })));

  // Splits Strong block 2 into Upper and Lower lists (what is there goes under Upper), or joins them back.
  async function setStrongSplit(split: boolean) {
    const rows = displayOrder.filter((e) => e.section === 'strong' && e.block_no === 2);
    if (rows.length === 0) {
      setPendingSplit(split);
      return;
    }
    await runMutate(() => Promise.all(rows.map((r) => onUpdate(r.id, { block_part: split ? 'upper' : null }))));
  }

  // Switches Conditioning between two 10-minute blocks and one 20-minute block, moving what is in it.
  async function setConditioningSingle(single: boolean) {
    const rows = displayOrder.filter((e) => e.section === 'conditioning');
    if (rows.length === 0) {
      setPendingSingle(single);
      return;
    }
    await runMutate(() => Promise.all(rows.map((r) => onUpdate(r.id, { block_no: single ? 0 : 1 }))));
  }

  const editing = sheet?.kind === 'edit' ? byId.get(sheet.id) : undefined;

  // ---- the member's and read-only view: plain list, with section headings only if the day uses them.
  if (!canEdit) {
    const sectioned = usesSections(displayOrder);
    const present = new Set(Array.from(blocks.entries()).filter(([, rows]) => rows.length > 0).map(([k]) => k));
    // With choices, only Warm-up and Lift are shown straight away; Strong / Conditioning appear as the
    // member's picks for the two 10-minute slots.
    const choosing_ = sectioned && !!memberChoices && Array.from(present).some((k) => k.startsWith('strong') || k.startsWith('conditioning'));
    const orderedBlocks: { key: string; title: string | null; rows: T[] }[] = [];
    if (sectioned) {
      for (const sec of SECTIONS) {
        if (choosing_ && (sec.key === 'strong' || sec.key === 'conditioning')) continue;
        const keys =
          sec.key === 'conditioning'
            ? [blockKey(sec.key, 0), blockKey(sec.key, 1), blockKey(sec.key, 2)]
            : sec.key === 'strong'
              ? [blockKey(sec.key, 1), blockKey(sec.key, 2), blockKey(sec.key, 2, 'upper'), blockKey(sec.key, 2, 'lower')]
              : sec.blocks.map((bn) => blockKey(sec.key, bn));
        for (const key of keys) {
          const rows = blocks.get(key) ?? [];
          if (rows.length === 0) continue;
          const format = blockFormatOf(rows);
          orderedBlocks.push({ key, title: `${keyLabel(key)}${format ? ` · ${format}` : ''}`, rows });
        }
      }
    } else {
      orderedBlocks.push({ key: 'all', title: null, rows: displayOrder });
    }

    const renderBlock = (key: string, title: string | null, rows: T[]) => {
      const description = title ? formatDescription(blockFormatOf(rows)) : undefined;
      return (
        <section key={key}>
          {title && (
            <div className="mb-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-accent">{title}</h3>
              {description && <p className="text-xs text-zinc-500">{description}</p>}
            </div>
          )}
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-4">
              {groupBySuperset(rows).map((sg, sgIndex) => (
                <li key={sgIndex} className={sg.group ? 'space-y-3 border-l-[3px] border-accent pl-3' : 'space-y-2'}>
                  {sg.group && (
                    <div className="flex items-center gap-1.5 px-0.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                        {sg.group}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Superset</span>
                      {sg.exercises.length >= 2 && sg.exercises.every((e) => e.block_type === 'exercise') && (
                        <span className="text-[11px] text-zinc-500">· alternate {sg.exercises.map((_, idx) => idx + 1).join(' → ')}</span>
                      )}
                    </div>
                  )}
                  {sg.exercises.map((ex) => (
                    <MemberExerciseRow
                      key={ex.id}
                      exercise={ex}
                      index={rows.findIndex((e) => e.id === ex.id)}
                      library={library}
                      clientExerciseMaxes={clientExerciseMaxes}
                      renderExtra={renderExtra}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </SortableContext>
        </section>
      );
    };

    const slotView = (slot: 1 | 2) => {
      if (!memberChoices) return null;
      const slot1 = memberChoices.slot1;
      const { options, locked } = slotOptions(present, slot, slot1);
      if (options.length === 0 && !locked) return null;
      const chosen = locked ?? (slot === 1 ? slot1 : memberChoices.slot2);
      const rows = chosen ? (blocks.get(chosen) ?? []) : [];
      const format = blockFormatOf(rows);
      return (
        <div key={`slot-${slot}`} className="space-y-3">
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">
            {locked ? 'Blocks 1 and 2 · 20 minutes' : `Block ${slot} · 10 minutes`}
          </p>
          {!locked && (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => memberChoices.onChoose(slot, o.key)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    chosen === o.key ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-700 dark:border-white/15 dark:text-zinc-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {locked && <p className="text-xs text-zinc-500">One long conditioning block covers both, so there is nothing to pick for block 2.</p>}
          {!chosen && (
            <p className="text-xs text-zinc-500">
              {slot === 1 ? 'Pick what you are doing for the first 10 minutes.' : 'Pick again for the second 10 minutes. You can switch.'}
            </p>
          )}
          {chosen && rows.length > 0 && renderBlock(chosen, `${keyLabel(chosen)}${format ? ` · ${format}` : ''}`, rows)}
        </div>
      );
    };

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter}>
        <div className="mt-2 space-y-6">
          {orderedBlocks.map((blk) => renderBlock(blk.key, blk.title, blk.rows))}
          {choosing_ && (
            <section className="space-y-4 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-accent">Strong or Conditioning</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Choose for each 10-minute block, and switch after the first if you want.</p>
              </div>
              {slotView(1)}
              {slotView(2)}
            </section>
          )}
        </div>
      </DndContext>
    );
  }

  // ---- the coach's builder
  return (
    <div className="mt-2 space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {SECTIONS.map((section) => (
          <div key={section.key} className="rounded-2xl border border-black/[.06] p-3 dark:border-white/10">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-black dark:text-zinc-50">{section.title}</h3>
              {section.key !== 'conditioning' && section.hint && <span className="text-xs text-zinc-500">{section.hint}</span>}
              {section.key === 'strong' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500">Block 2:</span>
                  {[false, true].map((split) => (
                    <button
                      key={String(split)}
                      type="button"
                      onClick={() => setStrongSplit(split)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        strongSplit === split ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-500 dark:border-white/15'
                      }`}
                    >
                      {split ? 'Upper / Lower' : 'One list'}
                    </button>
                  ))}
                </div>
              )}
              {section.key === 'conditioning' && (
                <div className="flex gap-1.5">
                  {[false, true].map((single) => (
                    <button
                      key={String(single)}
                      type="button"
                      onClick={() => setConditioningSingle(single)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        condSingle === single ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-500 dark:border-white/15'
                      }`}
                    >
                      {single ? '1 × 20 min' : '2 × 10 min'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {slotsFor(section).map(({ key, blockNo, part }) => {
                const rows = blocks.get(key) ?? [];
                const format = formatFor(key);
                return (
                  <div key={key}>
                    {(blockNo != null || rows.length > 0) && (
                      <div className="mb-1.5 flex items-center gap-2">
                        {blockNo != null && (
                          <span className="text-xs font-bold text-zinc-500">
                            {blockNo === 0 ? 'One block · 20 min' : part ? `Block ${blockNo} · ${PART_TITLE[part]}` : `Block ${blockNo} · 10 min`}
                          </span>
                        )}
                        {blockNo != null && (
                          <button
                            type="button"
                            onClick={() => setSheet({ kind: 'format', key })}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              format ? 'bg-accent-soft text-accent' : 'border border-dashed border-black/20 text-zinc-500 dark:border-white/20'
                            }`}
                          >
                            {format ?? 'Set format'}
                          </button>
                        )}
                      </div>
                    )}
                    <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-2">
                        {groupBySuperset(rows).map((sg, sgIndex) => (
                          <li
                            key={sgIndex}
                            className={sg.group ? 'space-y-2 rounded-lg border-l-4 border-accent/40 bg-accent-soft/40 py-2 pl-2 pr-1' : 'space-y-2'}
                          >
                            {sg.group && (
                              <div className="flex items-center gap-1.5 px-0.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                                  {sg.group}
                                </span>
                                <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Superset</span>
                              </div>
                            )}
                            {sg.exercises.map((ex) => (
                              <BuilderRow
                                key={ex.id}
                                exercise={ex}
                                index={rows.findIndex((r) => r.id === ex.id)}
                                library={library}
                                menuItems={menuFor(ex, rows)}
                                onOpen={() => setSheet({ kind: 'edit', id: ex.id })}
                              />
                            ))}
                          </li>
                        ))}
                      </ul>
                    </SortableContext>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSheet({ kind: 'pick', key })}
                        className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-extrabold text-accent-foreground"
                      >
                        + Exercise
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheet({ kind: 'note', key })}
                        className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-bold text-zinc-600 dark:border-white/15 dark:text-zinc-300"
                      >
                        + Instructions
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </DndContext>

      {editing && (
        <ExerciseSheet
          key={editing.id}
          exercise={editing}
          library={library}
          showProgression={showProgression}
          progression={
            showProgression
              ? (() => {
                  const t = editing as T & { progression_load_increment?: number | null; progression_every_weeks?: number };
                  return { increment: t.progression_load_increment ?? null, everyWeeks: t.progression_every_weeks ?? 1 };
                })()
              : null
          }
          blockOptions={blockOptions}
          currentBlock={exerciseBlockKey(editing)}
          onSave={async (fields) => {
            if (fields.section !== undefined) {
              // Moving to another block: take on that block's format.
              const dest = blockKey(fields.section, fields.block_no ?? null, fields.block_part ?? null);
              fields.block_format = blockFormatOf(blocks.get(dest)) ?? null;
            }
            await onUpdate(editing.id, fields);
          }}
          onDelete={async () => {
            await onDelete(editing.id, editing.name);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'pick' && (
        <ExercisePickerSheet
          library={library}
          title={`Add to ${keyLabel(sheet.key)}`}
          onPick={(entry) => addFromLibrary(sheet.key, entry)}
          onCustom={(name) => addRow(sheet.key, { block_type: 'exercise', name, sets: 3, reps: '8-10' })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'note' && (
        <InstructionsSheet
          title={`Instructions for ${keyLabel(sheet.key)}`}
          defaultFormat={formatFor(sheet.key)}
          onAdd={(name, notes) => addRow(sheet.key, { block_type: 'circuit', name, notes })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'format' && (
        <FormatSheet
          title={`Format · ${keyLabel(sheet.key)}`}
          current={formatFor(sheet.key)}
          onPick={(format) => setFormat(sheet.key, format)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

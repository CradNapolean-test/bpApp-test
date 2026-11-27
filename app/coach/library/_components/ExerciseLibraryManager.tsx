'use client';

import { useMemo, useRef, useState } from 'react';
import { Dumbbell, PlayCircle } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { MOVEMENT_LABEL, MUSCLE_GROUPS } from '@/app/_components/workouts/muscleGroups';
import {
  NO_FILTERS,
  NO_MOVEMENT,
  anyFilterOn,
  equipmentOptions,
  filterLibrary,
  hasVideo,
  isRetired,
  retiredStartIndex,
  type LibraryFilters,
  type StatusFilter,
} from '@/lib/exerciseLibraryList';
import { VideoDemo } from '@/app/_components/workouts/VideoDemo';
import {
  bulkCreateLibraryExercises,
  createLibraryExercise,
  deleteLibraryExercise,
  setExerciseActive,
  updateLibraryExercise,
} from '@/lib/data/exerciseLibrary';
import { toCsv, parseCsv, headerIndex, downloadTextFile } from '@/lib/utils/csv';
import { describeImport, prepareExerciseImport } from '@/lib/exerciseImport';
import { normaliseLessonLink } from '@/lib/lessonLink';
import type { ExerciseLibraryRow } from '@/lib/data/types';
import { NO_USAGE, deleteWording, usageLine, type ExerciseUsage } from '@/lib/exerciseUsage';
import { TRACKING, TRACKING_TYPES, isTrackingType, trackingOf, type TrackingType } from '@/lib/workoutTracking';
import { guessTrackingType } from '@/lib/trackingGuess';

const EXPORT_COLUMNS = [
  'name',
  'muscle_group',
  'equipment',
  'default_sets',
  'default_reps',
  'default_rpe',
  'default_rest_seconds',
  'tracking_type',
  'video_url',
  'image_url',
  'instructions',
  'notes',
] as const;

function exportExercises(exercises: ExerciseLibraryRow[]) {
  const csv = toCsv(
    [...EXPORT_COLUMNS],
    exercises.map((ex) => EXPORT_COLUMNS.map((col) => ex[col as keyof ExerciseLibraryRow] as string | number | null))
  );
  downloadTextFile(`exercise-library-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
}

// Tolerant CSV -> createLibraryExercise-shaped rows: numeric columns fall back to null on
// anything non-numeric (blank cell, stray text) rather than rejecting the whole row, since a
// coach's hand-edited spreadsheet is exactly the kind of input that has the odd blank cell.
function parseExerciseCsv(text: string): Omit<ExerciseLibraryRow, 'id' | 'created_by' | 'created_at'>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const col = headerIndex(rows[0]);
  const nameIdx = col('name');
  if (nameIdx < 0) throw new Error('CSV must have a "name" column');
  const numCol = (row: string[], key: string) => {
    const idx = col(key);
    if (idx < 0) return null;
    const n = Number(row[idx]);
    return row[idx]?.trim() && !Number.isNaN(n) ? n : null;
  };
  const strCol = (row: string[], key: string) => {
    const idx = col(key);
    return idx >= 0 ? row[idx]?.trim() || null : null;
  };
  return rows
    .slice(1)
    .filter((r) => r[nameIdx]?.trim())
    .map((r) => {
      // A file with no tracking column (or a blank cell) gets what the name suggests, as when typing one in.
      const tracking = strCol(r, 'tracking_type');
      return {
        name: r[nameIdx].trim(),
        muscle_group: strCol(r, 'muscle_group'),
        equipment: strCol(r, 'equipment'),
        default_sets: numCol(r, 'default_sets'),
        default_reps: strCol(r, 'default_reps'),
        default_rpe: numCol(r, 'default_rpe'),
        default_rest_seconds: numCol(r, 'default_rest_seconds'),
        tracking_type: isTrackingType(tracking) ? tracking : (guessTrackingType(r[nameIdx]) ?? 'weight_reps'),
        video_url: strCol(r, 'video_url'),
        image_url: strCol(r, 'image_url'),
        instructions: strCol(r, 'instructions'),
        notes: strCol(r, 'notes'),
      };
    });
}


const sheetField = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10';

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

// Add or edit an exercise. The things you reach for first (name, video, movement, equipment) are up top; the
// defaults a programme starts from, and the longer text, sit under "Defaults and notes". An exercise that is already in the library
// opens here from its row, so this is also where its video plays, where it says which templates and members' programmes use it, and the one place to retire,
// bring back or delete it (LB12).
function ExerciseFormSheet({
  exercise,
  usage = NO_USAGE,
  onClose,
  onDelete,
  onSetActive,
}: {
  exercise: ExerciseLibraryRow | null;
  // How many templates and members' programmes use it.
  usage?: ExerciseUsage;
  onClose: () => void;
  onDelete?: (id: string, name: string) => void;
  onSetActive?: (id: string, active: boolean) => void;
}) {
  const { run, busy } = useAction();
  const toast = useToast();
  const [name, setName] = useState(exercise?.name ?? '');
  const [videoUrl, setVideoUrl] = useState(exercise?.video_url ?? '');
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group ?? '');
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '');
  const [sets, setSets] = useState(exercise ? (exercise.default_sets == null ? '' : String(exercise.default_sets)) : '3');
  const [reps, setReps] = useState(exercise ? (exercise.default_reps ?? '') : '8-10');
  const [rpe, setRpe] = useState(exercise?.default_rpe == null ? '' : String(exercise.default_rpe));
  const [rest, setRest] = useState(exercise?.default_rest_seconds == null ? '' : String(exercise.default_rest_seconds));
  const [tracking, setTracking] = useState<TrackingType>(trackingOf(exercise?.tracking_type));
  // A new exercise's "What gets recorded" follows its name (a bike is calories) until the coach picks one.
  const [trackingPicked, setTrackingPicked] = useState(exercise != null);
  function changeName(value: string) {
    setName(value);
    if (!trackingPicked) setTracking(guessTrackingType(value) ?? 'weight_reps');
  }
  const [imageUrl, setImageUrl] = useState(exercise?.image_url ?? '');
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '');
  const [notes, setNotes] = useState(exercise?.notes ?? '');

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Links open on every member's phone, so both must be secure (https://) addresses; the database refuses anything else.
    const video = normaliseLessonLink(videoUrl);
    const image = normaliseLessonLink(imageUrl);
    if (!video.ok || !image.ok) {
      toast.error(!video.ok ? `Video link: ${video.error}` : `Image link: ${(image as { error: string }).error}`);
      return;
    }
    const fields = {
      name: name.trim(),
      video_url: video.url,
      muscle_group: muscleGroup || null,
      equipment: equipment.trim() || null,
      default_sets: num(sets),
      default_reps: reps.trim() || null,
      default_rpe: num(rpe),
      default_rest_seconds: num(rest),
      tracking_type: tracking,
      image_url: image.url,
      instructions: instructions.trim() || null,
      notes: notes.trim() || null,
    };
    await run(() => (exercise ? updateLibraryExercise(exercise.id, fields) : createLibraryExercise(fields)), {
      success: exercise ? 'Exercise updated' : 'Exercise added to library',
      onDone: onClose,
    });
  }

  return (
    <BottomSheet title={exercise ? 'Edit exercise' : 'Add an exercise'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {exercise && (
          <p className="text-xs font-semibold text-zinc-500">
            {isRetired(exercise) ? 'Retired: not offered for new programmes. ' : ''}
            {usageLine(usage)}
          </p>
        )}
        <Labeled label="Exercise name">
          <input required autoFocus={!exercise} className={sheetField} value={name} onChange={(e) => changeName(e.target.value)} />
        </Labeled>
        <Labeled label="Video link">
          <input className={sheetField} value={videoUrl} placeholder="https://" onChange={(e) => setVideoUrl(e.target.value)} />
          {exercise && hasVideo(exercise) && exercise.video_url === videoUrl && <VideoDemo videoUrl={exercise.video_url} title={exercise.name} />}
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label={MOVEMENT_LABEL}>
            <select className={sheetField} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
              <option value="">None</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Equipment">
            <input className={sheetField} value={equipment} placeholder="e.g. Barbell" onChange={(e) => setEquipment(e.target.value)} />
          </Labeled>
        </div>

        <Labeled label="What gets recorded">
          <select
            className={sheetField}
            value={tracking}
            onChange={(e) => {
              setTracking(e.target.value as TrackingType);
              setTrackingPicked(true);
            }}
          >
            {TRACKING_TYPES.map((t) => (
              <option key={t} value={t}>
                {TRACKING[t].label} ({TRACKING[t].hint})
              </option>
            ))}
          </select>
        </Labeled>

        <details open={!!exercise && !!(exercise.instructions || exercise.notes || exercise.image_url)} className="group rounded-xl border border-black/10 dark:border-white/10">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-bold text-black dark:text-zinc-50">
            Defaults and notes
            <span className="ml-2 text-xs font-medium text-zinc-500">sets, reps, rest, instructions</span>
          </summary>
          <div className="space-y-3 px-3.5 pb-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Default sets">
                <input type="number" inputMode="numeric" className={sheetField} value={sets} onChange={(e) => setSets(e.target.value)} />
              </Labeled>
              <Labeled label="Default reps">
                <input className={sheetField} value={reps} onChange={(e) => setReps(e.target.value)} />
              </Labeled>
              <Labeled label="Default RPE">
                <input type="number" inputMode="decimal" className={sheetField} value={rpe} onChange={(e) => setRpe(e.target.value)} />
              </Labeled>
              <Labeled label="Default rest (seconds)">
                <input type="number" inputMode="numeric" className={sheetField} value={rest} onChange={(e) => setRest(e.target.value)} />
              </Labeled>
            </div>
            <Labeled label="Image link">
              <input className={sheetField} value={imageUrl} placeholder="https://" onChange={(e) => setImageUrl(e.target.value)} />
            </Labeled>
            <Labeled label="Instructions">
              <textarea rows={3} className={sheetField} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </Labeled>
            <Labeled label="Notes">
              <textarea rows={2} className={sheetField} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Labeled>
          </div>
        </details>

        <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-accent text-[15px] font-extrabold text-accent-foreground disabled:opacity-50">
          {busy ? 'Saving…' : exercise ? 'Save' : 'Add to library'}
        </button>
        {exercise && (onSetActive || onDelete) && (
          <div className="flex flex-wrap justify-center gap-2 border-t border-black/[.07] pt-3 dark:border-white/10">
            {onSetActive && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetActive(exercise.id, isRetired(exercise))}
                className="h-11 rounded-full px-4 text-sm font-bold text-black hover:bg-black/5 disabled:opacity-50 dark:text-zinc-50 dark:hover:bg-white/5"
              >
                {isRetired(exercise) ? 'Bring back' : 'Retire exercise'}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(exercise.id, exercise.name)}
                className="h-11 rounded-full px-4 text-sm font-bold text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Delete exercise
              </button>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}

const PAGE_SIZE = 100;

// Two to a row on a phone, their own width from a tablet up.
const filterSelect =
  'h-11 min-w-0 flex-1 basis-36 rounded-xl border border-black/[.14] bg-card px-2.5 text-sm font-semibold text-black sm:flex-none sm:basis-auto sm:px-3 dark:border-white/15 dark:text-zinc-50';

export function ExerciseLibraryManager({
  initialExercises,
  usage = {},
}: {
  initialExercises: ExerciseLibraryRow[];
  // Where each exercise is used (templates and members' own programmes), by exercise id.
  usage?: Record<string, ExerciseUsage>;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { run: runDelete } = useAction();
  const { run: runImport, busy: importing } = useAction();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  // The library can hold hundreds of exercises -- render a page at a time so the tab stays fast.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const fileRef = useRef<HTMLInputElement>(null);

  const missingVideos = useMemo(() => initialExercises.filter((ex) => !hasVideo(ex)).length, [initialExercises]);
  const retiredCount = useMemo(() => initialExercises.filter(isRetired).length, [initialExercises]);
  const equipment = useMemo(() => equipmentOptions(initialExercises), [initialExercises]);
  const anyWithoutMovement = useMemo(() => initialExercises.some((ex) => !ex.muscle_group), [initialExercises]);

  function setFilter(patch: Partial<LibraryFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setVisible(PAGE_SIZE);
  }

  // An exercise a template or a member's programme uses cannot be deleted (the database refuses): offer to retire it instead, which hides
  // it from pickers and keeps it where it is used. The confirm says where that is (LB11).
  async function handleDelete(id: string, exerciseName: string) {
    const wording = deleteWording(usage[id] ?? NO_USAGE);
    if (wording.inUse) {
      const retire = await confirm({
        title: `“${exerciseName}” is in use`,
        body: wording.body,
        confirmLabel: 'Retire exercise',
      });
      if (!retire) return;
      await runDelete(() => setExerciseActive(id, false), { success: 'Exercise retired', onDone: () => setEditingId(null) });
      return;
    }
    const ok = await confirm({
      title: `Delete “${exerciseName}” from the library?`,
      body: wording.body,
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteLibraryExercise(id), { success: 'Exercise removed', onDone: () => setEditingId(null) });
  }

  // Retire (hidden from pickers, kept where it is used) or bring back: from the exercise's sheet only (LB12).
  async function handleSetActive(id: string, active: boolean) {
    await runDelete(() => setExerciseActive(id, active), {
      success: active ? 'Exercise is back in the library' : 'Exercise retired',
      onDone: () => setEditingId(null),
    });
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let rows: ReturnType<typeof parseExerciseCsv>;
      try {
        rows = parseExerciseCsv(String(reader.result ?? ''));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not parse that CSV');
        return;
      }
      if (rows.length === 0) {
        toast.error('No exercise rows found in that file');
        return;
      }
      const plan = prepareExerciseImport(rows, initialExercises);
      if (plan.tooMany || plan.rows.length === 0) {
        toast.error(plan.tooMany ? describeImport(plan) : 'Nothing new to import: every row is already in the library or has a link that is not https://');
        return;
      }
      await runImport(() => bulkCreateLibraryExercises(plan.rows), { success: describeImport(plan) });
    };
    reader.readAsText(file);
  }

  // A filter whose choice has gone (the only kettlebell exercise was changed, say) counts as "Any", as its box then shows.
  const active = useMemo<LibraryFilters>(
    () => ({
      ...filters,
      equipment: filters.equipment && !equipment.some((o) => o.key === filters.equipment) ? '' : filters.equipment,
      movement: filters.movement === NO_MOVEMENT && !anyWithoutMovement ? '' : filters.movement,
    }),
    [filters, equipment, anyWithoutMovement]
  );
  const filteredExercises = useMemo(() => filterLibrary(initialExercises, active), [initialExercises, active]);
  const shown = filteredExercises.slice(0, visible);
  const retiredAt = retiredStartIndex(shown);
  const filtering = anyFilterOn(active);

  const editing = editingId ? initialExercises.find((ex) => ex.id === editingId) : undefined;
  // The board's filter pill: black when on, an outline when off.
  const chip = (active: boolean) =>
    `h-11 shrink-0 rounded-full px-3.5 text-sm font-bold transition-colors ${
      active
        ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
        : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {initialExercises.length > 0 && (
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder={`Search ${initialExercises.length} exercises`}
            aria-label="Search exercises"
            className="h-11 min-w-0 flex-1 basis-56 rounded-xl border border-black/[.16] bg-card px-3.5 text-base sm:text-[15px] md:max-w-sm dark:border-white/15"
          />
        )}
        <span className="flex-1" />
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground hover:opacity-90"
        >
          + New exercise
        </button>
        <DropdownMenu
          variant="header"
          triggerLabel="More library actions"
          items={[
            { label: 'Export CSV', onSelect: () => exportExercises(initialExercises), disabled: initialExercises.length === 0 },
            { label: importing ? 'Importing…' : 'Import CSV', onSelect: () => fileRef.current?.click(), disabled: importing },
          ]}
        />
      </div>

      {adding && <ExerciseFormSheet exercise={null} onClose={() => setAdding(false)} />}
      {editing && (
        <ExerciseFormSheet
          key={editing.id}
          exercise={editing}
          usage={usage[editing.id] ?? NO_USAGE}
          onClose={() => setEditingId(null)}
          onDelete={handleDelete}
          onSetActive={handleSetActive}
        />
      )}

      {initialExercises.length > 0 && (
        <div role="group" aria-label="Filter exercises" className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Filter by ${MOVEMENT_LABEL.toLowerCase()}`}
            className={filterSelect}
            value={active.movement}
            onChange={(e) => setFilter({ movement: e.target.value })}
          >
            <option value="">Any {MOVEMENT_LABEL.toLowerCase()}</option>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            {anyWithoutMovement && <option value={NO_MOVEMENT}>No {MOVEMENT_LABEL.toLowerCase()} set</option>}
          </select>
          {equipment.length > 0 && (
            <select
              aria-label="Filter by equipment"
              className={filterSelect}
              value={active.equipment}
              onChange={(e) => setFilter({ equipment: e.target.value })}
            >
              <option value="">Any equipment</option>
              {equipment.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} ({o.count})
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Active or retired"
            className={filterSelect}
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value as StatusFilter })}
          >
            <option value="all">Active and retired</option>
            <option value="active">Active only</option>
            <option value="retired">Retired only ({retiredCount})</option>
          </select>
          {missingVideos > 0 && (
            <button
              type="button"
              aria-pressed={filters.noVideoOnly}
              onClick={() => setFilter({ noVideoOnly: !filters.noVideoOnly })}
              className={chip(filters.noVideoOnly)}
            >
              No video ({missingVideos})
            </button>
          )}
          {filtering && (
            <button
              type="button"
              onClick={() => setFilter(NO_FILTERS)}
              className="h-11 shrink-0 rounded-full px-3 text-sm font-bold text-accent hover:bg-accent/10"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredExercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={initialExercises.length === 0 ? 'No library exercises yet' : 'No exercises match'}
          hint={
            initialExercises.length === 0
              ? 'Add exercises here once and pick them when building any member’s programme or a programme template.'
              : 'Try a different search or filter.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
          <div className="flex items-baseline justify-between gap-3 border-b border-black/[.07] px-4 py-2 text-xs font-semibold text-zinc-500 dark:border-white/10">
            <span>{filtering ? `${filteredExercises.length} of ${initialExercises.length} exercises` : `${initialExercises.length} exercises`}</span>
            <span className="hidden md:inline">Tap one to see or edit it</span>
          </div>
          {/* Column names, laptop and up. On a phone each row says the same on its second line. */}
          <div
            aria-hidden
            className={`${rowGrid} hidden border-b border-black/[.07] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400 md:grid dark:border-white/10`}
          >
            <span>Exercise</span>
            <span>{MOVEMENT_LABEL}</span>
            <span>Records</span>
            <span className="text-right">Video</span>
          </div>
          <ul className="divide-y divide-black/[.06] dark:divide-white/10">
            {shown.map((ex, i) => (
              <li key={ex.id}>
                {i === retiredAt && (
                  <p className="border-b border-black/[.06] bg-black/[.02] px-4 py-1.5 text-xs font-bold text-zinc-500 dark:border-white/10 dark:bg-white/[.03]">
                    Retired: not offered for new programmes
                  </p>
                )}
                <ExerciseRow exercise={ex} onOpen={() => setEditingId(ex.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {filteredExercises.length > visible && (
        <div className="flex flex-col items-center gap-1 pt-1">
          <p className="text-xs text-zinc-500">
            Showing {visible} of {filteredExercises.length}
          </p>
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="flex h-11 items-center rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
          >
            Show {Math.min(PAGE_SIZE, filteredExercises.length - visible)} more
          </button>
        </div>
      )}
    </div>
  );
}

// Laptop: name, movement, what it records, video. Phone: the name with the rest on a second line, and the video mark on the right.
const rowGrid = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem_5rem]';

// One exercise as a compact row (LB5: about 15 to a laptop screen instead of 4 cards). Tapping it opens its sheet: everything the card
// showed, the fields to edit, and Retire and Delete (LB12: one way to each).
function ExerciseRow({ exercise: ex, onOpen }: { exercise: ExerciseLibraryRow; onOpen: () => void }) {
  const retired = isRetired(ex);
  const video = hasVideo(ex);
  const records = TRACKING[trackingOf(ex.tracking_type)].label;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${rowGrid} min-h-11 w-full px-4 py-1.5 text-left md:min-h-9 md:py-1 hover:bg-black/[.03] focus-visible:bg-black/[.03] dark:hover:bg-white/[.04] dark:focus-visible:bg-white/[.04]`}
    >
      <span className="min-w-0">
        <span className={`flex min-w-0 items-baseline gap-2 text-sm font-bold ${retired ? 'text-zinc-500' : 'text-black dark:text-zinc-50'}`}>
          <span className="truncate">{ex.name}</span>
          {ex.equipment && <span className="hidden min-w-0 truncate text-xs font-medium text-zinc-500 lg:inline">{ex.equipment}</span>}
          {retired && (
            <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10">
              Retired
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-zinc-500 md:hidden">{[ex.muscle_group, records].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="hidden truncate text-[13px] text-zinc-600 md:block dark:text-zinc-400">{ex.muscle_group ?? '—'}</span>
      <span className="hidden truncate text-[13px] text-zinc-600 md:block dark:text-zinc-400">{records}</span>
      <span className="flex justify-end">
        {video ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500">
            <PlayCircle aria-hidden className="h-4 w-4 text-success" />
            <span className="sr-only md:not-sr-only">Video</span>
          </span>
        ) : (
          <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-amber-100 px-2 text-[11px] font-extrabold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            No video
          </span>
        )}
      </span>
    </button>
  );
}

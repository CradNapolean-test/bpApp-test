'use client';

import { useMemo, useRef, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { MUSCLE_GROUPS } from '@/app/_components/workouts/muscleGroups';
import { VideoDemo } from '@/app/_components/workouts/VideoDemo';
import {
  bulkCreateLibraryExercises,
  createLibraryExercise,
  deleteLibraryExercise,
  updateLibraryExercise,
} from '@/lib/data/exerciseLibrary';
import { toCsv, parseCsv, headerIndex, downloadTextFile } from '@/lib/utils/csv';
import type { ExerciseLibraryRow } from '@/lib/data/types';

const EXPORT_COLUMNS = [
  'name',
  'muscle_group',
  'equipment',
  'default_sets',
  'default_reps',
  'default_rpe',
  'default_rest_seconds',
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
    .map((r) => ({
      name: r[nameIdx].trim(),
      muscle_group: strCol(r, 'muscle_group'),
      equipment: strCol(r, 'equipment'),
      default_sets: numCol(r, 'default_sets'),
      default_reps: strCol(r, 'default_reps'),
      default_rpe: numCol(r, 'default_rpe'),
      default_rest_seconds: numCol(r, 'default_rest_seconds'),
      video_url: strCol(r, 'video_url'),
      image_url: strCol(r, 'image_url'),
      instructions: strCol(r, 'instructions'),
      notes: strCol(r, 'notes'),
    }));
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

// Add or edit an exercise. The things you reach for first (name, video, muscle, equipment) are up top; the
// defaults a programme starts from, and the longer text, sit under "Defaults and notes".
function ExerciseFormSheet({
  exercise,
  onClose,
  onDelete,
}: {
  exercise: ExerciseLibraryRow | null;
  onClose: () => void;
  onDelete?: (id: string, name: string) => void;
}) {
  const { run, busy } = useAction();
  const [name, setName] = useState(exercise?.name ?? '');
  const [videoUrl, setVideoUrl] = useState(exercise?.video_url ?? '');
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group ?? '');
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '');
  const [sets, setSets] = useState(exercise ? (exercise.default_sets == null ? '' : String(exercise.default_sets)) : '3');
  const [reps, setReps] = useState(exercise ? (exercise.default_reps ?? '') : '8-10');
  const [rpe, setRpe] = useState(exercise?.default_rpe == null ? '' : String(exercise.default_rpe));
  const [rest, setRest] = useState(exercise?.default_rest_seconds == null ? '' : String(exercise.default_rest_seconds));
  const [imageUrl, setImageUrl] = useState(exercise?.image_url ?? '');
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '');
  const [notes, setNotes] = useState(exercise?.notes ?? '');

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      name: name.trim(),
      video_url: videoUrl.trim() || null,
      muscle_group: muscleGroup || null,
      equipment: equipment.trim() || null,
      default_sets: num(sets),
      default_reps: reps.trim() || null,
      default_rpe: num(rpe),
      default_rest_seconds: num(rest),
      image_url: imageUrl.trim() || null,
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
        <Labeled label="Exercise name">
          <input required autoFocus={!exercise} className={sheetField} value={name} onChange={(e) => setName(e.target.value)} />
        </Labeled>
        <Labeled label="Video link">
          <input className={sheetField} value={videoUrl} placeholder="https://" onChange={(e) => setVideoUrl(e.target.value)} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Muscle group">
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

        <button type="submit" disabled={busy} className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50">
          {busy ? 'Saving…' : exercise ? 'Save' : 'Add to library'}
        </button>
        {exercise && onDelete && (
          <button type="button" onClick={() => onDelete(exercise.id, exercise.name)} className="w-full rounded-full py-2 text-sm font-bold text-danger">
            Delete exercise
          </button>
        )}
      </form>
    </BottomSheet>
  );
}

const PAGE_SIZE = 60;

export function ExerciseLibraryManager({
  initialExercises,
  usage = {},
}: {
  initialExercises: ExerciseLibraryRow[];
  // How many programme templates use each exercise, by exercise id.
  usage?: Record<string, number>;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { run: runDelete } = useAction();
  const { run: runImport, busy: importing } = useAction();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState('');
  const [noVideoOnly, setNoVideoOnly] = useState(false);
  const [search, setSearch] = useState('');
  // The library can hold hundreds of exercises -- render a page at a time so the tab stays fast.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasVideo = (ex: ExerciseLibraryRow) => !!(ex.video_url?.startsWith('http://') || ex.video_url?.startsWith('https://'));
  const missingVideos = useMemo(() => initialExercises.filter((ex) => !hasVideo(ex)).length, [initialExercises]);

  async function handleDelete(id: string, exerciseName: string) {
    const ok = await confirm({
      title: `Delete “${exerciseName}” from the library?`,
      body: 'This only removes it from the shared library — programs that already used it are unaffected.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteLibraryExercise(id), { success: 'Exercise removed', onDone: () => setEditingId(null) });
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
      await runImport(() => bulkCreateLibraryExercises(rows), {
        success: `Imported ${rows.length} exercise${rows.length === 1 ? '' : 's'}`,
      });
    };
    reader.readAsText(file);
  }

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialExercises.filter(
      (ex) =>
        (!filterGroup || ex.muscle_group === filterGroup) &&
        (!noVideoOnly || !hasVideo(ex)) &&
        (!q || ex.name.toLowerCase().includes(q) || (ex.equipment ?? '').toLowerCase().includes(q))
    );
  }, [initialExercises, filterGroup, noVideoOnly, search]);

  const editing = editingId ? initialExercises.find((ex) => ex.id === editingId) : undefined;
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
      active
        ? 'border-accent bg-accent-soft text-accent'
        : 'border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          + Add exercise
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
      {editing && <ExerciseFormSheet key={editing.id} exercise={editing} onClose={() => setEditingId(null)} onDelete={handleDelete} />}

      {initialExercises.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE_SIZE);
          }}
          placeholder={`Search ${initialExercises.length} exercises…`}
          className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base md:max-w-sm dark:border-white/10"
        />
      )}

      {initialExercises.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Filter:</span>
          <button
            onClick={() => {
              setFilterGroup('');
              setNoVideoOnly(false);
              setVisible(PAGE_SIZE);
            }}
            className={chip(filterGroup === '' && !noVideoOnly)}
          >
            All
          </button>
          {missingVideos > 0 && (
            <button
              onClick={() => {
                setNoVideoOnly((v) => !v);
                setVisible(PAGE_SIZE);
              }}
              className={chip(noVideoOnly)}
            >
              No video ({missingVideos})
            </button>
          )}
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => {
                setFilterGroup(filterGroup === g ? '' : g);
                setVisible(PAGE_SIZE);
              }}
              className={chip(filterGroup === g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {filteredExercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={initialExercises.length === 0 ? 'No library exercises yet' : 'No exercises match'}
          hint={
            initialExercises.length === 0
              ? 'Add exercises here once and pick them when building any client\'s program or a programme template.'
              : 'Try a different search or muscle group.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredExercises.slice(0, visible).map((ex) => {
            const templates = usage[ex.id] ?? 0;
            return (
              <div
                key={ex.id}
                className="rounded-2xl border border-black/[.05] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{ex.name}</p>
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1 text-sm font-semibold">
                    <button type="button" onClick={() => setEditingId(ex.id)} className="rounded-full px-2.5 py-1 text-accent hover:bg-accent/10">
                      Edit
                    </button>
                    <DropdownMenu
                      triggerLabel={`More actions for ${ex.name}`}
                      items={[{ label: 'Delete exercise', destructive: true, onSelect: () => handleDelete(ex.id, ex.name) }]}
                    />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">{[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ') || 'No muscle group or equipment set'}</p>
                {ex.default_sets != null && (
                  <p className="mt-1 text-sm text-zinc-500">
                    Default {ex.default_sets}×{ex.default_reps ?? '—'}
                    {ex.default_rpe != null ? ` · RPE ${ex.default_rpe}` : ''}
                    {ex.default_rest_seconds != null ? ` · rest ${ex.default_rest_seconds}s` : ''}
                  </p>
                )}
                {hasVideo(ex) ? (
                  <VideoDemo videoUrl={ex.video_url as string} title={ex.name} />
                ) : (
                  <button type="button" onClick={() => setEditingId(ex.id)} className="mt-1 text-xs font-semibold text-warning">
                    No video linked · add one
                  </button>
                )}
                {templates > 0 && (
                  <p className="mt-1.5 text-xs text-zinc-400">
                    In {templates} programme template{templates === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            );
          })}
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
            className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-semibold text-accent dark:border-white/10"
          >
            Show {Math.min(PAGE_SIZE, filteredExercises.length - visible)} more
          </button>
        </div>
      )}
    </div>
  );
}

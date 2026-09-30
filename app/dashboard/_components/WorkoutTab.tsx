'use client';

import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useToast } from '@/app/_components/ToastProvider';
import { ProgramDayList, type ProgramDaySummary } from '@/app/_components/workouts/ProgramDayList';
import { VideoDemo } from '@/app/_components/workouts/VideoDemo';
import {
  addExercise,
  addProgramDay,
  applyFieldsToDay,
  createProgram,
  deleteExercise,
  deleteProgram,
  deleteProgramDay,
  duplicateProgramDay,
  logSet,
  reorderExercises,
  updateExercise,
  updateProgram,
  updateProgramDay, updateSet, deleteSet } from '@/lib/data/workouts';
import { instantiateProgramTemplate } from '@/lib/data/programTemplates';
import { recordExerciseMax } from '@/lib/data/clientExerciseMaxes';
import { submitDayFeedback } from '@/lib/data/workoutDayFeedback';
import { resolveActiveProgram } from '@/lib/utils/checkin';
import { DEFAULT_TIMEZONE, PROGRAM_WEEKDAYS, WEEKDAY_SHORT, daysBetween, isoDateInTz, todayIsoInTz } from '@/lib/utils/dates';
import type {
  ClientExerciseMaxRow,
  ClientProfileRow,
  ExerciseLibraryRow,
  ProgramTemplateRow,
  SetType,
  WorkoutDayFeedbackRow,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';

function StartFromTemplateForm({ clientId, templates }: { clientId: string; templates: ProgramTemplateRow[] }) {
  const { run, busy } = useAction();
  const [templateId, setTemplateId] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    await run(() => instantiateProgramTemplate(templateId, clientId, template?.name ?? ''), {
      success: 'Programme started from template',
      onDone: () => setTemplateId(''),
    });
  }

  if (templates.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <div className="flex-1 space-y-1">
        <label className="text-xs font-medium text-zinc-500">Start from a programme template</label>
        <select
          required
          className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="" disabled>
            Choose a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50">
        {busy ? 'Starting…' : 'Start programme'}
      </button>
    </form>
  );
}

// Either party can record a tested/estimated max (RLS: owns_client) -- this is what makes
// %1RM prescriptions resolve to an actual target load for a given client.
function RecordMaxForm({ clientId, library, bare = false }: { clientId: string; library: ExerciseLibraryRow[]; bare?: boolean }) {
  const { run, busy } = useAction();
  const [libraryId, setLibraryId] = useState('');
  const [max, setMax] = useState<number | ''>('');
  const [reps, setReps] = useState<number | ''>(1);
  const [estimated, setEstimated] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!libraryId || max === '') return;
    await run(() => recordExerciseMax(clientId, libraryId, max, estimated, reps === '' ? 1 : reps), {
      success: 'Tested max recorded',
      onDone: () => {
        setLibraryId('');
        setMax('');
        setReps(1);
        setEstimated(false);
      },
    });
  }

  if (library.length === 0) return null;

  const inputBase = 'h-11 w-full min-w-0 rounded-xl border border-black/10 bg-transparent px-3 text-base dark:border-white/10';

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-3 ${bare ? '' : 'rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10'}`}
    >
      <div className="space-y-1">
        {!bare && <label className="text-xs font-medium text-zinc-500">Record a tested max</label>}
        <select required className={inputBase} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
          <option value="" disabled>
            Exercise…
          </option>
          {library.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
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
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-accent px-6 text-sm font-extrabold text-accent-foreground disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function RestTimer({ seconds }: { seconds: number }) {
  // Mounted fresh each time via key={timerKey} in LogSetForm, so the initial state here is
  // always the correct starting point -- no need to also reset it inside the effect.
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (remaining <= 0) return null;
  const mm = Math.floor(remaining / 60);
  const ss = (remaining % 60).toString().padStart(2, '0');
  return <p className="mt-1 text-xs font-medium text-accent">Rest: {mm}:{ss}</p>;
}

function LogSetForm({
  clientId,
  exerciseId,
  nextSetNumber,
  totalSets,
  restSeconds,
  initialReps,
  initialLoad,
  lastSet,
  priorBest,
}: {
  clientId: string;
  exerciseId: string;
  nextSetNumber: number;
  totalSets: number | null;
  restSeconds: number | null;
  initialReps: number | null;
  initialLoad: number | null;
  // What the member did for this same set number last time.
  lastSet: { reps: number | null; load: number | null } | null;
  // Heaviest load from earlier sessions of this exercise; a heavier set is a new best.
  priorBest: number | null;
}) {
  const { run, busy } = useAction();
  // Reps and load carry over between sets (they're usually the same), so after logging only the
  // RPE is cleared. First set starts from what was done last time, if anything.
  const [reps, setReps] = useState<number | ''>(initialReps ?? '');
  const [load, setLoad] = useState<number | ''>(initialLoad ?? '');
  const [rpe, setRpe] = useState<number | ''>('');
  const [timerKey, setTimerKey] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        logSet(clientId, exerciseId, {
          set_number: nextSetNumber,
          actual_reps: reps === '' ? null : reps,
          actual_load: load === '' ? null : load,
          actual_rpe: rpe === '' ? null : rpe,
          set_type: 'working' as SetType,
        }),
      {
        success:
          load !== '' && priorBest != null && load > priorBest ? `Set ${nextSetNumber} logged — new best! 🏆` : `Set ${nextSetNumber} logged`,
        onDone: () => {
          setRpe('');
          if (restSeconds != null) setTimerKey((k) => k + 1);
        },
      }
    );
  }

  const numberInput = (label: string, value: number | '', set: (v: number | '') => void, inputMode: 'numeric' | 'decimal') => (
    <label className="block">
      <span className="mb-1 block text-center text-[11px] font-medium text-zinc-500">{label}</span>
      <input
        type="number"
        inputMode={inputMode}
        step="any"
        className="h-11 w-full min-w-0 rounded-xl border border-black/10 bg-card px-2 text-center text-base font-semibold dark:border-white/10"
        value={value}
        onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="mt-3 rounded-2xl bg-black/[.03] p-3 dark:bg-white/[.04]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-sm font-bold text-black dark:text-zinc-50">
          Set {nextSetNumber}
          {totalSets ? <span className="font-medium text-zinc-500"> of {totalSets}</span> : null}
        </span>
        {lastSet && (lastSet.reps != null || lastSet.load != null) && (
          <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            Last: {lastSet.reps ?? '—'} × {lastSet.load ?? '—'}
          </span>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="grid grid-cols-3 gap-2">
          {numberInput('Reps', reps, setReps, 'numeric')}
          {numberInput('Load', load, setLoad, 'decimal')}
          {numberInput('RPE', rpe, setRpe, 'decimal')}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Logging…' : `Log set ${nextSetNumber}`}
        </button>
      </form>
      {restSeconds != null && timerKey > 0 && <RestTimer key={timerKey} seconds={restSeconds} />}
    </div>
  );
}

function SetEditSheet({ log, index, onClose }: { log: WorkoutLogRow; index: number; onClose: () => void }) {
  const { run, busy } = useAction();
  const [reps, setReps] = useState<number | ''>(log.actual_reps ?? '');
  const [load, setLoad] = useState<number | ''>(log.actual_load ?? '');
  const [rpe, setRpe] = useState<number | ''>(log.actual_rpe ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const field = (label: string, value: number | '', set: (v: number | '') => void) => (
    <label className="block">
      <span className="mb-1 block text-center text-[11px] font-medium text-zinc-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className="h-11 w-full min-w-0 rounded-xl border border-black/10 bg-card px-2 text-center text-base font-semibold dark:border-white/10"
        value={value}
        onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  );

  return (
    <BottomSheet title={`Edit set ${index}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              updateSet(log.id, {
                actual_reps: reps === '' ? null : reps,
                actual_load: load === '' ? null : load,
                actual_rpe: rpe === '' ? null : rpe,
              }),
            { success: 'Set updated', onDone: onClose }
          );
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-3 gap-2">
          {field('Reps', reps, setReps)}
          {field('Load', load, setLoad)}
          {field('RPE', rpe, setRpe)}
        </div>
        <button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            confirmingDelete
              ? void run(() => deleteSet(log.id), { success: 'Set deleted', onDone: onClose })
              : setConfirmingDelete(true)
          }
          className="block w-full py-1 text-sm font-semibold text-danger disabled:opacity-50"
        >
          {confirmingDelete ? 'Tap again to delete this set' : 'Delete this set'}
        </button>
      </form>
    </BottomSheet>
  );
}

function DayFeedbackForm({
  clientId,
  programDayId,
  isCoachView,
  feedback,
}: {
  clientId: string;
  programDayId: string;
  isCoachView: boolean;
  feedback: WorkoutDayFeedbackRow | undefined;
}) {
  const { run, busy } = useAction();
  const [rpe, setRpe] = useState<number | ''>(feedback?.session_rpe ?? '');
  const [notes, setNotes] = useState(feedback?.notes ?? '');

  if (isCoachView) {
    if (!feedback) return null;
    return (
      <p className="mt-2 border-t border-black/5 pt-2 text-xs text-zinc-500 dark:border-white/5">
        Session RPE {feedback.session_rpe ?? '—'}/10{feedback.notes ? ` — “${feedback.notes}”` : ''}
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(() => submitDayFeedback(clientId, programDayId, rpe === '' ? null : rpe, notes || null), {
      success: feedback ? 'Rating updated' : 'Session rated',
    });
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 border-t border-black/5 pt-2 dark:border-white/5">
      <p className="font-bold text-black dark:text-zinc-50">{feedback ? 'Update rating' : 'Rate this session'}</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRpe(n)}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              rpe === n
                ? 'bg-accent text-accent-foreground'
                : 'bg-black/5 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input placeholder="Notes (optional)" className={`${inputCls} w-48`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
          Save
        </button>
      </div>
    </form>
  );
}

function PhaseLabelInput({ dayId, initial }: { dayId: string; initial: string | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial ?? '');

  async function handleBlur() {
    if (value === (initial ?? '')) return;
    await run(() => updateProgramDay(dayId, { phase_label: value || null }));
  }

  return (
    <input
      placeholder="Phase (optional)"
      className="w-28 shrink-0 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

// Which weekday (Mon-Sat) this day falls on -- shared by every week of the block (Week 1's
// Monday and Week 2's Monday share the same value). A class scheduled for the same weekday
// auto-links to it for client check-in, see lib/utils/checkin.ts. Editable after the fact,
// not just at Add-day time.
function DayOfWeekSelect({ dayId, initial }: { dayId: string; initial: number | null }) {
  const { run } = useAction();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const parsed = e.target.value === '' ? null : Number(e.target.value);
    if (parsed === initial) return;
    await run(() => updateProgramDay(dayId, { day_position: parsed }));
  }

  return (
    <select
      title="Day of the week -- a class scheduled the same day auto-links here for client check-in"
      className="w-20 shrink-0 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={initial ?? ''}
      onChange={handleChange}
    >
      <option value="">Day…</option>
      {PROGRAM_WEEKDAYS.map((d) => (
        <option key={d} value={d}>
          {WEEKDAY_SHORT[d]}
        </option>
      ))}
    </select>
  );
}

// The rolling-block anchor: "current week" for check-in resolution is computed from this
// date, not stored separately -- see lib/utils/checkin.ts.
function ProgramStartDateInput({ programId, initial }: { programId: string; initial: string | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial ?? '');

  async function handleChange(next: string) {
    setValue(next);
    await run(() => updateProgram(programId, { start_date: next || null }));
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
      Start date
      <input
        type="date"
        className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
    </label>
  );
}

function DayNotesField({ dayId, initial }: { dayId: string; initial: string | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial ?? '');

  async function handleBlur() {
    if (value === (initial ?? '')) return;
    await run(() => updateProgramDay(dayId, { notes: value || null }));
  }

  return (
    <textarea
      placeholder="Workout notes (optional)"
      rows={2}
      className="mt-2 w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

function BatchApplyForm({ dayId }: { dayId: string }) {
  const { run, busy } = useAction();
  const [restSeconds, setRestSeconds] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');

  async function handleApply() {
    const fields: { rest_seconds?: number; rpe?: number } = {};
    if (restSeconds !== '') fields.rest_seconds = restSeconds;
    if (rpe !== '') fields.rpe = rpe;
    if (Object.keys(fields).length === 0) return;
    await run(() => applyFieldsToDay(dayId, fields), {
      success: 'Applied to all exercises in this day',
      onDone: () => {
        setRestSeconds('');
        setRpe('');
      },
    });
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-zinc-500">Apply to all exercises in this day:</span>
      <input type="number" placeholder="Rest (s)" className={`${inputCls} w-20`} value={restSeconds} onChange={(e) => setRestSeconds(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <button type="button" disabled={busy} onClick={handleApply} className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/10">
        Apply
      </button>
    </div>
  );
}

export function WorkoutTab({
  clientId,
  isCoachView,
  programs,
  workoutLogs,
  clientExerciseMaxes,
  workoutDayFeedback,
  exerciseLibrary,
  programTemplates,
  focusDay = null,
  profile,
}: {
  clientId: string;
  isCoachView: boolean;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  clientExerciseMaxes: ClientExerciseMaxRow[];
  workoutDayFeedback: WorkoutDayFeedbackRow[];
  exerciseLibrary: ExerciseLibraryRow[];
  programTemplates: ProgramTemplateRow[];
  // Set by DashboardShell when the client arrives here via a classes check-in -- expands and
  // scrolls to the specific day rather than requiring them to hunt for it manually. `nonce`
  // makes re-clicking check-in on the same day re-trigger the scroll even if nothing else
  // about the props changed.
  focusDay?: { dayId: string; nonce: number } | null;
  profile?: ClientProfileRow | null;
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  // A coach's program-setup forms (new program, start from a template, record a max) stay tucked
  // away once a program exists.
  const [showSetup, setShowSetup] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string; dayPosition: string }>>({});
  const [dupForms, setDupForms] = useState<Record<string, { sourceWeek: number; totalWeeks: number }>>({});
  const { run: runDuplicateWeek, busy: duplicatingWeek } = useAction();
  // One week shown at a time via a Wk 1/2/3... pill selector (see ProgramDayList), defaulted
  // per-program to its current week (by start_date) so the day list (icon chips, exercise
  // counts, phase badges) opens on the relevant week instead of always Week 1. Days are no
  // longer expand-in-place (see openDayId below) -- clicking one opens the fullscreen
  // FocusOverlay instead, which is what actually solved the "congested" feeling multiple
  // inline exercise editors caused, not the week-level grouping.
  const [activeWeeks, setActiveWeeks] = useState<Record<string, number>>(() => {
    const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
    const initial: Record<string, number> = {};
    for (const program of programs) {
      const active = resolveActiveProgram([program], todayIso);
      initial[program.id] = active?.weekNum ?? 1;
    }
    return initial;
  });
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [editingSet, setEditingSet] = useState<{ log: WorkoutLogRow; index: number } | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!focusDay) return;
    for (const program of programs) {
      const day = program.workout_program_days.find((d) => d.id === focusDay.dayId);
      if (!day) continue;
      // Reacting to an external signal (a classes check-in click) by switching the active week
      // locally, not synchronizing with any external system -- the standard justified exception.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveWeeks((s) => ({ ...s, [program.id]: day.week_num }));
      setOpenDayId(day.id);
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on a genuinely new focus request, not on every programs re-render
  }, [focusDay?.dayId, focusDay?.nonce]);

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createProgram(clientId, newProgramName), {
      success: 'Program created',
      onDone: () => setNewProgramName(''),
    });
  }

  async function handleAddDay(programId: string) {
    const form = dayForms[programId] ?? { weekNum: 1, dayLabel: 'Day 1', dayPosition: '' };
    const dayPosition = form.dayPosition === '' ? null : Number(form.dayPosition);
    await runMutate(() => addProgramDay(programId, form.weekNum, form.dayLabel, dayPosition), { success: 'Day added' });
  }

  // Builds a full block by copying an already-built week's days (with their exercises --
  // duplicateProgramDay copies both) into every remaining week, instead of generating blank
  // numbered day shells. day_position carries over unchanged from the source day, so check-in
  // resolution (lib/utils/checkin.ts) still works without retyping a day # per week.
  async function handleDuplicateWeek(program: WorkoutProgramRow) {
    const form = dupForms[program.id] ?? { sourceWeek: 1, totalWeeks: 4 };
    const sourceDays = program.workout_program_days.filter((d) => d.week_num === form.sourceWeek);
    if (sourceDays.length === 0) return;
    const inserts: Promise<void>[] = [];
    for (let week = form.sourceWeek + 1; week <= form.totalWeeks; week++) {
      for (const day of sourceDays) {
        inserts.push(duplicateProgramDay(day.id, week, day.day_label));
      }
    }
    await runDuplicateWeek(() => Promise.all(inserts), {
      success: `Week ${form.sourceWeek} copied through week ${form.totalWeeks}`,
    });
  }

  async function handleDeleteProgram(programId: string, name: string) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: 'This removes every week, day and exercise in the program. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteProgram(programId), { success: 'Program deleted' });
  }

  async function handleDeleteDay(dayId: string, label: string) {
    const ok = await confirm({
      title: `Delete “${label}”?`,
      body: 'This removes the day and all its exercises.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteProgramDay(dayId), { success: 'Day deleted' });
  }

  async function handleCopyDay(dayId: string, weekNum: number, dayLabel: string) {
    await runMutate(() => duplicateProgramDay(dayId, weekNum + 1, dayLabel), { success: 'Workout copied to next week' });
  }

  const logsByExercise = workoutLogs.reduce<Record<string, WorkoutLogRow[]>>((acc, log) => {
    if (!log.exercise_id) return acc;
    (acc[log.exercise_id] ??= []).push(log);
    return acc;
  }, {});

  const feedbackByDay = workoutDayFeedback.reduce<Record<string, WorkoutDayFeedbackRow>>((acc, f) => {
    acc[f.program_day_id] = f;
    return acc;
  }, {});

  // The member's previous session of the same library exercise (a different programme day/week
  // than the one open): its working sets in order, with a "Last week" / "Last time" label. Shown
  // next to each set and as a summary line, so they know what to beat.
  // Same exercise = same library entry when it has one, otherwise the same name (custom exercises).
  const exerciseById = new Map(programs.flatMap((p) => p.workout_program_days.flatMap((d) => d.workout_exercises)).map((e) => [e.id, e]));
  // Working sets from other sessions of the same exercise.
  function earlierLogs(libraryId: string | null, name: string, excludeExerciseId: string): WorkoutLogRow[] {
    const wantName = name.trim().toLowerCase();
    return workoutLogs.filter((l) => {
      if (!l.exercise_id || l.exercise_id === excludeExerciseId || l.set_type !== 'working') return false;
      const logged = exerciseById.get(l.exercise_id);
      const logLib = l.exercise_library_id ?? logged?.exercise_library_id ?? null;
      if (libraryId && logLib === libraryId) return true;
      return !!wantName && logged?.name.trim().toLowerCase() === wantName;
    });
  }
  function lastSessionFor(
    libraryId: string | null,
    name: string,
    excludeExerciseId: string
  ): { sets: WorkoutLogRow[]; label: string; date: string } | null {
    const candidates = earlierLogs(libraryId, name, excludeExerciseId);
    if (candidates.length === 0) return null;
    const latest = [...candidates].sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
    const sets = candidates
      .filter((l) => l.exercise_id === latest.exercise_id)
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0) || a.logged_at.localeCompare(b.logged_at));
    const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
    const daysAgo = daysBetween(isoDateInTz(new Date(latest.logged_at), tz), todayIsoInTz(tz));
    return {
      sets,
      label: daysAgo >= 4 && daysAgo <= 10 ? 'Last week' : 'Last time',
      date: new Date(latest.logged_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    };
  }

  // Today's weekday in the member's timezone, and which programme week is current -- used to flag
  // "Today" on the matching workout.
  const todayIsoLocal = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const todayDow = new Date(`${todayIsoLocal}T00:00:00Z`).getUTCDay();
  const currentWeek = (program: WorkoutProgramRow) => resolveActiveProgram([program], todayIsoLocal)?.weekNum ?? -1;

  const libraryVideo = (libraryId: string | null) =>
    (libraryId ? exerciseLibrary.find((l) => l.id === libraryId)?.video_url : null) ?? null;

  const openDay = openDayId
    ? programs.flatMap((p) => p.workout_program_days).find((d) => d.id === openDayId)
    : undefined;

  return (
    <div className="space-y-6">
      {isCoachView ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-black dark:text-zinc-50">
              {programs.length === 0 ? 'Set up a program' : 'Programs'}
            </p>
            {programs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSetup((v) => !v)}
                aria-expanded={showSetup}
                className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-bold text-zinc-700 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                {showSetup ? 'Hide tools' : '+ New program & tools'}
              </button>
            )}
          </div>
          {(showSetup || programs.length === 0) && (
            <div className="space-y-3">
        <form onSubmit={handleCreateProgram} className="flex items-end gap-2 rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-zinc-500">New program name</label>
                <input
                  required
                  className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
                  value={newProgramName}
                  onChange={(e) => setNewProgramName(e.target.value)}
                />
              </div>
              <button type="submit" disabled={creating} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50">
                {creating ? 'Creating…' : 'Create program'}
              </button>
            </form>
              <StartFromTemplateForm clientId={clientId} templates={programTemplates} />
              <RecordMaxForm clientId={clientId} library={exerciseLibrary} />
            </div>
          )}
        </div>
) : null}

      {programs.length === 0 && (
        <EmptyState
          icon={Dumbbell}
          title="No workout program yet"
          hint={
            isCoachView
              ? 'Create a program above, then add weeks, days and exercises to it.'
              : "Your coach hasn't built your program yet — it'll show up here once they do."
          }
        />
      )}

      {programs.map((program) => (
        <div
          key={program.id}
          className={isCoachView ? 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10' : ''}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={isCoachView ? 'font-medium text-black dark:text-zinc-50' : 'px-1 text-xl font-black text-black dark:text-zinc-50'}>
              {program.name}
            </h3>
            <div className="flex items-center gap-2">
              {isCoachView && <ProgramStartDateInput programId={program.id} initial={program.start_date} />}
              {isCoachView && (
                <button
                  onClick={() => handleDeleteProgram(program.id, program.name)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete program
                </button>
              )}
            </div>
          </div>

          <ProgramDayList
            ownerId={program.id}
            library={exerciseLibrary}
            showPhaseLabel={!isCoachView}
            onOpenDay={setOpenDayId}
            activeWeek={activeWeeks[program.id]}
            currentWeek={currentWeek(program) > 0 ? currentWeek(program) : undefined}
            onChangeWeek={(week) => setActiveWeeks((s) => ({ ...s, [program.id]: week }))}
            days={program.workout_program_days.map((day) => ({
              id: day.id,
              weekNum: day.week_num,
              dayLabel: day.day_label,
              phaseLabel: day.phase_label,
              exerciseCount: day.workout_exercises.length,
              exerciseLibraryIds: day.workout_exercises.map((ex) => ex.exercise_library_id),
              done: day.workout_exercises.some((ex) => (logsByExercise[ex.id]?.length ?? 0) > 0),
              liftCount: day.workout_exercises.filter((ex) => ex.block_type === 'exercise').length,
              highlights: [...day.workout_exercises]
                .filter((ex) => ex.block_type === 'exercise')
                .sort((a, b) => a.sort_order - b.sort_order)
                .slice(0, 2)
                .map((ex) => ex.name),
              loggedCount: day.workout_exercises.filter((ex) => ex.block_type === 'exercise' && (logsByExercise[ex.id]?.length ?? 0) > 0).length,
              dayPosition: day.day_position,
              isToday: day.day_position != null && day.day_position === todayDow && day.week_num === currentWeek(program),
            }))}
            renderDayControls={
              isCoachView
                ? (summary: ProgramDaySummary) => {
                    const day = program.workout_program_days.find((d) => d.id === summary.id)!;
                    return (
                      <>
                        <PhaseLabelInput dayId={day.id} initial={day.phase_label} />
                        <DayOfWeekSelect dayId={day.id} initial={day.day_position} />
                        <DropdownMenu
                          triggerLabel="Day actions"
                          items={[
                            { label: 'Copy Workout', onSelect: () => handleCopyDay(day.id, day.week_num, day.day_label) },
                            {
                              label: 'Delete day',
                              onSelect: () => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`),
                              destructive: true,
                            },
                          ]}
                        />
                      </>
                    );
                  }
                : undefined
            }
          />

          {isCoachView && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-black/10 p-2.5 dark:border-white/10">
              <span className="text-xs text-zinc-500">Duplicate week</span>
              <input
                type="number"
                min={1}
                title="Which week to copy from"
                className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dupForms[program.id]?.sourceWeek ?? 1}
                onChange={(e) =>
                  setDupForms({
                    ...dupForms,
                    [program.id]: {
                      sourceWeek: Math.max(1, Number(e.target.value) || 1),
                      totalWeeks: dupForms[program.id]?.totalWeeks ?? 4,
                    },
                  })
                }
              />
              <span className="text-xs text-zinc-500">through week</span>
              <input
                type="number"
                min={1}
                title="Total weeks in the block"
                className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dupForms[program.id]?.totalWeeks ?? 4}
                onChange={(e) =>
                  setDupForms({
                    ...dupForms,
                    [program.id]: {
                      sourceWeek: dupForms[program.id]?.sourceWeek ?? 1,
                      totalWeeks: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
              />
              <button
                onClick={() => handleDuplicateWeek(program)}
                disabled={duplicatingWeek}
                className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/10"
              >
                {duplicatingWeek ? 'Duplicating…' : 'Duplicate'}
              </button>
              <p className="w-full text-xs text-zinc-500">
                Build one week fully, then copy it (with all its exercises) into every remaining
                week of the block.
              </p>
            </div>
          )}

          {isCoachView && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <input
                type="number"
                placeholder="Week"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[program.id]?.weekNum ?? 1}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [program.id]: {
                      weekNum: Number(e.target.value),
                      dayLabel: dayForms[program.id]?.dayLabel ?? 'Day 1',
                      dayPosition: dayForms[program.id]?.dayPosition ?? '',
                    },
                  })
                }
              />
              <input
                placeholder="Day label"
                className="w-32 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[program.id]?.dayLabel ?? 'Day 1'}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [program.id]: {
                      weekNum: dayForms[program.id]?.weekNum ?? 1,
                      dayLabel: e.target.value,
                      dayPosition: dayForms[program.id]?.dayPosition ?? '',
                    },
                  })
                }
              />
              <select
                title="Day of the week -- a class scheduled the same day auto-links here for client check-in"
                className="w-20 shrink-0 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[program.id]?.dayPosition ?? ''}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [program.id]: {
                      weekNum: dayForms[program.id]?.weekNum ?? 1,
                      dayLabel: dayForms[program.id]?.dayLabel ?? 'Day 1',
                      dayPosition: e.target.value,
                    },
                  })
                }
              >
                <option value="">Day…</option>
                {PROGRAM_WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_SHORT[d]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleAddDay(program.id)}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground"
              >
                + Day
              </button>
            </div>
          )}
        </div>
      ))}

      {!isCoachView && (
        <details className="group rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-black dark:text-zinc-50">
            Record a tested max
            <span className="text-xs font-semibold text-accent group-open:hidden">Add</span>
          </summary>
          <div className="px-4 pb-4">
            <RecordMaxForm clientId={clientId} library={exerciseLibrary} bare />
          </div>
        </details>
      )}

      {editingSet && <SetEditSheet log={editingSet.log} index={editingSet.index} onClose={() => setEditingSet(null)} />}

      {openDay && (
        <FocusOverlay
          title={openDay.day_label}
          subtitle={`Week ${openDay.week_num}`}
          onClose={() => setOpenDayId(null)}
        >
          {isCoachView && <DayNotesField dayId={openDay.id} initial={openDay.notes} />}
          {!isCoachView && openDay.notes && (
            <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-500">{openDay.notes}</p>
          )}

          {!isCoachView && (() => {
            const lifts = openDay.workout_exercises.filter((e) => e.block_type === 'exercise');
            if (lifts.length === 0) return null;
            const done = lifts.filter((e) => (logsByExercise[e.id]?.length ?? 0) > 0).length;
            return (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-black dark:text-zinc-50">
                    {done} of {lifts.length} exercises logged
                  </span>
                  {done === lifts.length && <span className="font-bold text-success">All done ✓</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((done / lifts.length) * 100)}%` }} />
                </div>
              </div>
            );
          })()}

          <ExerciseEditor
            exercises={openDay.workout_exercises}
            library={exerciseLibrary}
            canEdit={isCoachView}
            clientExerciseMaxes={clientExerciseMaxes}
            onAdd={(fields) =>
              addExercise(openDay.id, {
                exercise_library_id: fields.exercise_library_id,
                name: fields.name,
                sets: fields.sets,
                reps: fields.reps,
                load: fields.load,
                rpe: fields.rpe,
                notes: fields.notes,
                video_url: fields.video_url,
                superset_group: fields.superset_group,
                rest_seconds: fields.rest_seconds,
                sort_order: fields.sort_order,
                block_type: fields.block_type,
                prescription_type: fields.prescription_type,
                percent_1rm: fields.percent_1rm,
              })
            }
            onUpdate={(id, fields) => updateExercise(id, fields)}
            onDelete={(id) => deleteExercise(id)}
            onReorder={reorderExercises}
            renderExtra={(ex) => {
              const logs = logsByExercise[ex.id] ?? [];
              const last = lastSessionFor(ex.exercise_library_id, ex.name, ex.id);
              const loads = earlierLogs(ex.exercise_library_id, ex.name, ex.id).map((l) => l.actual_load ?? 0);
              const priorBest = loads.length > 0 && Math.max(...loads) > 0 ? Math.max(...loads) : null;
              // Use the exercise's own video link, else the one on its library entry.
              const videoUrl = ex.video_url || libraryVideo(ex.exercise_library_id);
              const lastFor = (setNumber: number) => {
                const l = last?.sets[setNumber - 1] ?? last?.sets[last.sets.length - 1];
                return l ? { reps: l.actual_reps, load: l.actual_load } : null;
              };
              const seed = logs.length > 0 ? logs[logs.length - 1] : (last?.sets[0] ?? null);
              return (
                <>
                  {(videoUrl?.startsWith('http://') || videoUrl?.startsWith('https://')) && (
                    <VideoDemo videoUrl={videoUrl} title={ex.name} alwaysOpen />
                  )}
                  {last && (
                    <div className="mt-2">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                        {last.label} · {last.date}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {last.sets.map((l, i) => (
                          <span
                            key={l.id}
                            className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-xs ${
                              i === logs.length ? 'border-accent/50 bg-accent-soft' : 'border-black/[.08] dark:border-white/10'
                            }`}
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                              {i + 1}
                            </span>
                            <span className="whitespace-nowrap font-semibold text-black dark:text-zinc-100">
                              {l.actual_reps ?? '—'} × {l.actual_load ?? '—'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isCoachView && ex.block_type === 'exercise' && (
                    <>
                      {logs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {logs.map((l, i) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setEditingSet({ log: l, index: i + 1 })}
                              aria-label={`Edit set ${i + 1}`}
                              className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"
                            >
                              ✓ {i + 1} · {l.actual_reps ?? '—'}×{l.actual_load ?? '—'}
                              {priorBest != null && l.actual_load != null && l.actual_load > priorBest ? ' 🏆' : ''}
                            </button>
                          ))}
                        </div>
                      )}
                      <LogSetForm
                        clientId={clientId}
                        exerciseId={ex.id}
                        nextSetNumber={logs.length + 1}
                        totalSets={Number(ex.sets) > 0 ? Number(ex.sets) : null}
                        restSeconds={ex.rest_seconds}
                        initialReps={seed?.actual_reps ?? null}
                        initialLoad={seed?.actual_load ?? null}
                        lastSet={last ? lastFor(logs.length + 1) : null}
                        priorBest={priorBest}
                      />
                    </>
                  )}
                </>
              );
            }}
          />

          {isCoachView && <BatchApplyForm dayId={openDay.id} />}

          <DayFeedbackForm clientId={clientId} programDayId={openDay.id} isCoachView={isCoachView} feedback={feedbackByDay[openDay.id]} />

          {!isCoachView && (
            <button
              type="button"
              onClick={() => {
                toast.success('Workout complete — nice work 💪');
                setOpenDayId(null);
              }}
              className="mt-4 h-12 w-full rounded-full bg-accent text-base font-extrabold text-accent-foreground"
            >
              Finish workout
            </button>
          )}
        </FocusOverlay>
      )}
    </div>
  );
}

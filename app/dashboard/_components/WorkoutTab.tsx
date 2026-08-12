'use client';

import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { ProgramDayList, type ProgramDaySummary } from '@/app/_components/workouts/ProgramDayList';
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
  updateProgramDay,
} from '@/lib/data/workouts';
import { instantiateProgramTemplate } from '@/lib/data/programTemplates';
import { recordExerciseMax } from '@/lib/data/clientExerciseMaxes';
import { submitDayFeedback } from '@/lib/data/workoutDayFeedback';
import type {
  ClientExerciseMaxRow,
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
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex-1 space-y-1">
        <label className="text-xs font-medium text-zinc-500">Start from a programme template</label>
        <select
          required
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
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
      <button type="submit" disabled={busy} className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/10">
        {busy ? 'Starting…' : 'Start programme'}
      </button>
    </form>
  );
}

// Either party can record a tested/estimated max (RLS: owns_client) -- this is what makes
// %1RM prescriptions resolve to an actual target load for a given client.
function RecordMaxForm({ clientId, library }: { clientId: string; library: ExerciseLibraryRow[] }) {
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Record a tested max</label>
        <select
          required
          className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          value={libraryId}
          onChange={(e) => setLibraryId(e.target.value)}
        >
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
      <input
        type="number"
        required
        placeholder="Weight"
        className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        value={max}
        onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))}
      />
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Reps</label>
        <input
          type="number"
          min={1}
          required
          title="1 = a true 1RM. More than 1 (e.g. a 3-rep or 5-rep max) gets converted to an estimated 1RM automatically."
          className="w-16 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          value={reps}
          onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-zinc-500">
        <input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />
        Estimated
      </label>
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
        Save
      </button>
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

const SET_TYPES: SetType[] = ['working', 'warmup', 'failure', 'drop'];

function LogSetForm({
  clientId,
  exerciseId,
  nextSetNumber,
  restSeconds,
}: {
  clientId: string;
  exerciseId: string;
  nextSetNumber: number;
  restSeconds: number | null;
}) {
  const { run, busy } = useAction();
  const [reps, setReps] = useState<number | ''>('');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [setType, setSetType] = useState<SetType>('working');
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
          set_type: setType,
        }),
      {
        success: `Set ${nextSetNumber} logged`,
        onDone: () => {
          setReps('');
          setLoad('');
          setRpe('');
          if (restSeconds != null) setTimerKey((k) => k + 1);
        },
      }
    );
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <div className="mt-2 rounded-md border border-black/5 p-2 dark:border-white/5">
      <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Set {nextSetNumber}
      </p>
      <form onSubmit={handleSubmit} className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <select className={inputCls} value={setType} onChange={(e) => setSetType(e.target.value as SetType)}>
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input type="number" placeholder="Reps" className={inputCls} value={reps} onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="Load" className={inputCls} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="RPE" className={inputCls} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
        <button type="submit" disabled={busy} className="col-span-2 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50 sm:col-span-4">
          Log
        </button>
      </form>
      {restSeconds != null && timerKey > 0 && <RestTimer key={timerKey} seconds={restSeconds} />}
    </div>
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
      <p className="text-xs text-zinc-500">{feedback ? 'Update rating:' : 'Rate this session:'}</p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRpe(n)}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
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
      className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

// Stable "slot" across every week of the block (Week 1's Monday and Week 2's Monday share
// the same day_position) -- what a class's linked_day_position resolves against, see
// lib/utils/checkin.ts. Editable after the fact, not just at Add-day time.
function DayPositionInput({ dayId, initial }: { dayId: string; initial: number | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial != null ? String(initial) : '');

  async function handleBlur() {
    const parsed = value === '' ? null : Number(value);
    if (parsed === initial) return;
    await run(() => updateProgramDay(dayId, { day_position: parsed }));
  }

  return (
    <input
      type="number"
      placeholder="Day #"
      title="Day position -- links a recurring class to this slot across every week"
      className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
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
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const [newProgramName, setNewProgramName] = useState('');
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string; dayPosition: string }>>({});
  const [dupForms, setDupForms] = useState<Record<string, { sourceWeek: number; totalWeeks: number }>>({});
  const { run: runDuplicateWeek, busy: duplicatingWeek } = useAction();
  // Weeks collapsed by default -- with multiple weeks per program this was a lot of scroll.
  // Days are no longer expand-in-place (see openDayId below) -- clicking one opens the
  // fullscreen FocusOverlay instead, which is what actually solved the "congested" feeling
  // multiple inline exercise editors caused, not the week-level grouping.
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusDay) return;
    for (const program of programs) {
      const day = program.workout_program_days.find((d) => d.id === focusDay.dayId);
      if (!day) continue;
      // Reacting to an external signal (a classes check-in click) by expanding local collapse
      // state, not synchronizing with any external system -- the standard justified exception.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedWeeks((s) => ({ ...s, [`${program.id}:${day.week_num}`]: true }));
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

  // Most recent WORKING-set log for a library exercise, from any instance other than the
  // current one -- surfaced to the client as "Last time: ...". Excludes warmup/failure/drop
  // sets so they don't pollute the headline number, and excludes the current exercise's own
  // logs since those already show in its "Logged: ..." summary line.
  function lastTimeFor(libraryId: string | null, excludeExerciseId: string): WorkoutLogRow | null {
    if (!libraryId) return null;
    const candidates = workoutLogs.filter(
      (l) => l.exercise_library_id === libraryId && l.exercise_id !== excludeExerciseId && l.set_type === 'working'
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  }

  const openDay = openDayId
    ? programs.flatMap((p) => p.workout_program_days).find((d) => d.id === openDayId)
    : undefined;

  return (
    <div className="space-y-6">
      {isCoachView && (
        <form onSubmit={handleCreateProgram} className="flex items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-zinc-500">New program name</label>
            <input
              required
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
              value={newProgramName}
              onChange={(e) => setNewProgramName(e.target.value)}
            />
          </div>
          <button type="submit" disabled={creating} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
            {creating ? 'Creating…' : 'Create program'}
          </button>
        </form>
      )}

      {isCoachView && <StartFromTemplateForm clientId={clientId} templates={programTemplates} />}

      <RecordMaxForm clientId={clientId} library={exerciseLibrary} />

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
        <div key={program.id} className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-black dark:text-zinc-50">{program.name}</h3>
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
            expandedWeeks={expandedWeeks}
            onToggleWeek={(weekKey) => setExpandedWeeks((s) => ({ ...s, [weekKey]: !s[weekKey] }))}
            days={program.workout_program_days.map((day) => ({
              id: day.id,
              weekNum: day.week_num,
              dayLabel: day.day_label,
              phaseLabel: day.phase_label,
              exerciseCount: day.workout_exercises.length,
              exerciseLibraryIds: day.workout_exercises.map((ex) => ex.exercise_library_id),
              done: day.workout_exercises.some((ex) => (logsByExercise[ex.id]?.length ?? 0) > 0),
            }))}
            renderDayControls={
              isCoachView
                ? (summary: ProgramDaySummary) => {
                    const day = program.workout_program_days.find((d) => d.id === summary.id)!;
                    return (
                      <>
                        <PhaseLabelInput dayId={day.id} initial={day.phase_label} />
                        <DayPositionInput dayId={day.id} initial={day.day_position} />
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
              <input
                type="number"
                placeholder="Day #"
                title="Day position -- links a recurring class to this slot across every week"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
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
              />
              <button
                onClick={() => handleAddDay(program.id)}
                className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium dark:border-white/10"
              >
                Add day
              </button>
            </div>
          )}
        </div>
      ))}

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
              const lastTime = lastTimeFor(ex.exercise_library_id, ex.id);
              return (
                <>
                  {(ex.video_url?.startsWith('http://') || ex.video_url?.startsWith('https://')) && (
                    <a
                      href={ex.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-accent hover:underline"
                    >
                      ▶ Watch demo
                    </a>
                  )}
                  {lastTime && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      Last time: {lastTime.actual_reps ?? '—'}×{lastTime.actual_load ?? '—'} · {new Date(lastTime.logged_at).toLocaleDateString()}
                    </p>
                  )}
                  {!isCoachView && ex.block_type === 'exercise' && (
                    <>
                      <LogSetForm clientId={clientId} exerciseId={ex.id} nextSetNumber={logs.length + 1} restSeconds={ex.rest_seconds} />
                      {logs.length > 0 && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Logged: {logs.map((l) => `${l.actual_reps ?? '—'}×${l.actual_load ?? '—'}`).join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </>
              );
            }}
          />

          {isCoachView && <BatchApplyForm dayId={openDay.id} />}

          <DayFeedbackForm clientId={clientId} programDayId={openDay.id} isCoachView={isCoachView} feedback={feedbackByDay[openDay.id]} />
        </FocusOverlay>
      )}
    </div>
  );
}

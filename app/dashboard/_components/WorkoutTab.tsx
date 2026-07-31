'use client';

import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import {
  addExercise,
  addProgramDay,
  applyFieldsToDay,
  createProgram,
  deleteExercise,
  deleteProgram,
  deleteProgramDay,
  logSet,
  reorderExercises,
  updateExercise,
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
  const [estimated, setEstimated] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!libraryId || max === '') return;
    await run(() => recordExerciseMax(clientId, libraryId, max, estimated), {
      success: 'Tested max recorded',
      onDone: () => {
        setLibraryId('');
        setMax('');
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

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <div>
      <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-1.5">
        <span className="text-xs text-zinc-500">Set {nextSetNumber}:</span>
        <select className={inputCls} value={setType} onChange={(e) => setSetType(e.target.value as SetType)}>
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input type="number" placeholder="Reps" className={`${inputCls} w-16`} value={reps} onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
        <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
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
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-2 dark:border-white/5">
      <span className="text-xs text-zinc-500">{feedback ? 'Update rating:' : 'Rate this session:'}</span>
      <input type="number" min={1} max={10} placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <input placeholder="Notes (optional)" className={`${inputCls} w-48`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        Save
      </button>
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
}: {
  clientId: string;
  isCoachView: boolean;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  clientExerciseMaxes: ClientExerciseMaxRow[];
  workoutDayFeedback: WorkoutDayFeedbackRow[];
  exerciseLibrary: ExerciseLibraryRow[];
  programTemplates: ProgramTemplateRow[];
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const [newProgramName, setNewProgramName] = useState('');
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string }>>({});

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createProgram(clientId, newProgramName), {
      success: 'Program created',
      onDone: () => setNewProgramName(''),
    });
  }

  async function handleAddDay(programId: string) {
    const form = dayForms[programId] ?? { weekNum: 1, dayLabel: 'Day 1' };
    await runMutate(() => addProgramDay(programId, form.weekNum, form.dayLabel), { success: 'Day added' });
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
        <div key={program.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-black dark:text-zinc-50">{program.name}</h3>
            {isCoachView && (
              <button
                onClick={() => handleDeleteProgram(program.id, program.name)}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Delete program
              </button>
            )}
          </div>

          {[...program.workout_program_days]
            .sort((a, b) => a.week_num - b.week_num)
            .map((day) => (
              <div key={day.id} className="mt-3 rounded-md border border-black/5 p-3 dark:border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      Week {day.week_num} — {day.day_label}
                    </p>
                    {day.phase_label && !isCoachView && (
                      <span className="mt-0.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                        {day.phase_label}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isCoachView && <PhaseLabelInput dayId={day.id} initial={day.phase_label} />}
                    {isCoachView && (
                      <button
                        onClick={() => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`)}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete day
                      </button>
                    )}
                  </div>
                </div>

                <ExerciseEditor
                  exercises={day.workout_exercises}
                  library={exerciseLibrary}
                  canEdit={isCoachView}
                  clientExerciseMaxes={clientExerciseMaxes}
                  onAdd={(fields) =>
                    addExercise(day.id, {
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
                    const lastTime = !isCoachView ? lastTimeFor(ex.exercise_library_id, ex.id) : null;
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
                          <p className="mt-1 text-xs text-zinc-500">
                            Last time: {lastTime.actual_reps ?? '—'}×{lastTime.actual_load ?? '—'} ({new Date(lastTime.logged_at).toLocaleDateString()})
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

                {isCoachView && <BatchApplyForm dayId={day.id} />}

                <DayFeedbackForm clientId={clientId} programDayId={day.id} isCoachView={isCoachView} feedback={feedbackByDay[day.id]} />
              </div>
            ))}

          {isCoachView && (
            <div className="mt-3 flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Week"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[program.id]?.weekNum ?? 1}
                onChange={(e) =>
                  setDayForms({ ...dayForms, [program.id]: { weekNum: Number(e.target.value), dayLabel: dayForms[program.id]?.dayLabel ?? 'Day 1' } })
                }
              />
              <input
                placeholder="Day label"
                className="w-32 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[program.id]?.dayLabel ?? 'Day 1'}
                onChange={(e) =>
                  setDayForms({ ...dayForms, [program.id]: { weekNum: dayForms[program.id]?.weekNum ?? 1, dayLabel: e.target.value } })
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
    </div>
  );
}

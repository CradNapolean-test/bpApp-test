'use client';

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addExercise,
  addProgramDay,
  createProgram,
  deleteExercise,
  deleteProgram,
  deleteProgramDay,
  logSet,
} from '@/lib/data/workouts';
import { instantiateProgramTemplate } from '@/lib/data/programTemplates';
import type { ExerciseLibraryRow, ProgramTemplateRow, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

function AddExerciseForm({ programDayId, library }: { programDayId: string; library: ExerciseLibraryRow[] }) {
  const { run, busy } = useAction();
  const [libraryId, setLibraryId] = useState('');
  const [name, setName] = useState('');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState('8-10');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [videoUrl, setVideoUrl] = useState('');

  function handlePickLibrary(id: string) {
    setLibraryId(id);
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    setName(entry.name);
    if (entry.default_sets != null) setSets(entry.default_sets);
    if (entry.default_reps != null) setReps(entry.default_reps);
    if (entry.default_rpe != null) setRpe(entry.default_rpe);
    if (entry.video_url != null) setVideoUrl(entry.video_url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        addExercise(programDayId, {
          name,
          sets,
          reps,
          load: load === '' ? null : load,
          rpe: rpe === '' ? null : rpe,
          notes: null,
          video_url: videoUrl || null,
        }),
      {
        success: 'Exercise added',
        onDone: () => {
          setLibraryId('');
          setName('');
          setVideoUrl('');
        },
      }
    );
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-1.5">
      {library.length > 0 && (
        <select className={`${inputCls} w-32`} value={libraryId} onChange={(e) => handlePickLibrary(e.target.value)}>
          <option value="">From library…</option>
          {library.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      )}
      <input required placeholder="Exercise" className={`${inputCls} w-32`} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" placeholder="Sets" className={`${inputCls} w-16`} value={sets} onChange={(e) => setSets(Number(e.target.value))} />
      <input placeholder="Reps" className={`${inputCls} w-20`} value={reps} onChange={(e) => setReps(e.target.value)} />
      <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <input placeholder="Video URL (optional)" className={`${inputCls} w-40`} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

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

function LogSetForm({ clientId, exerciseId, nextSetNumber }: { clientId: string; exerciseId: string; nextSetNumber: number }) {
  const { run, busy } = useAction();
  const [reps, setReps] = useState<number | ''>('');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        logSet(clientId, exerciseId, {
          set_number: nextSetNumber,
          actual_reps: reps === '' ? null : reps,
          actual_load: load === '' ? null : load,
          actual_rpe: rpe === '' ? null : rpe,
        }),
      {
        success: `Set ${nextSetNumber} logged`,
        onDone: () => {
          setReps('');
          setLoad('');
          setRpe('');
        },
      }
    );
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-1.5">
      <span className="text-xs text-zinc-500">Set {nextSetNumber}:</span>
      <input type="number" placeholder="Reps" className={`${inputCls} w-16`} value={reps} onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        Log
      </button>
    </form>
  );
}

export function WorkoutTab({
  clientId,
  isCoachView,
  programs,
  workoutLogs,
  exerciseLibrary,
  programTemplates,
}: {
  clientId: string;
  isCoachView: boolean;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
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

  async function handleDeleteExercise(exerciseId: string, name: string) {
    const ok = await confirm({ title: `Delete “${name}”?`, destructive: true });
    if (!ok) return;
    await runMutate(() => deleteExercise(exerciseId), { success: 'Exercise deleted' });
  }

  const logsByExercise = workoutLogs.reduce<Record<string, WorkoutLogRow[]>>((acc, log) => {
    if (!log.exercise_id) return acc;
    (acc[log.exercise_id] ??= []).push(log);
    return acc;
  }, {});

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
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Week {day.week_num} — {day.day_label}
                  </p>
                  {isCoachView && (
                    <button
                      onClick={() => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete day
                    </button>
                  )}
                </div>

                <ul className="mt-2 space-y-2">
                  {day.workout_exercises.map((ex) => {
                    const logs = logsByExercise[ex.id] ?? [];
                    return (
                      <li key={ex.id} className="rounded-md bg-black/[.02] p-2 text-sm dark:bg-white/[.03]">
                        <div className="flex items-center justify-between">
                          <span>
                            {ex.name} — {ex.sets}×{ex.reps}
                            {ex.load != null ? ` @ ${ex.load}` : ''}
                            {ex.rpe != null ? ` RPE ${ex.rpe}` : ''}
                          </span>
                          {isCoachView && (
                            <button
                              onClick={() => handleDeleteExercise(ex.id, ex.name)}
                              className="text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              Delete
                            </button>
                          )}
                        </div>
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
                        {!isCoachView && (
                          <>
                            <LogSetForm clientId={clientId} exerciseId={ex.id} nextSetNumber={logs.length + 1} />
                            {logs.length > 0 && (
                              <p className="mt-1 text-xs text-zinc-500">
                                Logged: {logs.map((l) => `${l.actual_reps ?? '—'}×${l.actual_load ?? '—'}`).join(', ')}
                              </p>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {isCoachView && <AddExerciseForm programDayId={day.id} library={exerciseLibrary} />}
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

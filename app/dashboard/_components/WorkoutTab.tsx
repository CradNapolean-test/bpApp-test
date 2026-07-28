'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addExercise,
  addProgramDay,
  createProgram,
  deleteExercise,
  deleteProgram,
  deleteProgramDay,
  logSet,
} from '@/lib/data/workouts';
import type { WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

function AddExerciseForm({ programDayId }: { programDayId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState('8-10');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await addExercise(programDayId, {
        name,
        sets,
        reps,
        load: load === '' ? null : load,
        rpe: rpe === '' ? null : rpe,
        notes: null,
      });
      setName('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-1.5">
      <input required placeholder="Exercise" className={`${inputCls} w-32`} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" placeholder="Sets" className={`${inputCls} w-16`} value={sets} onChange={(e) => setSets(Number(e.target.value))} />
      <input placeholder="Reps" className={`${inputCls} w-20`} value={reps} onChange={(e) => setReps(e.target.value)} />
      <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <button type="submit" disabled={saving} className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

function LogSetForm({ clientId, exerciseId, nextSetNumber }: { clientId: string; exerciseId: string; nextSetNumber: number }) {
  const router = useRouter();
  const [reps, setReps] = useState<number | ''>('');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await logSet(clientId, exerciseId, {
        set_number: nextSetNumber,
        actual_reps: reps === '' ? null : reps,
        actual_load: load === '' ? null : load,
        actual_rpe: rpe === '' ? null : rpe,
      });
      setReps('');
      setLoad('');
      setRpe('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-1.5">
      <span className="text-xs text-zinc-500">Set {nextSetNumber}:</span>
      <input type="number" placeholder="Reps" className={`${inputCls} w-16`} value={reps} onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <button type="submit" disabled={saving} className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-50">
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
}: {
  clientId: string;
  isCoachView: boolean;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
}) {
  const router = useRouter();
  const [newProgramName, setNewProgramName] = useState('');
  const [creating, setCreating] = useState(false);
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string }>>({});

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createProgram(clientId, newProgramName);
      setNewProgramName('');
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleAddDay(programId: string) {
    const form = dayForms[programId] ?? { weekNum: 1, dayLabel: 'Day 1' };
    await addProgramDay(programId, form.weekNum, form.dayLabel);
    router.refresh();
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
          <button type="submit" disabled={creating} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
            {creating ? 'Creating…' : 'Create program'}
          </button>
        </form>
      )}

      {programs.length === 0 && <p className="text-sm text-zinc-500">No workout program yet.</p>}

      {programs.map((program) => (
        <div key={program.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-black dark:text-zinc-50">{program.name}</h3>
            {isCoachView && (
              <button
                onClick={async () => {
                  await deleteProgram(program.id);
                  router.refresh();
                }}
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
                      onClick={async () => {
                        await deleteProgramDay(day.id);
                        router.refresh();
                      }}
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
                              onClick={async () => {
                                await deleteExercise(ex.id);
                                router.refresh();
                              }}
                              className="text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              Delete
                            </button>
                          )}
                        </div>
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

                {isCoachView && <AddExerciseForm programDayId={day.id} />}
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

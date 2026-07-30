'use client';

import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { dayCalories, cycleDayFor, CALORIE_FLOOR } from '@/lib/calculations';
import { upsertDailyLog } from '@/lib/data/dailyLogs';
import { createHabit, deleteHabit, toggleHabitLog } from '@/lib/data/habits';
import { adherencePercent } from '@/lib/utils/habitStats';
import type { DailyLogRow, HabitWithLogs } from '@/lib/data/types';

type DayForm = Omit<DailyLogRow, 'id' | 'client_id' | 'log_date'>;

const BLANK_DAY: DayForm = {
  protein: null, carbs: null, fat: null, fibre: null, water: null,
  bodyweight: null, steps: null, sleep: null,
  gym_session: false, day_type: 'flat',
  hunger: null, energy: null, motivation: null, stress: null,
  period_started: false, notes: null,
};

function numOrNull(v: string): number | null {
  return v === '' ? null : Number(v);
}

const SCALE_FIELDS: { key: 'hunger' | 'energy' | 'motivation' | 'stress'; label: string }[] = [
  { key: 'hunger', label: 'Hunger' },
  { key: 'energy', label: 'Energy' },
  { key: 'motivation', label: 'Motivation' },
  { key: 'stress', label: 'Stress' },
];

function HabitManager({ clientId, habits }: { clientId: string; habits: HabitWithLogs[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runDelete } = useAction();
  const [newHabitName, setNewHabitName] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createHabit(clientId, newHabitName), {
      success: 'Habit added',
      onDone: () => setNewHabitName(''),
    });
  }

  async function handleDelete(habitId: string, name: string) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: 'The habit and its whole completion history are removed.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteHabit(habitId), { success: 'Habit deleted' });
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Manage habits</h3>
      <form onSubmit={handleCreate} className="mt-2 flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-zinc-500">New habit</label>
          <input
            required
            value={newHabitName}
            onChange={(e) => setNewHabitName(e.target.value)}
            placeholder="e.g. 10,000 steps"
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {creating ? 'Adding…' : 'Add habit'}
        </button>
      </form>

      {habits.length === 0 ? (
        <div className="mt-3">
          <EmptyState compact title="No habits yet — add one above, it'll show up as a checkbox on each day below." />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10">
          {habits.map((habit) => (
            <li key={habit.id} className="flex items-center justify-between py-2 text-sm">
              <span>{habit.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">{adherencePercent(habit.logs)}% (30d)</span>
                <button
                  onClick={() => handleDelete(habit.id, habit.name)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WeeklyLogTab({
  clientId,
  weekDates,
  initialLogs,
  gender,
  periodStartDates,
  readOnly,
  isCoachView,
  habits,
}: {
  clientId: string;
  weekDates: string[];
  initialLogs: DailyLogRow[];
  gender: string | null;
  periodStartDates: string[];
  readOnly: boolean;
  isCoachView: boolean;
  habits: HabitWithLogs[];
}) {
  const { run } = useAction();
  const { run: runHabitToggle } = useAction();
  const [busyHabitKey, setBusyHabitKey] = useState<string | null>(null);

  async function toggleHabit(habitId: string, date: string, completed: boolean) {
    setBusyHabitKey(`${habitId}|${date}`);
    try {
      await runHabitToggle(() => toggleHabitLog(habitId, date, completed));
    } finally {
      setBusyHabitKey(null);
    }
  }
  const [days, setDays] = useState<Record<string, DayForm>>(() => {
    const map: Record<string, DayForm> = {};
    for (const date of weekDates) {
      const existing = initialLogs.find((l) => l.log_date === date);
      map[date] = existing
        ? {
            protein: existing.protein, carbs: existing.carbs, fat: existing.fat, fibre: existing.fibre,
            water: existing.water, bodyweight: existing.bodyweight, steps: existing.steps, sleep: existing.sleep,
            gym_session: existing.gym_session, day_type: existing.day_type,
            hunger: existing.hunger, energy: existing.energy, motivation: existing.motivation, stress: existing.stress,
            period_started: existing.period_started, notes: existing.notes,
          }
        : { ...BLANK_DAY };
    }
    return map;
  });
  const [savingDate, setSavingDate] = useState<string | null>(null);

  async function saveDay(date: string) {
    setSavingDate(date);
    try {
      await run(() => upsertDailyLog(clientId, date, days[date]), { success: 'Day saved' });
    } finally {
      setSavingDate(null);
    }
  }

  function updateDay(date: string, patch: Partial<DayForm>) {
    setDays((prev) => ({ ...prev, [date]: { ...prev[date], ...patch } }));
  }

  const weekValues = weekDates.map((d) => days[d]);
  const loggedDays = weekValues.filter((d) => d.protein != null || d.carbs != null || d.fat != null);
  const totals = loggedDays.reduce(
    (acc, d) => {
      const cals = dayCalories(d.protein ?? 0, d.carbs ?? 0, d.fat ?? 0);
      acc.calories += cals;
      acc.protein += d.protein ?? 0;
      acc.carbs += d.carbs ?? 0;
      acc.fat += d.fat ?? 0;
      acc.steps += d.steps ?? 0;
      acc.bodyweight += d.bodyweight ?? 0;
      acc.bwCount += d.bodyweight != null ? 1 : 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, steps: 0, bodyweight: 0, bwCount: 0 }
  );
  const n = loggedDays.length || 1;

  const inputCls =
    'w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-xs font-medium text-zinc-500';

  return (
    <div className="space-y-6">
      {isCoachView && <HabitManager clientId={clientId} habits={habits} />}

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Weekly totals / averages ({loggedDays.length} logged days)
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-zinc-500">Avg calories</dt><dd>{Math.round(totals.calories / n)} kcal</dd></div>
          <div><dt className="text-zinc-500">Avg protein</dt><dd>{Math.round(totals.protein / n)} g</dd></div>
          <div><dt className="text-zinc-500">Avg carbs</dt><dd>{Math.round(totals.carbs / n)} g</dd></div>
          <div><dt className="text-zinc-500">Avg fat</dt><dd>{Math.round(totals.fat / n)} g</dd></div>
          <div><dt className="text-zinc-500">Total steps</dt><dd>{totals.steps}</dd></div>
          <div>
            <dt className="text-zinc-500">Avg bodyweight</dt>
            <dd>{totals.bwCount ? (totals.bodyweight / totals.bwCount).toFixed(1) : '—'} kg</dd>
          </div>
        </dl>
      </div>

      {weekDates.map((date) => {
        const d = days[date];
        const calories = dayCalories(d.protein ?? 0, d.carbs ?? 0, d.fat ?? 0);
        const cycleDay = gender === 'Female' ? cycleDayFor(periodStartDates, date) : null;
        return (
          <div key={date} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-black dark:text-zinc-50">
                {new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, {
                  weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
                })}
              </h4>
              <div className="text-sm text-zinc-500">
                {calories > 0 && <span>{Math.round(calories)} kcal</span>}
                {cycleDay && <span className="ml-2">· cycle day {cycleDay}</span>}
              </div>
            </div>

            {calories > 0 && calories < CALORIE_FLOOR && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Below {CALORIE_FLOOR} kcal — worth a coach review.
              </p>
            )}

            {habits.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/5 pb-3 text-sm dark:border-white/5">
                <span className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                  <CheckSquare className="h-3.5 w-3.5" /> Habits
                </span>
                {habits.map((habit) => {
                  const habitLog = habit.logs.find((l) => l.log_date === date);
                  const done = habitLog?.completed ?? false;
                  const key = `${habit.id}|${date}`;
                  return (
                    <label key={habit.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={isCoachView || busyHabitKey === key}
                        onChange={() => toggleHabit(habit.id, date, !done)}
                      />
                      {habit.name}
                    </label>
                  );
                })}
              </div>
            )}

            <fieldset disabled={readOnly} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <label className={labelCls}>Protein (g)</label>
                <input type="number" className={inputCls} value={d.protein ?? ''}
                  onChange={(e) => updateDay(date, { protein: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Carbs (g)</label>
                <input type="number" className={inputCls} value={d.carbs ?? ''}
                  onChange={(e) => updateDay(date, { carbs: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Fat (g)</label>
                <input type="number" className={inputCls} value={d.fat ?? ''}
                  onChange={(e) => updateDay(date, { fat: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Fibre (g)</label>
                <input type="number" className={inputCls} value={d.fibre ?? ''}
                  onChange={(e) => updateDay(date, { fibre: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Water (L)</label>
                <input type="number" step="0.1" className={inputCls} value={d.water ?? ''}
                  onChange={(e) => updateDay(date, { water: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Bodyweight (kg)</label>
                <input type="number" step="0.1" className={inputCls} value={d.bodyweight ?? ''}
                  onChange={(e) => updateDay(date, { bodyweight: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Steps</label>
                <input type="number" className={inputCls} value={d.steps ?? ''}
                  onChange={(e) => updateDay(date, { steps: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Sleep (hrs)</label>
                <input type="number" step="0.1" className={inputCls} value={d.sleep ?? ''}
                  onChange={(e) => updateDay(date, { sleep: numOrNull(e.target.value) })} />
              </div>

              {SCALE_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className={labelCls}>{label} (1-5)</label>
                  <select
                    className={inputCls}
                    value={d[key] ?? ''}
                    onChange={(e) => updateDay(date, { [key]: numOrNull(e.target.value) } as Partial<DayForm>)}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}

              <label className="flex items-center gap-2 pt-5 text-sm">
                <input type="checkbox" checked={d.gym_session}
                  onChange={(e) => updateDay(date, { gym_session: e.target.checked })} />
                Gym session
              </label>
              {gender === 'Female' && (
                <label className="flex items-center gap-2 pt-5 text-sm">
                  <input type="checkbox" checked={d.period_started}
                    onChange={(e) => updateDay(date, { period_started: e.target.checked })} />
                  Period started
                </label>
              )}

              <div className="col-span-2 space-y-1 sm:col-span-4">
                <label className={labelCls}>Notes</label>
                <textarea className={inputCls} rows={2} value={d.notes ?? ''}
                  onChange={(e) => updateDay(date, { notes: e.target.value })} />
              </div>
            </fieldset>

            {!readOnly && (
              <button
                onClick={() => saveDay(date)}
                disabled={savingDate === date}
                className="mt-3 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {savingDate === date ? 'Saving…' : 'Save day'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/app/_components/Button';
import { Checkbox } from '@/app/_components/Checkbox';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { dayCalories, cycleDayFor, weeklyTarget, CALORIE_FLOOR } from '@/lib/calculations';
import type { DayTarget } from '@/lib/calculations';
import { upsertDailyLog } from '@/lib/data/dailyLogs';
import { createHabit, deleteHabit, toggleHabitLog } from '@/lib/data/habits';
import { adherencePercent } from '@/lib/utils/habitStats';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import type { ClientProfileRow, DailyLogRow, HabitWithLogs } from '@/lib/data/types';

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

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

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
    <div className={cardCls}>
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
        <Button type="submit" variant="primary" disabled={creating}>
          {creating ? 'Adding…' : 'Add habit'}
        </Button>
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
                <Button variant="danger" size="sm" onClick={() => handleDelete(habit.id, habit.name)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MoodDots({ label, value, onChange, disabled }: { label: string; value: number | null; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
      <p className="w-20 shrink-0 text-sm text-zinc-500">{label}</p>
      <div className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} of 5`}
            className={`h-7 flex-1 rounded-full transition-colors disabled:opacity-60 ${
              value != null && n === value
                ? 'bg-accent'
                : 'bg-black/[.04] hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            }`}
          />
        ))}
      </div>
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
  profile,
  programWeek,
}: {
  clientId: string;
  weekDates: string[];
  initialLogs: DailyLogRow[];
  gender: string | null;
  periodStartDates: string[];
  readOnly: boolean;
  isCoachView: boolean;
  habits: HabitWithLogs[];
  profile: ClientProfileRow | null;
  programWeek: number;
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
  const [savedDates, setSavedDates] = useState<Record<string, boolean>>({});
  const todayIso = new Date().toISOString().slice(0, 10);
  // A single focused day at a time (7-day chip strip selects it), replacing the previous
  // stack of seven independently-collapsible day cards -- one form on screen instead of
  // seven, matching the mobile redesign brief.
  const [focusedDate, setFocusedDate] = useState(() => (weekDates.includes(todayIso) ? todayIso : weekDates[0]));

  const weekTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek) : null;
  }, [profile, programWeek]);

  function targetForDayType(dayType: DailyLogRow['day_type']): DayTarget | null {
    if (!weekTarget) return null;
    if (dayType === 'low') return weekTarget.dailyLow ?? weekTarget.dailyFlat ?? null;
    if (dayType === 'high') return weekTarget.dailyHigh ?? weekTarget.dailyFlat ?? null;
    return weekTarget.dailyFlat ?? null;
  }

  async function saveDay(date: string) {
    setSavingDate(date);
    try {
      await run(() => upsertDailyLog(clientId, date, days[date]), {
        onDone: () => setSavedDates((s) => ({ ...s, [date]: true })),
      });
    } finally {
      setSavingDate(null);
    }
  }

  function updateDay(date: string, patch: Partial<DayForm>) {
    setDays((prev) => ({ ...prev, [date]: { ...prev[date], ...patch } }));
    setSavedDates((s) => ({ ...s, [date]: false }));
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
    'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-zinc-500';

  const d = days[focusedDate];
  const calories = dayCalories(d.protein ?? 0, d.carbs ?? 0, d.fat ?? 0);
  const cycleDay = gender === 'Female' ? cycleDayFor(periodStartDates, focusedDate) : null;
  const dayTarget = targetForDayType(d.day_type);

  return (
    <div className="space-y-6">
      {isCoachView && <HabitManager clientId={clientId} habits={habits} />}

      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}>
          <p className="text-2xl font-bold text-black dark:text-zinc-50">{Math.round(totals.calories / n)}</p>
          <p className="mt-0.5 text-xs text-zinc-500">avg kcal</p>
        </div>
        <div className={cardCls}>
          <p className="text-2xl font-bold text-black dark:text-zinc-50">{Math.round(totals.protein / n)}g</p>
          <p className="mt-0.5 text-xs text-zinc-500">avg protein</p>
        </div>
        <div className={cardCls}>
          <p className="text-2xl font-bold text-black dark:text-zinc-50">{Math.round(totals.steps / n).toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-zinc-500">avg steps</p>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {loggedDays.length} logged day{loggedDays.length === 1 ? '' : 's'} this week · avg carbs{' '}
        {Math.round(totals.carbs / n)}g · avg fat {Math.round(totals.fat / n)}g · avg bodyweight{' '}
        {totals.bwCount ? (totals.bodyweight / totals.bwCount).toFixed(1) : '—'}kg
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {weekDates.map((date) => {
          const dayData = days[date];
          const logged = dayData.protein != null || dayData.carbs != null || dayData.fat != null;
          const dateObj = new Date(date + 'T00:00:00Z');
          const isFocused = date === focusedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => setFocusedDate(date)}
              className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors ${
                isFocused
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-black/[.05] text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              <span className="text-xs font-medium uppercase opacity-80">
                {dateObj.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="text-sm font-bold">{dateObj.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' })}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  logged ? (isFocused ? 'bg-accent-foreground' : 'bg-success') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium text-black dark:text-zinc-50">
            {new Date(focusedDate + 'T00:00:00Z').toLocaleDateString(undefined, {
              weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
            })}
          </h4>
          <span className="text-sm text-zinc-500">
            {calories > 0 && <span>{Math.round(calories)} kcal</span>}
            {cycleDay && <span className="ml-2">· cycle day {cycleDay}</span>}
          </span>
        </div>

        {calories > 0 && calories < CALORIE_FLOOR && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Below {CALORIE_FLOOR} kcal — worth a coach review.
          </p>
        )}

        {dayTarget && (
          <p className="mt-1 text-xs text-zinc-500">
            {Math.round(calories)} / {Math.round(dayTarget.calories)} kcal ·{' '}
            {Math.round(d.protein ?? 0)} / {Math.round(dayTarget.protein)}g protein
          </p>
        )}

        {habits.length > 0 && (
          <div className="mt-3 space-y-2 border-b border-black/5 pb-3 dark:border-white/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Habits</p>
            {habits.map((habit) => {
              const habitLog = habit.logs.find((l) => l.log_date === focusedDate);
              const done = habitLog?.completed ?? false;
              const key = `${habit.id}|${focusedDate}`;
              return (
                <label key={habit.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={done}
                    disabled={isCoachView || busyHabitKey === key}
                    onChange={() => toggleHabit(habit.id, focusedDate, !done)}
                    className="h-7 w-7 rounded-lg"
                  />
                  {habit.name}
                </label>
              );
            })}
          </div>
        )}

        <fieldset
          disabled={readOnly}
          onBlur={() => {
            if (!readOnly) saveDay(focusedDate);
          }}
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div className="space-y-1">
            <label className={labelCls}>Protein (g)</label>
            <input type="number" className={inputCls} value={d.protein ?? ''}
              onChange={(e) => updateDay(focusedDate, { protein: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Carbs (g)</label>
            <input type="number" className={inputCls} value={d.carbs ?? ''}
              onChange={(e) => updateDay(focusedDate, { carbs: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Fat (g)</label>
            <input type="number" className={inputCls} value={d.fat ?? ''}
              onChange={(e) => updateDay(focusedDate, { fat: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Fibre (g)</label>
            <input type="number" className={inputCls} value={d.fibre ?? ''}
              onChange={(e) => updateDay(focusedDate, { fibre: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Water (L)</label>
            <input type="number" step="0.1" className={inputCls} value={d.water ?? ''}
              onChange={(e) => updateDay(focusedDate, { water: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Bodyweight (kg)</label>
            <input type="number" step="0.1" className={inputCls} value={d.bodyweight ?? ''}
              onChange={(e) => updateDay(focusedDate, { bodyweight: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Steps</label>
            <input type="number" className={inputCls} value={d.steps ?? ''}
              onChange={(e) => updateDay(focusedDate, { steps: numOrNull(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Sleep (hrs)</label>
            <input type="number" step="0.1" className={inputCls} value={d.sleep ?? ''}
              onChange={(e) => updateDay(focusedDate, { sleep: numOrNull(e.target.value) })} />
          </div>

          {SCALE_FIELDS.map(({ key, label }) => (
            <MoodDots
              key={key}
              label={`${label} (1-5)`}
              value={d[key]}
              disabled={readOnly}
              onChange={(n) => {
                updateDay(focusedDate, { [key]: n } as Partial<DayForm>);
                if (!readOnly) saveDay(focusedDate);
              }}
            />
          ))}

          <label className="flex items-center gap-2 pt-5 text-sm">
            <Checkbox checked={d.gym_session}
              onChange={(e) => updateDay(focusedDate, { gym_session: e.target.checked })} />
            Gym session
          </label>
          {gender === 'Female' && (
            <label className="flex items-center gap-2 pt-5 text-sm">
              <Checkbox checked={d.period_started}
                onChange={(e) => updateDay(focusedDate, { period_started: e.target.checked })} />
              Period started
            </label>
          )}

          <div className="col-span-2 space-y-1 sm:col-span-4">
            <label className={labelCls}>Notes</label>
            <textarea className={inputCls} rows={2} value={d.notes ?? ''}
              onChange={(e) => updateDay(focusedDate, { notes: e.target.value })} />
          </div>
        </fieldset>

        {!readOnly && (savingDate === focusedDate || savedDates[focusedDate]) && (
          <p className="mt-3 text-xs text-zinc-500">
            {savingDate === focusedDate ? 'Saving…' : 'Saved ✓'}
          </p>
        )}
      </div>
    </div>
  );
}

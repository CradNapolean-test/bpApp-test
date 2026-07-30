'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { dayCalories, cycleDayFor, CALORIE_FLOOR } from '@/lib/calculations';
import { upsertDailyLog } from '@/lib/data/dailyLogs';
import type { DailyLogRow } from '@/lib/data/types';

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

export function WeeklyLogTab({
  clientId,
  weekDates,
  initialLogs,
  gender,
  periodStartDates,
  readOnly,
}: {
  clientId: string;
  weekDates: string[];
  initialLogs: DailyLogRow[];
  gender: string | null;
  periodStartDates: string[];
  readOnly: boolean;
}) {
  const { run } = useAction();
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/app/_components/Checkbox';
import { Check, ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { dayCalories, cycleDayFor, weeklyTarget, CALORIE_FLOOR } from '@/lib/calculations';
import type { DayTarget } from '@/lib/calculations';
import { upsertDailyLog } from '@/lib/data/dailyLogs';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { dayTrafficLight } from '@/lib/utils/accountability';
import { AccountabilityTracker } from './AccountabilityTracker';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';
import { getReviewedWeeks, markReviewed, unmarkReviewed } from '@/lib/data/coachReviews';
import { addDays, toIsoDate } from '@/lib/utils/dates';

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

const LIGHT_DOT = { green: 'bg-success', amber: 'bg-warning', red: 'bg-danger' } as const;

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

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
              value != null && n <= value
                ? 'bg-accent'
                : 'bg-black/[.04] hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function WeekLog({
  clientId,
  weekDates,
  initialLogs,
  gender,
  periodStartDates,
  readOnly,
  isCoachView,
  profile,
  programWeek,
  onOpenFoodDiary,
  attendedSessions,
}: {
  clientId: string;
  weekDates: string[];
  initialLogs: DailyLogRow[];
  gender: string | null;
  periodStartDates: string[];
  readOnly: boolean;
  isCoachView: boolean;
  profile: ClientProfileRow | null;
  programWeek: number;
  // Takes the member to the Food Tracking diary (where calories and macros are logged).
  onOpenFoodDiary?: () => void;
  // Classes the member attended, by date -- a day with one counts as a gym session automatically.
  attendedSessions: { date: string; label: string }[];
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
  const [savedDates, setSavedDates] = useState<Record<string, boolean>>({});
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  // Calories and macros always come from the food diary (full tracking, or typed totals); the
  // check-in never edits them. Photo-diary members have no numbers at all (photos can't be turned
  // into calories), so every food figure is hidden for them.
  const mode = profile?.nutrition_tracking_mode ?? 'full_tracking';
  const isPhoto = mode === 'photo_diary';
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

  // `patch` lets slider/button commits save the value they just set -- React state from the
  // updateDay() call immediately before hasn't landed yet, so days[date] would still be stale.
  async function saveDay(date: string, patch: Partial<DayForm> = {}) {
    setSavingDate(date);
    try {
      // Macros are the food diary's to write; sending this form's older copy of them would
      // overwrite what the diary just recorded.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { protein, carbs, fat, fibre, ...fields } = { ...days[date], ...patch };
      await run(() => upsertDailyLog(clientId, date, fields), {
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
  // Each average only counts the days that actually have that figure -- a day with food but no steps
  // must not drag the steps average down.
  const avg = (vals: (number | null)[]) => {
    const present = vals.filter((v): v is number => v != null);
    return present.length ? present.reduce((a, v) => a + v, 0) / present.length : null;
  };
  const foodDays = weekValues.filter((d) => d.protein != null || d.carbs != null || d.fat != null);
  const avgCalories = avg(foodDays.map((d) => dayCalories(d.protein ?? 0, d.carbs ?? 0, d.fat ?? 0)));
  const avgProtein = avg(foodDays.map((d) => d.protein));
  const avgCarbs = avg(foodDays.map((d) => d.carbs));
  const avgFat = avg(foodDays.map((d) => d.fat));
  const avgSteps = avg(weekValues.map((d) => d.steps));
  const avgBodyweight = avg(weekValues.map((d) => d.bodyweight));
  const loggedDays = foodDays;
  const fmt = (v: number | null, digits = 0) => (v == null ? '—' : digits ? v.toFixed(digits) : Math.round(v).toLocaleString());

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-zinc-500';

  const d = days[focusedDate];
  const calories = dayCalories(d.protein ?? 0, d.carbs ?? 0, d.fat ?? 0);
  const cycleDay = gender === 'Female' ? cycleDayFor(periodStartDates, focusedDate) : null;
  const dayTarget = targetForDayType(d.day_type);
  const attendedToday = attendedSessions.find((a) => a.date === focusedDate) ?? null;
  const gymOn = d.gym_session || attendedToday != null;

  return (
    <div className="space-y-6">
      {isPhoto ? (
        <div className="grid grid-cols-2 gap-3">
          <div className={cardCls}>
            <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgSteps)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">avg steps</p>
          </div>
          <div className={cardCls}>
            <p className="text-2xl font-bold text-black dark:text-zinc-50">
              {fmt(avgBodyweight, 1)}
              {avgBodyweight != null && <span className="text-sm font-bold text-zinc-500">kg</span>}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">avg bodyweight</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={cardCls}>
              <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgCalories)}</p>
              <p className="mt-0.5 text-xs text-zinc-500">avg kcal</p>
            </div>
            <div className={cardCls}>
              <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgProtein)}{avgProtein != null && 'g'}</p>
              <p className="mt-0.5 text-xs text-zinc-500">avg protein</p>
            </div>
            <div className={cardCls}>
              <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgSteps)}</p>
              <p className="mt-0.5 text-xs text-zinc-500">avg steps</p>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            {loggedDays.length} day{loggedDays.length === 1 ? '' : 's'} of food logged this week · avg carbs {fmt(avgCarbs)}
            {avgCarbs != null && 'g'} · avg fat {fmt(avgFat)}
            {avgFat != null && 'g'} · avg bodyweight {fmt(avgBodyweight, 1)}
            {avgBodyweight != null && 'kg'}
          </p>
        </>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {weekDates.map((date) => {
          const dayData = days[date];
          const logged = dayData.protein != null || dayData.carbs != null || dayData.fat != null;
          const light = dayTrafficLight(dayData);
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
                  light
                    ? isFocused ? 'bg-accent-foreground' : LIGHT_DOT[light]
                    : logged ? (isFocused ? 'bg-accent-foreground' : 'bg-zinc-400') : 'bg-transparent'
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
            {!isPhoto && calories > 0 && <span>{Math.round(calories)} kcal</span>}
            {cycleDay && <span className="ml-2">· cycle day {cycleDay}</span>}
          </span>
        </div>

        {!isPhoto && calories > 0 && calories < CALORIE_FLOOR && focusedDate < todayIso && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Below {CALORIE_FLOOR} kcal — worth a coach review.
          </p>
        )}

        {!isPhoto && dayTarget && (
          <p className="mt-1 text-xs text-zinc-500">
            {Math.round(calories)} / {Math.round(dayTarget.calories)} kcal ·{' '}
            {Math.round(d.protein ?? 0)} / {Math.round(dayTarget.protein)}g protein
          </p>
        )}

        <div className="mt-3 space-y-2">
          {(['sleep', 'steps', 'water'] as const).map((metric) => (
            <AccountabilityTracker
              key={metric}
              metric={metric}
              value={d[metric]}
              disabled={readOnly}
              onChange={(v) => updateDay(focusedDate, { [metric]: v } as Partial<DayForm>)}
              onCommit={(v) => {
                if (!readOnly) saveDay(focusedDate, { [metric]: v } as Partial<DayForm>);
              }}
            />
          ))}
        </div>

        {isPhoto ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-card-muted p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Food · photo diary</p>
              <p className="mt-0.5 text-xs text-zinc-500">{isCoachView ? 'Their meal photos are in the Nutrition tab.' : 'Your coach looks through your meal photos.'}</p>
            </div>
            {onOpenFoodDiary && !isCoachView && (
              <button type="button" onClick={onOpenFoodDiary} className="shrink-0 text-xs font-bold text-accent">
                Open photo diary →
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-card-muted p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Food · {mode === 'manual_import' ? (isCoachView ? 'their totals' : 'your totals') : isCoachView ? 'from their diary' : 'from your diary'}
              </p>
              {onOpenFoodDiary && !isCoachView && (
                <button type="button" onClick={onOpenFoodDiary} className="text-xs font-bold text-accent">
                  Open food diary →
                </button>
              )}
            </div>
            <div className={`grid gap-1.5 text-center ${mode === 'manual_import' ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {[
                ['kcal', Math.round(calories)],
                ['Protein', d.protein],
                ['Carbs', d.carbs],
                ['Fat', d.fat],
                ...(mode === 'manual_import' ? [] : [['Fibre', d.fibre]]),
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-base font-black text-black dark:text-zinc-50">
                    {value == null ? '—' : Math.round(value as number)}
                    {value != null && label !== 'kcal' && <span className="text-[11px] font-bold text-zinc-500">g</span>}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
            {mode !== 'manual_import' && (
              <p className="mt-2 text-[11px] text-zinc-400">Fibre counts the foods that have a fibre figure.</p>
            )}
          </div>
        )}

        {isCoachView ? (
          <dl className="mt-3 divide-y divide-black/[.05] rounded-xl border border-black/[.05] text-sm dark:divide-white/10 dark:border-white/10">
            {([
              ['Bodyweight', d.bodyweight != null ? `${d.bodyweight} kg` : null],
              ...SCALE_FIELDS.map(({ key, label }) => [label, d[key] != null ? `${d[key]} / 5` : null] as [string, string | null]),
              ['Gym session', gymOn ? (attendedToday != null ? `Yes, ${attendedToday.label}` : 'Yes') : 'No'],
              ...(gender === 'Female' ? [['Period started', d.period_started ? 'Yes' : 'No'] as [string, string | null]] : []),
            ] as [string, string | null][]).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="text-zinc-500">{label}</dt>
                <dd className={value == null ? 'text-zinc-400' : 'font-semibold text-black dark:text-zinc-50'}>{value ?? 'Not logged'}</dd>
              </div>
            ))}
            <div className="px-3 py-2">
              <dt className="text-zinc-500">Notes</dt>
              <dd className={`mt-0.5 whitespace-pre-wrap ${d.notes ? 'text-black dark:text-zinc-50' : 'text-zinc-400'}`}>{d.notes || 'No notes'}</dd>
            </div>
          </dl>
        ) : (
        <fieldset
          disabled={readOnly}
          onBlur={() => {
            if (!readOnly) saveDay(focusedDate);
          }}
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <label className="col-span-2 flex h-16 items-center justify-between gap-3 rounded-full border border-black/10 bg-card px-6 transition-colors focus-within:border-accent disabled:opacity-60 dark:border-white/10 sm:col-span-4">
            <span className="text-sm font-extrabold text-black dark:text-zinc-50">Bodyweight</span>
            <span className="flex items-baseline gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="—"
                aria-label="Bodyweight in kilograms"
                className="w-28 bg-transparent text-right text-3xl font-black text-black outline-none placeholder:text-zinc-400 dark:text-zinc-50"
                value={d.bodyweight ?? ''}
                onChange={(e) => updateDay(focusedDate, { bodyweight: numOrNull(e.target.value) })}
              />
              <span className="text-base font-bold text-zinc-500">kg</span>
            </span>
          </label>

          <p className="col-span-2 -mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-4">
            How are you feeling? <span className="font-medium normal-case tracking-normal">1 = low, 5 = high</span>
          </p>

          {SCALE_FIELDS.map(({ key, label }) => (
            <MoodDots
              key={key}
              label={label}
              value={d[key]}
              disabled={readOnly}
              onChange={(n) => {
                updateDay(focusedDate, { [key]: n } as Partial<DayForm>);
                if (!readOnly) saveDay(focusedDate, { [key]: n } as Partial<DayForm>);
              }}
            />
          ))}

          <button
            type="button"
            aria-pressed={gymOn}
            disabled={attendedToday != null}
            onClick={() => {
              const next = !d.gym_session;
              updateDay(focusedDate, { gym_session: next });
              if (!readOnly) saveDay(focusedDate, { gym_session: next });
            }}
            className={`col-span-2 flex h-16 w-full items-center justify-between gap-3 rounded-full px-6 text-left transition-colors disabled:cursor-default sm:col-span-4 ${
              gymOn ? 'bg-accent text-accent-foreground' : 'border border-black/10 bg-card text-black hover:bg-black/[.03] dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/[.04]'
            }`}
          >
            <span className="flex items-center gap-3">
              <Dumbbell className="h-6 w-6 shrink-0" />
              <span>
                <span className="block text-sm font-extrabold">Gym session</span>
                <span className={`block text-xs font-medium ${gymOn ? 'opacity-80' : 'text-zinc-500'}`}>
                  {attendedToday != null ? `From your booking · ${attendedToday.label}` : gymOn ? 'Logged for today' : 'Tap if you trained'}
                </span>
              </span>
            </span>
            {gymOn && <Check className="h-6 w-6 shrink-0" strokeWidth={3} />}
          </button>
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
        )}

        {!readOnly && (savingDate === focusedDate || savedDates[focusedDate]) && (
          <p className="mt-3 text-xs text-zinc-500">
            {savingDate === focusedDate ? 'Saving…' : 'Saved ✓'}
          </p>
        )}
      </div>
    </div>
  );
}


type WeekLogProps = Parameters<typeof WeekLog>[0];

const weekLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The check-in screen with a week picker: the member can look back and fill in a missed day, and a
// coach reviews last week's check-in here (the dashboard's "Weekly check-ins" list links to it) and
// marks it reviewed.
export function WeeklyLogTab(
  props: WeekLogProps & {
    historyLogs: DailyLogRow[];
    // The member's own coach can mark a week reviewed.
    canReview?: boolean;
    // A specific week (its Monday) to open on, e.g. from the dashboard.
    startWeek?: string | null;
  }
) {
  const { historyLogs, canReview = false, startWeek = null, ...rest } = props;
  const currentStart = rest.weekDates[0];
  const [offset, setOffset] = useState(() =>
    startWeek ? Math.round((new Date(startWeek).getTime() - new Date(currentStart).getTime()) / (7 * 86400000)) : 0
  );
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const weekStart = toIsoDate(addDays(new Date(currentStart + 'T00:00:00Z'), offset * 7));
  const dates = Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), i)));
  const logs = offset === 0 ? rest.initialLogs : historyLogs.filter((l) => dates.includes(l.log_date));

  useEffect(() => {
    if (!rest.isCoachView) return;
    getReviewedWeeks(rest.clientId).then((weeks) => setReviewed(new Set(weeks)));
  }, [rest.isCoachView, rest.clientId]);

  async function toggleReviewed() {
    setBusy(true);
    const done = reviewed.has(weekStart);
    const res = done ? await unmarkReviewed('week', rest.clientId, weekStart) : await markReviewed('week', rest.clientId, weekStart);
    setBusy(false);
    if (res.ok) {
      setReviewed((prev) => {
        const next = new Set(prev);
        if (done) next.delete(weekStart);
        else next.add(weekStart);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => setOffset(offset - 1)}
          className="rounded-full p-2 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-black dark:text-zinc-50">
            {offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `Week of ${weekLabel(weekStart)}`}
          </p>
          <p className="text-xs text-zinc-500">
            {weekLabel(dates[0])} to {weekLabel(dates[6])}
          </p>
        </div>
        <button
          type="button"
          aria-label="Next week"
          disabled={offset >= 0}
          onClick={() => setOffset(offset + 1)}
          className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {rest.isCoachView && canReview && (
        <button
          type="button"
          disabled={busy}
          onClick={toggleReviewed}
          className={`flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-extrabold disabled:opacity-60 ${
            reviewed.has(weekStart)
              ? 'bg-success/15 text-success'
              : 'bg-accent text-accent-foreground'
          }`}
        >
          <Check className="h-4 w-4" />
          {reviewed.has(weekStart) ? 'Week reviewed (tap to undo)' : 'Mark this week as reviewed'}
        </button>
      )}

      <WeekLog key={weekStart} {...rest} weekDates={dates} initialLogs={logs} />
    </div>
  );
}

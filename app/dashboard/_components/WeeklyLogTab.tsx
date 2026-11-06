'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Checkbox } from '@/app/_components/Checkbox';
import { Check, ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { useToast } from '@/app/_components/ToastProvider';
import { cycleDayFor, weeklyTarget, CALORIE_FLOOR } from '@/lib/calculations';
import type { DayTarget } from '@/lib/calculations';
import { getDailyLogs, upsertDailyLog } from '@/lib/data/dailyLogs';
import { LOCKED_DAY_MESSAGE, canBrowseWeek, canEditDay, changedFields } from '@/lib/dayPatch';
import { dayCaloriesOf, hasFoodLogged } from '@/lib/utils/dailyLog';
import { BODYWEIGHT_KG, bodyweightMessage, isValidBodyweight } from '@/lib/limits';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { averageDayTarget, dayTargetFor } from '@/lib/utils/dayTarget';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { dayTrafficLight } from '@/lib/utils/accountability';
import { AccountabilityTracker } from './AccountabilityTracker';
import { enabledTrackers, toDisabledMetricSet, weekStats } from '@/lib/checkinMetrics';
import type { CheckinMetric } from '@/lib/checkinMetrics';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';
import { getReviewedWeeks, markReviewed, unmarkReviewed } from '@/lib/data/coachReviews';
import { sendMessage } from '@/lib/data/chat';
import { checkinReplyHeading, checkinReplyMax, checkinReplyText } from '@/lib/checkinReply';
import { isQueuedCheckin, nextQueuedCheckin } from '@/lib/checkinQueue';
import { addDays, toIsoDate } from '@/lib/utils/dates';

type DayForm = Omit<DailyLogRow, 'id' | 'client_id' | 'log_date'>;

const BLANK_DAY: DayForm = {
  protein: null, carbs: null, fat: null, fibre: null, calories: null, water: null,
  bodyweight: null, steps: null, sleep: null,
  gym_session: false, day_type: 'flat',
  hunger: null, energy: null, motivation: null, stress: null,
  period_started: false, notes: null,
};

function numOrNull(v: string): number | null {
  return v === '' ? null : Number(v);
}

// The form for each day of a week, from whatever was stored (nothing stored = a blank day).
function buildDays(weekDates: string[], logs: DailyLogRow[]): Record<string, DayForm> {
  const map: Record<string, DayForm> = {};
  for (const date of weekDates) {
    const existing = logs.find((l) => l.log_date === date);
    map[date] = existing
      ? {
          protein: existing.protein, carbs: existing.carbs, fat: existing.fat, fibre: existing.fibre, calories: existing.calories,
          water: existing.water, bodyweight: existing.bodyweight, steps: existing.steps, sleep: existing.sleep,
          gym_session: existing.gym_session, day_type: existing.day_type,
          hunger: existing.hunger, energy: existing.energy, motivation: existing.motivation, stress: existing.stress,
          period_started: existing.period_started, notes: existing.notes,
        }
      : { ...BLANK_DAY };
  }
  return map;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not save that. Please try again.';
}

// How long to wait after the last keystroke before saving typed text.
const SAVE_DELAY_MS = 1000;

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
      <div role="group" aria-label={label} className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} of 5`}
            aria-pressed={value === n}
            className={`h-10 flex-1 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
              value != null && n <= value
                ? 'bg-accent text-accent-foreground'
                : 'bg-black/[.04] text-zinc-500 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            }`}
          >
            {/* the number is the cue that does not depend on colour */}
            {n}
          </button>
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
  disabledMetrics = [],
  onSaved,
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
  // Check-in measures the coach has switched off for this member (sleep, steps, water, hunger, energy, ...).
  disabledMetrics?: string[];
  // Called after a day was saved, so the dashboard can refresh once when the member leaves this screen instead of after every save.
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [initialDays] = useState(() => buildDays(weekDates, initialLogs));
  const [days, setDays] = useState<Record<string, DayForm>>(initialDays);
  // The latest form (set the moment the member edits, before React re-renders) and what is stored. A save sends only the difference,
  // so a field the member did not touch is never overwritten with whatever this screen happened to be holding (R14).
  const daysRef = useRef<Record<string, DayForm>>(initialDays);
  const baselineRef = useRef<Record<string, DayForm>>(initialDays);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
    // No target is shown to a member whose plan is waiting for their coach (M8).
    const engineProfile = toMemberEngineProfile(profile, isCoachView);
    return engineProfile ? weeklyTarget(engineProfile, programWeek) : null;
  }, [profile, programWeek, isCoachView]);

  // A day's own target (a calorie-cycling member's high day has the high one), and the planned average day the week's averages
  // are read against.
  const targetForDayType = (dayType: DailyLogRow['day_type']): DayTarget | null => dayTargetFor(weekTarget, dayType);
  const averageTarget = averageDayTarget(weekTarget);

  // Saves what changed on a day since it was loaded or last saved, and nothing else. `from` says what asked: a field name (a slider, a
  // toggle, the weight box) or 'flush' (leaving the form). Saves run one after another, so a slow one can never land after a newer one.
  function saveDay(date: string, from: keyof DayForm | 'flush' = 'flush') {
    clearTimeout(timers.current[date]);
    delete timers.current[date];
    saveChain.current = saveChain.current.then(() => persist(date, from));
  }

  async function persist(date: string, from: keyof DayForm | 'flush') {
    let patch = changedFields(baselineRef.current[date], daysRef.current[date]);
    // The database refuses a bodyweight outside 20-400 kg. Checked here too, so a typo in that one box can't stop the rest of the day
    // (sleep, steps, water) from saving: it is reported when the member just edited it or leaves the form, and left out of the save.
    if (patch.bodyweight != null && !isValidBodyweight(Number(patch.bodyweight))) {
      if (from === 'bodyweight' || from === 'flush') toast.error(bodyweightMessage);
      const { bodyweight: _dropped, ...rest } = patch; // eslint-disable-line @typescript-eslint/no-unused-vars
      patch = rest;
    }
    if (Object.keys(patch).length === 0) return;
    setSavingDate(date);
    try {
      await upsertDailyLog(clientId, date, patch as Partial<DayForm>);
      baselineRef.current = { ...baselineRef.current, [date]: { ...baselineRef.current[date], ...patch } as DayForm };
      setSavedDates((s) => ({ ...s, [date]: true }));
      onSaved?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSavingDate(null);
    }
  }

  // Typed text (notes, the weight box) is saved a moment after the last keystroke, and straight away when the member leaves the box.
  function scheduleSave(date: string, from: keyof DayForm) {
    clearTimeout(timers.current[date]);
    timers.current[date] = setTimeout(() => saveDay(date, from), SAVE_DELAY_MS);
  }

  function updateDay(date: string, patch: Partial<DayForm>) {
    daysRef.current = { ...daysRef.current, [date]: { ...daysRef.current[date], ...patch } };
    setDays(daysRef.current);
    setSavedDates((s) => ({ ...s, [date]: false }));
  }

  // Leaving the screen, or putting the phone down, saves anything still waiting on the typing delay.
  useEffect(() => {
    const flushAll = () => {
      for (const date of Object.keys(timers.current)) saveDay(date);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekValues = weekDates.map((d) => days[d]);
  // Each average only counts the days that actually have that figure -- a day with food but no steps
  // must not drag the steps average down.
  const avg = (vals: (number | null)[]) => {
    const present = vals.filter((v): v is number => v != null);
    return present.length ? present.reduce((a, v) => a + v, 0) / present.length : null;
  };
  // Calories include Quick Adds with no macros (R11), and a day whose food was all deleted is not a food day (M2).
  // Food planned for tomorrow is not eaten yet, so it is left out until it is today.
  const foodDays = weekValues.filter((d, i) => weekDates[i] <= todayIso && hasFoodLogged(d));
  const avgCalories = avg(foodDays.map(dayCaloriesOf));
  const avgProtein = avg(foodDays.map((d) => d.protein));
  const avgCarbs = avg(foodDays.map((d) => d.carbs));
  const avgFat = avg(foodDays.map((d) => d.fat));
  const avgSteps = avg(weekValues.map((d) => d.steps));
  const avgBodyweight = avg(weekValues.map((d) => d.bodyweight));
  const loggedDays = foodDays;
  // Days of this week that have happened (a whole past week is 7).
  const daysSoFar = weekDates.filter((d) => d <= todayIso).length;
  const fmt = (v: number | null, digits = 0) => (v == null ? '—' : digits ? v.toFixed(digits) : Math.round(v).toLocaleString());

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10 disabled:opacity-60';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-zinc-500';

  const d = days[focusedDate];
  const off = toDisabledMetricSet(disabledMetrics);
  const trackers = enabledTrackers(off) as ('sleep' | 'steps' | 'water')[];
  const scaleFields = SCALE_FIELDS.filter((f) => !off.has(f.key));
  const stats = isCoachView
    ? weekStats(weekDates.map((date) => ({ date, values: days[date] as Partial<Record<CheckinMetric, number | null>> })), off)
    : [];
  const calories = dayCaloriesOf(d);
  // Members change the last two weeks; older days are read-only (D20). A coach is read-only here anyway.
  const dayLocked = !isCoachView && !canEditDay(focusedDate, todayIso);
  const locked = readOnly || dayLocked;
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
              {/* A coach reads an average against the target, and needs to know how many days it is built from (CR3). */}
              {isCoachView && averageTarget && <p className="text-[11px] text-zinc-500">of {Math.round(averageTarget.calories).toLocaleString()}</p>}
            </div>
            <div className={cardCls}>
              <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgProtein)}{avgProtein != null && 'g'}</p>
              <p className="mt-0.5 text-xs text-zinc-500">avg protein</p>
              {isCoachView && averageTarget && <p className="text-[11px] text-zinc-500">of {Math.round(averageTarget.protein)}g</p>}
            </div>
            <div className={cardCls}>
              <p className="text-2xl font-bold text-black dark:text-zinc-50">{fmt(avgSteps)}</p>
              <p className="mt-0.5 text-xs text-zinc-500">avg steps</p>
            </div>
          </div>
          {isCoachView && daysSoFar > 0 && loggedDays.length < daysSoFar && (
            <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${loggedDays.length === 0 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
              {loggedDays.length === 0
                ? `No food logged on any of the ${daysSoFar} days${daysSoFar < 7 ? ' so far' : ''}.`
                : `Food logged on ${loggedDays.length} of ${daysSoFar} days, so the averages above come from ${loggedDays.length === 1 ? 'one day' : `those ${loggedDays.length} days`}.`}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            {/* The warning above already gives a coach the day count. */}
            {isCoachView && daysSoFar > 0 && loggedDays.length < daysSoFar ? '' : `${loggedDays.length} day${loggedDays.length === 1 ? '' : 's'} of food logged this week · `}
            avg carbs {fmt(avgCarbs)}
            {avgCarbs != null && 'g'} · avg fat {fmt(avgFat)}
            {avgFat != null && 'g'} · avg bodyweight {fmt(avgBodyweight, 1)}
            {avgBodyweight != null && 'kg'}
          </p>
        </>
      )}

      {isCoachView && stats.length > 0 && (
        <div className={cardCls}>
          <h4 className="text-sm font-bold text-black dark:text-zinc-50">Check-in this week</h4>
          <p className="text-xs text-zinc-500">Average, lowest and highest day for each measure that is switched on.</p>
          <div className="mt-3 divide-y divide-black/[.05] dark:divide-white/10">
            <div className="grid grid-cols-[1fr_3.5rem_4.5rem_4.5rem] gap-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>Measure</span>
              <span className="text-right">Avg</span>
              <span className="text-right">Low</span>
              <span className="text-right">High</span>
            </div>
            {stats.map((m) => {
              // Steps are whole numbers with a thousands comma ("9,929", not "9928.6"); everything else keeps one decimal.
              const fmtV = (v: number) =>
                m.key === 'steps'
                  ? Math.round(v).toLocaleString()
                  : (Number.isInteger(v) ? String(v) : v.toFixed(1)) + (m.unit === '/5' || m.unit === '' ? '' : m.unit);
              // The lowest and highest columns are narrow: steps there read "11.5k" so the day still fits beside them.
              const fmtEnd = (v: number) => (m.key === 'steps' && v >= 1000 ? `${(Math.round(v / 100) / 10).toLocaleString()}k` : fmtV(v));
              const dayName = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
              return (
                <div key={m.key} className="grid grid-cols-[1fr_3.5rem_4.5rem_4.5rem] items-center gap-2 py-1.5 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {m.label} <span className="text-[11px] text-zinc-400">{m.days}/7 days</span>
                  </span>
                  <span className="text-right font-semibold text-black dark:text-zinc-50">{m.avg == null ? '-' : fmtV(Math.round(m.avg * 10) / 10)}</span>
                  <span className="text-right text-zinc-500">{m.low ? `${fmtEnd(m.low.value)} ${dayName(m.low.date)}` : '-'}</span>
                  <span className="text-right text-zinc-500">{m.high ? `${fmtEnd(m.high.value)} ${dayName(m.high.date)}` : '-'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {weekDates.map((date) => {
          const dayData = days[date];
          const logged = hasFoodLogged(dayData);
          const light = dayTrafficLight(dayData);
          const dateObj = new Date(date + 'T00:00:00Z');
          const isFocused = date === focusedDate;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={isFocused}
              onClick={() => setFocusedDate(date)}
              className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors ${
                isFocused
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-black/[.05] text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              <span className="text-xs font-medium uppercase opacity-80">
                {dateObj.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="text-sm font-bold">{dateObj.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })}</span>
              {/* The dot is colour only, so the same thing is said in words for a screen reader (L7). */}
              <span className="sr-only">{light ? `${light} day` : logged ? 'logged' : 'nothing logged'}</span>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  light
                    ? isFocused ? 'bg-accent-foreground' : LIGHT_DOT[light]
                    : logged ? (isFocused ? 'bg-accent-foreground' : 'bg-zinc-400') : 'bg-transparent'
                }`}
              />
              {/* The dot is sleep, steps and water only, so a coach could see a green week with no food in it (CR3). Calories go under it. */}
              {isCoachView && !isPhoto && date <= todayIso && (
                <span className={`text-[10px] font-bold leading-none ${isFocused ? '' : logged ? 'text-zinc-500' : 'text-danger'}`}>
                  {logged ? Math.round(dayCaloriesOf(dayData)).toLocaleString() : 'no food'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium text-black dark:text-zinc-50">
            {new Date(focusedDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
              weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
            })}
          </h4>
          <span className="text-sm text-zinc-500">
            {!isPhoto && calories > 0 && <span>{Math.round(calories)} kcal</span>}
            {cycleDay && <span className="ml-2">· cycle day {cycleDay}</span>}
          </span>
        </div>

        {dayLocked && <p className="mt-2 rounded-xl bg-card-muted px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{LOCKED_DAY_MESSAGE}</p>}

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
          {trackers.map((metric) => (
            <AccountabilityTracker
              key={metric}
              metric={metric}
              value={d[metric]}
              disabled={locked}
              onChange={(v) => updateDay(focusedDate, { [metric]: v } as Partial<DayForm>)}
              onCommit={(v) => {
                if (locked) return;
                updateDay(focusedDate, { [metric]: v } as Partial<DayForm>);
                saveDay(focusedDate, metric);
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
              ...scaleFields.map(({ key, label }) => [label, d[key] != null ? `${d[key]} / 5` : null] as [string, string | null]),
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
          disabled={locked}
          onBlur={() => {
            if (!locked) saveDay(focusedDate);
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
                min={BODYWEIGHT_KG.min}
                max={BODYWEIGHT_KG.max}
                placeholder="—"
                aria-label="Bodyweight in kilograms"
                className="w-28 bg-transparent text-right text-3xl font-black text-black outline-none placeholder:text-zinc-400 dark:text-zinc-50"
                value={d.bodyweight ?? ''}
                onChange={(e) => {
                  updateDay(focusedDate, { bodyweight: numOrNull(e.target.value) });
                  scheduleSave(focusedDate, 'bodyweight');
                }}
              />
              <span className="text-base font-bold text-zinc-500">kg</span>
            </span>
          </label>

          {scaleFields.length > 0 && (
            <>
          <p className="col-span-2 -mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-4">
            How are you feeling? <span className="font-medium normal-case tracking-normal">1 = low, 5 = high</span>
          </p>

          {scaleFields.map(({ key, label }) => (
            <MoodDots
              key={key}
              label={label}
              value={d[key]}
              disabled={locked}
              onChange={(n) => {
                updateDay(focusedDate, { [key]: n } as Partial<DayForm>);
                if (!locked) saveDay(focusedDate, key);
              }}
            />
          ))}
            </>
          )}

          <button
            type="button"
            aria-pressed={gymOn}
            disabled={attendedToday != null}
            onClick={() => {
              const next = !d.gym_session;
              updateDay(focusedDate, { gym_session: next });
              if (!locked) saveDay(focusedDate, 'gym_session');
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
                onChange={(e) => {
                  updateDay(focusedDate, { period_started: e.target.checked });
                  saveDay(focusedDate, 'period_started');
                }} />
              Period started
            </label>
          )}

          <div className="col-span-2 space-y-1 sm:col-span-4">
            <label htmlFor="weekly-notes" className={labelCls}>Notes</label>
            <textarea id="weekly-notes" className={inputCls} rows={2} maxLength={1000} value={d.notes ?? ''}
              onChange={(e) => {
                updateDay(focusedDate, { notes: e.target.value });
                scheduleSave(focusedDate, 'notes');
              }} />
          </div>
        </fieldset>
        )}

        {!locked && (savingDate === focusedDate || savedDates[focusedDate]) && (
          <p className="mt-3 text-xs text-zinc-500">
            {savingDate === focusedDate ? 'Saving…' : 'Saved ✓'}
          </p>
        )}
      </div>
    </div>
  );
}


type WeekLogProps = Omit<Parameters<typeof WeekLog>[0], 'onSaved'>;

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
  // historyLogs is no longer read: an older week is fetched when the member opens it (R14). It used to be built from the 84 days the
  // page happened to have loaded, so anything older opened as a blank form, and saving it replaced the real day with blanks.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { historyLogs: _unused, canReview = false, startWeek = null, ...rest } = props;
  const router = useRouter();
  const currentStart = rest.weekDates[0];
  const [offset, setOffset] = useState(() =>
    startWeek ? Math.round((new Date(startWeek).getTime() - new Date(currentStart).getTime()) / (7 * 86400000)) : 0
  );
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const weekStart = toIsoDate(addDays(new Date(currentStart + 'T00:00:00Z'), offset * 7));
  const dates = Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), i)));
  const todayIso = todayIsoInTz(rest.profile?.timezone ?? DEFAULT_TIMEZONE);
  const previousWeekStart = toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), -7));
  // A member can look back 30 days; a coach is not limited. Older weeks are still in the coach's records.
  const canGoBack = rest.isCoachView || canBrowseWeek(previousWeekStart, todayIso);

  // This week arrives with the page; any other week is read from the database when it is opened.
  const [fetched, setFetched] = useState<{ weekStart: string; logs: DailyLogRow[] | null } | null>(null);
  const [tryAgain, setTryAgain] = useState(0);
  useEffect(() => {
    if (offset === 0) return;
    let live = true;
    getDailyLogs(rest.clientId, dates[0], dates[6])
      .then((rows) => {
        if (live) setFetched({ weekStart, logs: rows });
      })
      .catch(() => {
        if (live) setFetched({ weekStart, logs: null });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, weekStart, rest.clientId, tryAgain]);
  const logs: DailyLogRow[] | null | 'loading' = offset === 0 ? rest.initialLogs : fetched?.weekStart === weekStart ? fetched.logs : 'loading';

  // Saving no longer reloads the whole dashboard after every change; it does so once, when the member leaves this screen, so the other
  // screens (Home, Insights) catch up.
  const savedSomething = useRef(false);
  useEffect(
    () => () => {
      if (savedSomething.current) router.refresh();
    },
    [router]
  );

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
          disabled={!canGoBack}
          onClick={() => setOffset(offset - 1)}
          className="rounded-full p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
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

      {/* Whether this week has been looked at, up top. Reviewing it happens at the bottom, after the coach has read the week. */}
      {rest.isCoachView && canReview && reviewed.has(weekStart) && (
        <div className="flex items-center justify-between gap-2 rounded-full bg-success/15 px-4 py-2 text-sm font-bold text-success">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Week reviewed
          </span>
          <button type="button" disabled={busy} onClick={toggleReviewed} className="min-h-8 px-1 text-xs font-bold underline disabled:opacity-60">
            Undo
          </button>
        </div>
      )}

      {logs === 'loading' ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading this week…</p>
      ) : logs === null ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          <p>We could not load this week.</p>
          <button type="button" onClick={() => { setFetched(null); setTryAgain((n) => n + 1); }} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground">
            Try again
          </button>
        </div>
      ) : (
        <>
          <WeekLog
            key={weekStart}
            {...rest}
            weekDates={dates}
            initialLogs={logs}
            onSaved={() => {
              savedSomething.current = true;
            }}
          />
          {rest.isCoachView && canReview && (
            <CheckinReply
              key={`reply-${weekStart}`}
              clientId={rest.clientId}
              memberName={rest.profile?.name ?? null}
              weekStart={weekStart}
              reviewed={reviewed.has(weekStart)}
              onReviewed={() => setReviewed((prev) => new Set(prev).add(weekStart))}
            />
          )}
          {rest.isCoachView && canReview && reviewed.has(weekStart) && <NextCheckin key={`next-${weekStart}`} clientId={rest.clientId} weekStart={weekStart} />}
        </>
      )}
    </div>
  );
}

// Once a week is reviewed, the next one on the dashboard's list, so the coach can work through them without going back each time
// (UX6). Only when the coach came from that list: the order is kept for this browser tab (lib/checkinQueue.ts). Shown after the week
// has loaded, so it is never rendered on the server.
function NextCheckin({ clientId, weekStart }: { clientId: string; weekStart: string }) {
  const [queued] = useState(() => ({ next: nextQueuedCheckin(clientId, weekStart), onList: isQueuedCheckin(clientId, weekStart) }));
  if (queued.next) {
    return (
      <Link href={queued.next.href} className={`${cardCls} flex items-center gap-3`}>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-accent">Next check-in</span>
          <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{queued.next.name}</span>
          <span className="block truncate text-xs text-zinc-500">{queued.next.hint}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-accent" />
      </Link>
    );
  }
  if (queued.onList) {
    return (
      <Link href="/coach" className="block px-1 text-sm font-bold text-accent">
        That was the last check-in on your list. Back to the dashboard
      </Link>
    );
  }
  return null;
}

// The end of a coach's read-through of a week: write back to the member (it goes into their chat, headed with the week) and mark the
// week reviewed in one go, or just mark it reviewed. Only shown once the week has loaded, so nothing is marked before it was read.
function CheckinReply({
  clientId,
  memberName,
  weekStart,
  reviewed,
  onReviewed,
}: {
  clientId: string;
  memberName: string | null;
  weekStart: string;
  reviewed: boolean;
  onReviewed: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const firstName = memberName?.trim().split(/\s+/)[0] || 'them';
  const max = checkinReplyMax(weekStart);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await sendMessage(clientId, checkinReplyText(weekStart, body));
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error && err.message ? err.message : 'Could not send that. Please try again.');
      return;
    }
    setText('');
    if (reviewed) {
      setBusy(false);
      toast.success(`Sent to ${firstName}`);
      return;
    }
    const res = await markReviewed('week', clientId, weekStart);
    setBusy(false);
    if (res.ok) {
      onReviewed();
      toast.success(`Sent to ${firstName} and marked reviewed`);
    } else {
      toast.error(`Sent to ${firstName}, but the week could not be marked reviewed. Please try again.`);
    }
  }

  async function markOnly() {
    setBusy(true);
    const res = await markReviewed('week', clientId, weekStart);
    setBusy(false);
    if (res.ok) {
      onReviewed();
      toast.success('Marked as reviewed');
    } else {
      toast.error(res.error ?? 'Could not mark that as reviewed');
    }
  }

  return (
    <div className={cardCls}>
      <h4 className="text-sm font-bold text-black dark:text-zinc-50">{reviewed ? `Message ${firstName} about this week` : `Reply to ${firstName}`}</h4>
      <p className="mt-0.5 text-xs text-zinc-500">
        Goes to their chat, headed &ldquo;{checkinReplyHeading(weekStart)}&rdquo;{reviewed ? '.' : ', and marks the week reviewed.'}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={max}
        rows={4}
        aria-label={`Reply to ${firstName} about the week of ${weekLabel(weekStart)}`}
        placeholder="What went well, what to focus on next week"
        className="mt-3 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || text.trim() === ''}
          onClick={send}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Sending…' : reviewed ? 'Send' : 'Send and mark reviewed'}
        </button>
        {!reviewed && (
          <button type="button" disabled={busy} onClick={markOnly} className="rounded-full px-3 py-2.5 text-sm font-bold text-zinc-600 disabled:opacity-50 dark:text-zinc-300">
            Mark reviewed without a reply
          </button>
        )}
      </div>
    </div>
  );
}

import { dayCaloriesOf, hasFoodLogged } from './dailyLog';
import type { DailyLogRow } from '../data/types';
import type { TrackerMetric, TrafficLight } from './accountability';
import { addDays, startOfWeek, toIsoDate, weekDates } from './dates';

// The daily check-in (the web's "Weekly Log"): the rules for the sleep / steps / water trackers, which week is on show
// and the week's averages. The screen only draws them. Same behaviour as the web's AccountabilityTracker and WeekLog.

export type TrackerConfig = {
  label: string;
  unit: string;
  min: number; // slider-style range the +/- buttons stay inside
  max: number;
  step: number;
  typedMax: number; // the most a typed figure may be
  stepHint: string;
  bands: [TrafficLight, string][];
};

export const TRACKER_CONFIG: Record<TrackerMetric, TrackerConfig> = {
  sleep: { label: 'Sleep', unit: 'hrs', min: 0, max: 12, step: 0.5, typedMax: 24, stepHint: '±0.5 hr steps', bands: [['green', '7.5h+'], ['amber', '6–7.5h'], ['red', '<6h']] },
  steps: { label: 'Steps', unit: 'steps', min: 0, max: 20000, step: 500, typedMax: 100000, stepHint: '±500 step increments', bands: [['green', '8k+'], ['amber', '4k–8k'], ['red', '<4k']] },
  water: { label: 'Water', unit: 'L', min: 0, max: 5, step: 0.25, typedMax: 10, stepHint: '±0.25L steps', bands: [['green', '2.5L+'], ['amber', '1–2.5L'], ['red', '<1L']] },
};

// What the database accepts for the figures a member types (migration 0111 enforces the same ranges).
export const LOG_LIMITS = {
  sleep: { min: 0, max: 24 },
  steps: { min: 0, max: 100000 },
  water: { min: 0, max: 15 },
  bodyweight: { min: 20, max: 400 },
  notesMax: 1000,
} as const;

export const SCALE_FIELDS = [
  { key: 'hunger', label: 'Hunger' },
  { key: 'energy', label: 'Energy' },
  { key: 'motivation', label: 'Motivation' },
  { key: 'stress', label: 'Stress' },
] as const;

export type WaterUnit = 'L' | 'mL';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// One press of the + or - button.
export function nudgeValue(metric: TrackerMetric, current: number | null, dir: 1 | -1): number {
  const cfg = TRACKER_CONFIG[metric];
  return clamp(+((current ?? 0) + dir * cfg.step).toFixed(2), cfg.min, cfg.max);
}

// A figure typed into the box. Commas are ignored, water may be typed in millilitres, the result is kept inside sensible
// limits. null means "leave it as it was" (empty, not a number, negative).
export function parseTrackerInput(metric: TrackerMetric, text: string, waterUnit: WaterUnit = 'L'): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const typed = Number(cleaned);
  if (!Number.isFinite(typed) || typed < 0) return null;
  const inLitres = metric === 'water' && waterUnit === 'mL' ? typed / 1000 : typed;
  const next = clamp(inLitres, 0, TRACKER_CONFIG[metric].typedMax);
  return metric === 'steps' ? Math.round(next) : +next.toFixed(2);
}

// The big figure on a tracker card.
export function formatTrackerValue(metric: TrackerMetric, value: number, waterUnit: WaterUnit = 'L'): string {
  if (metric === 'sleep') return value.toFixed(1);
  if (metric === 'steps') return Math.round(value).toLocaleString('en-GB');
  return waterUnit === 'L' ? value.toFixed(2) : String(Math.round(value * 1000));
}

// The same figure as plain text for editing (no thousands separators).
export function editableTrackerValue(metric: TrackerMetric, value: number, waterUnit: WaterUnit = 'L'): string {
  return metric === 'water' && waterUnit === 'mL' ? String(Math.round(value * 1000)) : String(value);
}

// ---- weeks ----

const at = (iso: string) => new Date(iso + 'T00:00:00Z');

// The Monday of the week containing a date.
export function weekStartOf(dateIso: string): string {
  return toIsoDate(startOfWeek(at(dateIso)));
}

export function datesOfWeek(weekStartIso: string): string[] {
  return weekDates(at(weekStartIso));
}

export function shiftWeek(weekStartIso: string, weeks: number): string {
  return toIsoDate(addDays(at(weekStartIso), weeks * 7));
}

// Whole weeks from the current week to the one shown: 0 this week, -1 last week, ...
export function weekOffset(currentWeekStart: string, shownWeekStart: string): number {
  return Math.round((at(shownWeekStart).getTime() - at(currentWeekStart).getTime()) / (7 * 86400000));
}

// ---- week averages ----

type DayFigures = Pick<DailyLogRow, 'calories' | 'protein' | 'carbs' | 'fat' | 'steps' | 'bodyweight'>;

export const dayHasFood = (d: Pick<DailyLogRow, 'calories' | 'protein' | 'carbs' | 'fat'>) => hasFoodLogged(d);

const avg = (vals: (number | null)[]): number | null => {
  const present = vals.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, v) => a + v, 0) / present.length : null;
};

// Each average only counts the days that have that figure: a day with food but no steps must not drag the steps average down.
export function weekAverages(days: DayFigures[]) {
  const foodDays = days.filter(dayHasFood);
  return {
    foodDays: foodDays.length,
    calories: avg(foodDays.map(dayCaloriesOf)),
    protein: avg(foodDays.map((d) => d.protein)),
    carbs: avg(foodDays.map((d) => d.carbs)),
    fat: avg(foodDays.map((d) => d.fat)),
    steps: avg(days.map((d) => d.steps)),
    bodyweight: avg(days.map((d) => d.bodyweight)),
  };
}

// ---- one day's edits ----

export type DayPatch = Partial<Pick<DailyLogRow, 'sleep' | 'steps' | 'water' | 'bodyweight' | 'gym_session' | 'hunger' | 'energy' | 'motivation' | 'stress' | 'period_started' | 'notes'>>;

// Why a day's edit cannot be saved, or null when it is fine.
export function validateDayPatch(patch: DayPatch): string | null {
  const { sleep, steps, water, bodyweight, notes } = patch;
  if (sleep != null && !(sleep >= LOG_LIMITS.sleep.min && sleep <= LOG_LIMITS.sleep.max)) return 'Sleep should be between 0 and 24 hours.';
  if (steps != null && !(steps >= LOG_LIMITS.steps.min && steps <= LOG_LIMITS.steps.max)) return 'Steps should be between 0 and 100,000.';
  if (water != null && !(water >= LOG_LIMITS.water.min && water <= LOG_LIMITS.water.max)) return 'Water should be between 0 and 15 litres.';
  if (bodyweight != null && !(bodyweight >= LOG_LIMITS.bodyweight.min && bodyweight <= LOG_LIMITS.bodyweight.max)) return 'Bodyweight should be between 20 and 400 kg.';
  if (notes != null && notes.length > LOG_LIMITS.notesMax) return `Notes can be up to ${LOG_LIMITS.notesMax} characters.`;
  for (const k of ['hunger', 'energy', 'motivation', 'stress'] as const) {
    const v = patch[k];
    if (v != null && !(Number.isInteger(v) && v >= 1 && v <= 5)) return 'The scales go from 1 to 5.';
  }
  return null;
}

// A day with nothing logged yet, used to show a saved edit straight away on a day that has no row.
export function blankDailyLog(clientId: string, date: string): DailyLogRow {
  return {
    id: 'pending',
    client_id: clientId,
    log_date: date,
    protein: null,
    carbs: null,
    fat: null,
    fibre: null,
    water: null,
    bodyweight: null,
    steps: null,
    sleep: null,
    gym_session: false,
    day_type: 'flat',
    hunger: null,
    energy: null,
    motivation: null,
    stress: null,
    period_started: false,
    notes: null,
    calories: null,
  };
}

// The day's row with an edit applied.
export function applyDayPatch(row: DailyLogRow, patch: DayPatch): DailyLogRow {
  return { ...row, ...patch };
}

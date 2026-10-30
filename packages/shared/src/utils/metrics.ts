// The maths behind the Metrics charts (Progress > Metrics): daily points, a 7-day average, weekly averages and the range summary.
// The web keeps the same rules in lib/utils/metrics.ts.
import type { DailyLogRow } from '../data/types';
import { dayCaloriesOf, hasFoodLogged } from './dailyLog';
import { isoWeekKey } from './dates';

export type MetricKey = 'bodyweight' | 'calories' | 'protein' | 'steps' | 'sleep' | 'water' | 'hunger' | 'energy' | 'motivation' | 'stress' | 'sessions' | 'foodDays';

export interface MetricInfo {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
  // Which direction is "better", for colouring the change. Undefined: neither is inherently good or bad.
  better?: 'down' | 'up';
  // A count of days in each week (sessions, days with food logged) rather than a daily figure: shown by week only, as a total.
  weeklyTotal?: boolean;
}

export const METRICS: MetricInfo[] = [
  { key: 'bodyweight', label: 'Weight', unit: 'kg', digits: 1, better: 'down' },
  { key: 'calories', label: 'Calories', unit: 'kcal', digits: 0 },
  { key: 'protein', label: 'Protein', unit: 'g', digits: 0, better: 'up' },
  { key: 'steps', label: 'Steps', unit: '', digits: 0, better: 'up' },
  { key: 'sleep', label: 'Sleep', unit: 'h', digits: 1, better: 'up' },
  { key: 'water', label: 'Water', unit: 'L', digits: 1, better: 'up' },
  // The 1 to 5 check-in scales.
  { key: 'hunger', label: 'Hunger', unit: '', digits: 1 },
  { key: 'energy', label: 'Energy', unit: '', digits: 1, better: 'up' },
  { key: 'motivation', label: 'Motivation', unit: '', digits: 1, better: 'up' },
  { key: 'stress', label: 'Stress', unit: '', digits: 1, better: 'down' },
  { key: 'sessions', label: 'Sessions per week', unit: '', digits: 0, better: 'up', weeklyTotal: true },
  { key: 'foodDays', label: 'Days with food logged', unit: '', digits: 0, better: 'up', weeklyTotal: true },
];

export type RangeKey = '4w' | '12w' | '6m' | 'all';

// `days` is null for "everything the member has logged".
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '4w', label: '4 weeks', days: 28 },
  { key: '12w', label: '12 weeks', days: 84 },
  { key: '6m', label: '6 months', days: 182 },
  { key: 'all', label: 'All', days: null },
];

// The days the dashboard and the phone's recent-days fetch already carry; a longer range needs one more read.
export const LOADED_HISTORY_DAYS = 84;

export interface DayPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
const isoOf = (dayNo: number) => new Date(dayNo * DAY_MS).toISOString().slice(0, 10);

// The first day a range covers (counting back from `today`), or null for all of it.
export function rangeStart(today: string, range: RangeKey): string | null {
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  return days == null ? null : isoOf(dayNumber(today) - days + 1);
}

// Whether the days already loaded cover this range, or more history has to be read.
export function needsMoreHistory(range: RangeKey): boolean {
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  return days == null || days > LOADED_HISTORY_DAYS;
}

export function metricValue(log: DailyLogRow, key: MetricKey): number | null {
  switch (key) {
    case 'bodyweight':
      return log.bodyweight != null && log.bodyweight > 0 ? log.bodyweight : null;
    case 'steps':
      return log.steps;
    case 'sleep':
      return log.sleep;
    case 'water':
      return log.water;
    case 'hunger':
    case 'energy':
    case 'motivation':
    case 'stress':
      return log[key];
    // One for each day that counts, summed by week (weeklyTotals).
    case 'sessions':
      return log.gym_session ? 1 : null;
    case 'foodDays':
      return hasFoodLogged(log) ? 1 : null;
    case 'protein':
      return log.protein;
    case 'calories':
      // A day with no food on it has no calories, rather than zero (a blank row only holds other check-in answers).
      return hasFoodLogged(log) ? dayCaloriesOf(log) : null;
  }
}

// One metric's logged days in date order, from `from` (inclusive; null = all) to `to` (inclusive).
export function dailyPoints(logs: DailyLogRow[], key: MetricKey, from: string | null, to: string): DayPoint[] {
  return logs
    .filter((l) => (from == null || l.log_date >= from) && l.log_date <= to)
    .map((l) => ({ date: l.log_date, value: metricValue(l, key) }))
    .filter((p): p is DayPoint => p.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Each point averaged with the logged days in the `windowDays` days up to and including it (7 by default): the smooth line
// through a noisy daily figure such as bodyweight.
export function movingAverage(points: DayPoint[], windowDays = 7): DayPoint[] {
  return points.map((p, i) => {
    const end = dayNumber(p.date);
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0 && dayNumber(points[j].date) > end - windowDays; j--) {
      sum += points[j].value;
      count++;
    }
    return { date: p.date, value: sum / count };
  });
}

// The daily points averaged by calendar week (Monday to Sunday), dated by the Monday.
export function weeklyAverages(points: DayPoint[]): DayPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    const week = isoWeekKey(p.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), p.value]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, value: values.reduce((a, b) => a + b, 0) / values.length }));
}

// The daily points added up by calendar week (Monday to Sunday), dated by the Monday: sessions and days with food logged per week. Weeks with
// none are left out, like a week of averages with no readings. The first and the current week may be part weeks.
export function weeklyTotals(points: DayPoint[]): DayPoint[] {
  const byWeek = new Map<string, number>();
  for (const p of points) {
    const week = isoWeekKey(p.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + p.value);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export interface StreakStats {
  // Consecutive days logged, counting back from today (or from yesterday while today is still empty).
  current: number;
  // The longest run of consecutive logged days.
  best: number;
}

export function streakStats(loggedDates: string[], today: string): StreakStats {
  const days = [...new Set(loggedDates)].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const have = new Set(days);
  let cursor = have.has(dayNumber(today)) ? dayNumber(today) : dayNumber(today) - 1;
  let current = 0;
  while (have.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, best };
}

export interface MetricSummary {
  count: number;
  latest: number | null;
  // Latest against the first reading in the range.
  change: number | null;
  average: number | null;
  min: number | null;
  max: number | null;
  // Whether the change is in the better direction; null when the metric has none or nothing changed.
  favourable: boolean | null;
}

export function summarize(points: DayPoint[], better?: 'down' | 'up'): MetricSummary {
  if (points.length === 0) return { count: 0, latest: null, change: null, average: null, min: null, max: null, favourable: null };
  const values = points.map((p) => p.value);
  const latest = values[values.length - 1];
  const change = points.length > 1 ? latest - values[0] : null;
  return {
    count: points.length,
    latest,
    change,
    average: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    favourable: change == null || change === 0 || !better ? null : better === 'down' ? change < 0 : change > 0,
  };
}

export function formatMetricValue(value: number, info: Pick<MetricInfo, 'digits' | 'unit'>): string {
  const n = info.digits === 0 ? Math.round(value).toLocaleString('en-GB') : value.toFixed(info.digits);
  return info.unit ? `${n}${info.unit === 'kcal' || info.unit === 'g' ? ' ' : ''}${info.unit}` : n;
}

// The y-range of a chart: the data and the target line (so it is always on the chart) with a little room above and below.
export function chartDomain(values: number[], target?: number | null): { min: number; max: number } {
  const all = target != null ? [...values, target] : values;
  if (all.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  return { min: lo - pad, max: hi + pad };
}

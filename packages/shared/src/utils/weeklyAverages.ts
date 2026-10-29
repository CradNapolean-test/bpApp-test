import { isoWeekKey } from './dates';
import { dayCaloriesOf, hasFoodLogged, hasLoggedData } from './dailyLog';
import type { DailyLogRow } from '../data/types';

// Weekly averages for the Overview tabs. A week is Monday to Sunday; only days with something logged count,
// and each metric averages only the days where that metric has a value (a day with weight but no steps does
// not drag the steps average down).

export type WeeklyMetric = 'bodyweight' | 'calories' | 'protein' | 'steps' | 'sleep' | 'water';

export interface WeeklyMetricInfo {
  key: WeeklyMetric;
  tab: string; // short label on the tab
  title: string;
  unit: string;
  digits: number;
  // Which direction is "better", for colouring the change. Undefined = neither is inherently good or bad.
  better?: 'down' | 'up';
}

export const WEEKLY_METRICS: WeeklyMetricInfo[] = [
  { key: 'bodyweight', tab: 'Weight', title: 'Bodyweight', unit: 'kg', digits: 1, better: 'down' },
  { key: 'calories', tab: 'Calories', title: 'Calories', unit: 'kcal', digits: 0 },
  { key: 'protein', tab: 'Protein', title: 'Protein', unit: 'g', digits: 0, better: 'up' },
  { key: 'steps', tab: 'Steps', title: 'Steps', unit: '', digits: 0, better: 'up' },
  { key: 'sleep', tab: 'Sleep', title: 'Sleep', unit: 'h', digits: 1, better: 'up' },
  { key: 'water', tab: 'Water', title: 'Water', unit: 'L', digits: 1, better: 'up' },
];

export interface WeekAverages {
  weekStart: string;
  loggedDays: number;
  avg: Record<WeeklyMetric, number | null>;
  // Days that contributed to each average.
  days: Record<WeeklyMetric, number>;
}

function valueOf(log: DailyLogRow, metric: WeeklyMetric): number | null {
  switch (metric) {
    case 'bodyweight': return log.bodyweight;
    case 'steps': return log.steps;
    case 'sleep': return log.sleep;
    case 'water': return log.water;
    case 'protein': return log.protein;
    case 'calories':
      return hasFoodLogged(log) ? dayCaloriesOf(log) : null;
  }
}

export function buildWeeklyAverages(logs: DailyLogRow[]): WeekAverages[] {
  const byWeek = new Map<string, DailyLogRow[]>();
  for (const log of logs.filter(hasLoggedData)) {
    const week = isoWeekKey(log.log_date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), log]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekLogs]) => {
      const avg = {} as Record<WeeklyMetric, number | null>;
      const days = {} as Record<WeeklyMetric, number>;
      for (const { key } of WEEKLY_METRICS) {
        const vals = weekLogs.map((l) => valueOf(l, key)).filter((v): v is number => v != null);
        days[key] = vals.length;
        avg[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }
      return { weekStart, loggedDays: weekLogs.length, avg, days };
    });
}

// The change from the previous week that has a value for this metric (skipping weeks with none), or null.
export function weekChange(weeks: WeekAverages[], metric: WeeklyMetric): number | null {
  const withValue = weeks.filter((w) => w.avg[metric] != null);
  if (withValue.length < 2) return null;
  return (withValue[withValue.length - 1].avg[metric] as number) - (withValue[withValue.length - 2].avg[metric] as number);
}

export function formatMetric(value: number, info: WeeklyMetricInfo): string {
  return info.digits === 0 ? Math.round(value).toLocaleString('en-GB') : value.toFixed(info.digits);
}

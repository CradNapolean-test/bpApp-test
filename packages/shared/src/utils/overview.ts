import { dayCaloriesOf, hasFoodLogged } from './dailyLog';
import type { DailyLogRow } from '../data/types';
import { hasLoggedData } from './dailyLog';
import { isoWeekKey } from './dates';
import { shortDate } from './progress';

// Weekly averages of what the member logged: the Overview's trend lines. Same arithmetic as the web Overview tab.
export interface WeekPoint {
  weekStart: string;
  avgBodyweight: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  avgSteps: number | null;
  avgSleep: number | null;
  avgWater: number | null;
  loggedDays: number;
}

export const OVERVIEW_WEEKS = 8;

// Oldest week first. Days with nothing logged (a blank row that only holds food-diary entries) do not count.
export function buildWeeklyTrend(logs: DailyLogRow[]): WeekPoint[] {
  const byWeek = new Map<string, DailyLogRow[]>();
  for (const log of logs.filter(hasLoggedData)) {
    const week = isoWeekKey(log.log_date);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(log);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, weekLogs]) => {
      // A day counts for the calorie average when it has food on it, including a Quick Add of calories with no macros (R11).
      const withFood = weekLogs.filter(hasFoodLogged);
      return {
        weekStart,
        avgBodyweight: avg(weekLogs.filter((l) => l.bodyweight != null).map((l) => l.bodyweight as number)),
        avgCalories: avg(withFood.map(dayCaloriesOf)),
        // Each average counts only the days that have that figure: a day with food but no steps must not drag the steps average down.
        avgProtein: avg(weekLogs.filter((l) => l.protein != null).map((l) => l.protein as number)),
        avgSteps: avg(weekLogs.filter((l) => l.steps != null).map((l) => l.steps as number)),
        avgSleep: avg(weekLogs.filter((l) => l.sleep != null).map((l) => l.sleep as number)),
        avgWater: avg(weekLogs.filter((l) => l.water != null).map((l) => l.water as number)),
        loggedDays: weekLogs.length,
      };
    });
}

export type TrendKey = 'avgBodyweight' | 'avgCalories' | 'avgProtein' | 'avgSteps' | 'avgSleep' | 'avgWater';

export interface TrendSummary {
  points: number[];
  labels: string[];
  current: number | null;
  delta: number | null; // the latest week against the one before, when both exist and differ
  favourable: boolean | null; // only for a measure that has a better direction (bodyweight, in a fat-loss app)
}

export function trendSummary(weeks: WeekPoint[], key: TrendKey, lowerIsBetter?: boolean): TrendSummary {
  const withValue = weeks.filter((w) => w[key] != null);
  const points = withValue.map((w) => w[key] as number);
  const current = points.length ? points[points.length - 1] : null;
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const raw = current != null && prev != null ? current - prev : null;
  const delta = raw != null && Math.abs(raw) > 0.001 ? raw : null;
  return {
    points,
    labels: withValue.map((w) => shortDate(w.weekStart)),
    current,
    delta,
    favourable: lowerIsBetter != null && delta != null ? (lowerIsBetter ? delta < 0 : delta > 0) : null,
  };
}

export function latestBodyweight(logs: DailyLogRow[]): number | null {
  return [...logs].reverse().find((l) => l.bodyweight != null)?.bodyweight ?? null;
}

export interface WeightGoal {
  start: number;
  goal: number;
  now: number | null; // the latest logged weight
  pct: number;
  toGo: number; // kg still to go (0 once the goal is reached or passed)
}

// Start -> now -> goal for bodyweight, from the profile's start/goal weights and the latest logged weight.
export function weightGoal(profile: { start_weight: number | null; goal_weight: number | null } | null, latest: number | null): WeightGoal | null {
  const start = profile?.start_weight ?? null;
  const goal = profile?.goal_weight ?? null;
  if (start == null || goal == null || start === goal) return null;
  const now = latest ?? start;
  const total = Math.abs(start - goal);
  const done = Math.max(0, Math.min(total, (start - now) * (start > goal ? 1 : -1)));
  const toGo = Math.max(0, Math.abs(now - goal) * ((now - goal) * (start - goal) > 0 ? 1 : 0));
  return { start, goal, now: latest, pct: Math.round((done / total) * 100), toGo };
}

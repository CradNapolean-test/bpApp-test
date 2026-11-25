// The coach's Overview of one member (DB11): energy, stress and hunger from the daily check-in over the last four weeks, as one
// average a week (Monday to Sunday, this week so far included), oldest first. Pure, so the weeks and the figures can be tested.
import { addDays, isoWeekKey, toIsoDate } from './utils/dates';

export type CheckinScale = 'energy' | 'stress' | 'hunger';

export const CHECKIN_SCALES: { key: CheckinScale; label: string; better: 'up' | 'down' | null }[] = [
  { key: 'energy', label: 'Energy', better: 'up' },
  { key: 'stress', label: 'Stress', better: 'down' },
  // Neither more nor less hunger is good in itself: it is read against what the member is eating.
  { key: 'hunger', label: 'Hunger', better: null },
];

export const TREND_WEEKS = 4;

export interface ScaleWeek {
  weekStart: string;
  // The week's average score (1 to 5), or null when nothing was scored that week.
  avg: number | null;
  days: number;
}

export interface ScaleTrend {
  key: CheckinScale;
  weeks: ScaleWeek[];
  // The newest week with a score, and that week's Monday.
  latest: number | null;
  latestWeek: string | null;
  // The newest week's average less the oldest one's, when at least two of the weeks were scored; otherwise null.
  change: number | null;
  // Days scored across the weeks.
  days: number;
}

type ScaleLog = { log_date: string } & Partial<Record<CheckinScale, number | null>>;

// The Mondays of the last `weeks` weeks, oldest first, ending with the week `todayIso` is in.
export function trendWeekStarts(todayIso: string, weeks = TREND_WEEKS): string[] {
  const thisWeek = isoWeekKey(todayIso);
  return Array.from({ length: weeks }, (_, i) => toIsoDate(addDays(new Date(thisWeek + 'T00:00:00Z'), -7 * (weeks - 1 - i))));
}

export function scaleTrend(logs: ScaleLog[], key: CheckinScale, todayIso: string, weeks = TREND_WEEKS): ScaleTrend {
  const starts = trendWeekStarts(todayIso, weeks);
  const out: ScaleWeek[] = starts.map((weekStart) => {
    const end = toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), 6));
    // Nothing after today counts (a day logged ahead is not a score yet).
    const values = logs
      .filter((l) => l.log_date >= weekStart && l.log_date <= end && l.log_date <= todayIso)
      .map((l) => l[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return { weekStart, avg: values.length ? values.reduce((a, v) => a + v, 0) / values.length : null, days: values.length };
  });
  const scored = out.filter((w) => w.avg != null);
  const newest = scored.at(-1) ?? null;
  const oldest = scored[0] ?? null;
  return {
    key,
    weeks: out,
    latest: newest?.avg ?? null,
    latestWeek: newest?.weekStart ?? null,
    change: newest && oldest && newest !== oldest ? (newest.avg as number) - (oldest.avg as number) : null,
    days: out.reduce((n, w) => n + w.days, 0),
  };
}

export function checkinScaleTrends(logs: ScaleLog[], todayIso: string, weeks = TREND_WEEKS): ScaleTrend[] {
  return CHECKIN_SCALES.map((s) => scaleTrend(logs, s.key, todayIso, weeks));
}

// How a change reads for the coach: good or bad by which way is better for that scale, 'neutral' for a scale where neither is (hunger),
// 'flat' for a change under a tenth of a point, null when there is nothing to compare.
export function trendTone(key: CheckinScale, change: number | null): 'good' | 'bad' | 'neutral' | 'flat' | null {
  if (change == null) return null;
  if (Math.abs(change) < 0.1) return 'flat';
  const better = CHECKIN_SCALES.find((s) => s.key === key)?.better ?? null;
  if (better == null) return 'neutral';
  return (better === 'up') === change > 0 ? 'good' : 'bad';
}

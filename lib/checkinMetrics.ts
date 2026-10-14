// The daily check-in measures a coach can switch on or off for each member (client_disabled_metrics, 0121).
// Bodyweight, food, gym session and period tracking are not part of this list.

export type CheckinMetric = 'sleep' | 'steps' | 'water' | 'hunger' | 'energy' | 'motivation' | 'stress';

export interface CheckinMetricInfo {
  key: CheckinMetric;
  label: string;
  kind: 'tracker' | 'rating'; // tracker = a number (hours, steps, litres); rating = 1-5
  unit: string;
}

export const CHECKIN_METRICS: CheckinMetricInfo[] = [
  { key: 'sleep', label: 'Sleep', kind: 'tracker', unit: 'h' },
  { key: 'steps', label: 'Steps', kind: 'tracker', unit: '' },
  { key: 'water', label: 'Water', kind: 'tracker', unit: 'L' },
  { key: 'hunger', label: 'Hunger', kind: 'rating', unit: '/5' },
  { key: 'energy', label: 'Energy', kind: 'rating', unit: '/5' },
  { key: 'motivation', label: 'Motivation', kind: 'rating', unit: '/5' },
  { key: 'stress', label: 'Stress', kind: 'rating', unit: '/5' },
];

const KEYS = new Set<string>(CHECKIN_METRICS.map((m) => m.key));

// The set of metrics switched off, from raw database strings (unknown values are ignored).
export function toDisabledMetricSet(raw: string[]): Set<CheckinMetric> {
  return new Set(raw.filter((k): k is CheckinMetric => KEYS.has(k)));
}

export const isMetricOn = (disabled: Set<CheckinMetric>, key: CheckinMetric): boolean => !disabled.has(key);

// How many of the three trackers (sleep, steps, water) are switched on, for the "x of 3" check-in count.
export const enabledTrackers = (disabled: Set<CheckinMetric>): CheckinMetric[] =>
  CHECKIN_METRICS.filter((m) => m.kind === 'tracker' && !disabled.has(m.key)).map((m) => m.key);

export interface MetricWeekStats {
  key: CheckinMetric;
  label: string;
  unit: string;
  days: number; // days with a value
  avg: number | null;
  low: { value: number; date: string } | null; // the lowest day (first one if tied)
  high: { value: number; date: string } | null; // the highest day (first one if tied)
}

// Average, low and high for each switched-on measure across a week of logs.
export function weekStats(
  days: { date: string; values: Partial<Record<CheckinMetric, number | null>> }[],
  disabled: Set<CheckinMetric>
): MetricWeekStats[] {
  return CHECKIN_METRICS.filter((m) => !disabled.has(m.key)).map((m) => {
    const present = days
      .map((d) => ({ date: d.date, value: d.values[m.key] }))
      .filter((d): d is { date: string; value: number } => d.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (present.length === 0) return { key: m.key, label: m.label, unit: m.unit, days: 0, avg: null, low: null, high: null };
    let low = present[0];
    let high = present[0];
    for (const p of present) {
      if (p.value < low.value) low = p;
      if (p.value > high.value) high = p;
    }
    return { key: m.key, label: m.label, unit: m.unit, days: present.length, avg: present.reduce((s, p) => s + p.value, 0) / present.length, low, high };
  });
}

import { describe, expect, it } from 'vitest';
import { buildWeeklyAverages, formatMetric, weekChange, WEEKLY_METRICS } from './weeklyAverages';

const log = (log_date: string, f: Record<string, number | null> = {}) =>
  ({ log_date, protein: null, carbs: null, fat: null, fibre: null, water: null, bodyweight: null, steps: null, sleep: null, gym_session: false, hunger: null, energy: null, motivation: null, stress: null, period_started: false, notes: null, ...f }) as never;

describe('buildWeeklyAverages', () => {
  it('averages per Monday-start week and only over days that have the metric', () => {
    const w = buildWeeklyAverages([
      log('2026-10-12', { bodyweight: 90, steps: 10000, protein: 150, carbs: 200, fat: 60 }),
      log('2026-10-13', { bodyweight: 89, sleep: 7 }),
      log('2026-10-14', { steps: 6000 }),
      log('2026-10-19', { bodyweight: 88 }),
    ]);
    expect(w.map((x) => x.weekStart)).toEqual(['2026-10-12', '2026-10-19']);
    expect(w[0].loggedDays).toBe(3);
    expect(w[0].avg.bodyweight).toBe(89.5);
    expect(w[0].avg.steps).toBe(8000);
    expect(w[0].days.steps).toBe(2);
    expect(w[0].avg.sleep).toBe(7);
    expect(w[0].avg.water).toBeNull();
    expect(w[0].avg.protein).toBe(150);
    expect(w[0].avg.calories).toBe(150 * 4 + 200 * 4 + 60 * 9);
  });
  it('ignores blank rows (nothing logged)', () => {
    expect(buildWeeklyAverages([log('2026-10-12')])).toEqual([]);
  });
});

describe('weekChange', () => {
  it('compares the last two weeks that have a value, skipping gaps', () => {
    const w = buildWeeklyAverages([log('2026-10-05', { bodyweight: 90 }), log('2026-10-12', { steps: 5000 }), log('2026-10-19', { bodyweight: 88 })]);
    expect(weekChange(w, 'bodyweight')).toBe(-2);
    expect(weekChange(w, 'steps')).toBeNull();
  });
});

describe('formatMetric', () => {
  it('rounds by the metric', () => {
    const info = (k: string) => WEEKLY_METRICS.find((m) => m.key === k)!;
    expect(formatMetric(89.46, info('bodyweight'))).toBe('89.5');
    expect(formatMetric(8123.4, info('steps'))).toBe('8,123');
  });
});

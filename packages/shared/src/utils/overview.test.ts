import { describe, expect, it } from 'vitest';

import type { DailyLogRow } from '../data/types';
import { buildWeeklyTrend, latestBodyweight, trendSummary, weightGoal } from './overview';
import { shortDate } from './progress';

const log = (date: string, v: Partial<DailyLogRow> = {}): DailyLogRow => ({
  id: date, client_id: 'c', log_date: date, protein: null, carbs: null, fat: null, fibre: null, water: null, bodyweight: null, steps: null,
  sleep: null, gym_session: false, day_type: 'flat', hunger: null, energy: null, motivation: null, stress: null, period_started: false, notes: null, calories: null, ...v,
});

// Weeks start on Monday: 2026-09-28 and 2026-10-05 are Mondays.
describe('buildWeeklyTrend', () => {
  const logs = [
    log('2026-09-28', { bodyweight: 80, steps: 8000, protein: 100, carbs: 200, fat: 50 }), // 400+800+450 = 1650 kcal
    log('2026-09-30', { bodyweight: 79, steps: 10000, protein: 120, carbs: 180, fat: 60 }), // 480+720+540 = 1740 kcal
    log('2026-10-05', { bodyweight: 78 }),
    log('2026-10-06', { steps: 6000 }),
  ];
  const weeks = buildWeeklyTrend(logs);

  it('groups logged days by week, oldest first, with the average of what was logged', () => {
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-28', '2026-10-05']);
    expect(weeks[0]).toMatchObject({ avgBodyweight: 79.5, avgSteps: 9000, avgCalories: 1695, loggedDays: 2 });
  });

  it('averages only the days that have that figure', () => {
    expect(weeks[1]).toMatchObject({ avgBodyweight: 78, avgSteps: 6000, avgCalories: null, loggedDays: 2 });
  });

  it('ignores an empty row (a day that only holds food-diary entries)', () => {
    expect(buildWeeklyTrend([log('2026-10-07')])).toEqual([]);
  });

  it('has nothing to show without logs', () => {
    expect(buildWeeklyTrend([])).toEqual([]);
  });

  it('treats a missing macro as zero within a day that has some', () => {
    const w = buildWeeklyTrend([log('2026-10-05', { protein: 100 })]);
    expect(w[0].avgCalories).toBe(400);
  });

  it('averages protein, sleep and water over only the days that have each figure', () => {
    const w = buildWeeklyTrend([
      log('2026-10-05', { protein: 100, sleep: 8, water: 2 }),
      log('2026-10-06', { protein: 140, sleep: 6 }),
      log('2026-10-07', { steps: 5000 }), // a day with none of the three must not drag them down
    ]);
    expect(w[0]).toMatchObject({ avgProtein: 120, avgSleep: 7, avgWater: 2 });
  });

  it('counts a day of Quick Add calories with no macros, from the stored day calories (R11)', () => {
    const w = buildWeeklyTrend([log('2026-10-05', { calories: 300 }), log('2026-10-06', { protein: 100 })]);
    expect(w[0].avgCalories).toBe(350); // (300 + 400) / 2
  });
});

describe('trendSummary', () => {
  const weeks = buildWeeklyTrend([
    log('2026-09-14', { bodyweight: 82 }),
    log('2026-09-21', { bodyweight: 81 }),
    log('2026-09-28', { bodyweight: 80.4 }),
    log('2026-09-28', { steps: 5000 }),
  ]);

  it('gives the weekly points, the latest value and the change since the week before', () => {
    const s = trendSummary(weeks, 'avgBodyweight', true);
    expect(s.points).toEqual([82, 81, 80.4]);
    expect(s.current).toBe(80.4);
    expect(s.delta).toBeCloseTo(-0.6, 5);
    expect(s.labels).toEqual([shortDate('2026-09-14'), shortDate('2026-09-21'), shortDate('2026-09-28')]); // the Mondays
  });

  it('colours the change only for a measure with a better direction', () => {
    expect(trendSummary(weeks, 'avgBodyweight', true).favourable).toBe(true);
    expect(trendSummary(weeks, 'avgBodyweight', false).favourable).toBe(false);
    expect(trendSummary(weeks, 'avgBodyweight').favourable).toBeNull();
  });

  it('shows no change with one week of data, or when it did not move', () => {
    expect(trendSummary(weeks, 'avgSteps').delta).toBeNull();
    const flat = buildWeeklyTrend([log('2026-09-14', { bodyweight: 80 }), log('2026-09-21', { bodyweight: 80 })]);
    expect(trendSummary(flat, 'avgBodyweight', true).delta).toBeNull();
  });

  it('skips weeks without that figure and copes with none', () => {
    expect(trendSummary(weeks, 'avgCalories').current).toBeNull();
    expect(trendSummary([], 'avgSteps')).toMatchObject({ points: [], current: null, delta: null });
  });
});

describe('latestBodyweight', () => {
  it('is the newest logged weight, or null', () => {
    expect(latestBodyweight([log('2026-10-01', { bodyweight: 80 }), log('2026-10-02'), log('2026-10-03', { bodyweight: 79 })])).toBe(79);
    expect(latestBodyweight([log('2026-10-01', { bodyweight: 80 }), log('2026-10-02')])).toBe(80);
    expect(latestBodyweight([])).toBeNull();
  });
});

describe('weightGoal', () => {
  it('losing weight: progress is how much of the way from start to goal', () => {
    expect(weightGoal({ start_weight: 90, goal_weight: 80 }, 85)).toEqual({ start: 90, goal: 80, now: 85, pct: 50, toGo: 5 });
  });

  it('gaining weight works the other way round', () => {
    expect(weightGoal({ start_weight: 70, goal_weight: 80 }, 73)).toMatchObject({ pct: 30, toGo: 7 });
  });

  it('is complete once the goal is reached or passed, and never negative', () => {
    expect(weightGoal({ start_weight: 90, goal_weight: 80 }, 80)).toMatchObject({ pct: 100, toGo: 0 });
    expect(weightGoal({ start_weight: 90, goal_weight: 80 }, 78)).toMatchObject({ pct: 100, toGo: 0 });
  });

  it('is 0% when the member has gone the wrong way, and the distance to go is measured from where they are now', () => {
    expect(weightGoal({ start_weight: 90, goal_weight: 80 }, 92)).toMatchObject({ pct: 0, toGo: 12 });
  });

  it('with no logged weight yet, starts at the start weight', () => {
    expect(weightGoal({ start_weight: 90, goal_weight: 80 }, null)).toEqual({ start: 90, goal: 80, now: null, pct: 0, toGo: 10 });
  });

  it('shows nothing without both weights, or when they are the same', () => {
    expect(weightGoal(null, 80)).toBeNull();
    expect(weightGoal({ start_weight: 90, goal_weight: null }, 80)).toBeNull();
    expect(weightGoal({ start_weight: 80, goal_weight: 80 }, 80)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import type { DailyLogRow } from '../data/types';
import { chartDomain, dailyPoints, formatMetricValue, metricValue, movingAverage, needsMoreHistory, rangeStart, summarize, weeklyAverages } from './metrics';

const log = (date: string, over: Partial<DailyLogRow> = {}): DailyLogRow => ({
  id: date,
  client_id: 'c',
  log_date: date,
  protein: null,
  carbs: null,
  fat: null,
  fibre: null,
  calories: null,
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
  ...over,
});

describe('rangeStart / needsMoreHistory', () => {
  it('counts back from today, inclusive, and has no start for All', () => {
    expect(rangeStart('2026-10-29', '4w')).toBe('2026-10-02');
    expect(rangeStart('2026-10-29', '12w')).toBe('2026-08-07');
    expect(rangeStart('2026-10-29', 'all')).toBeNull();
  });
  it('needs more history only past the days already loaded', () => {
    expect(needsMoreHistory('4w')).toBe(false);
    expect(needsMoreHistory('12w')).toBe(false);
    expect(needsMoreHistory('6m')).toBe(true);
    expect(needsMoreHistory('all')).toBe(true);
  });
});

describe('dailyPoints', () => {
  const logs = [log('2026-10-03', { bodyweight: 80 }), log('2026-10-01', { bodyweight: 81 }), log('2026-10-02', { steps: 5000 }), log('2026-10-04', { bodyweight: 0 })];
  it('keeps only days with the figure, in date order, inside the range', () => {
    expect(dailyPoints(logs, 'bodyweight', null, '2026-10-31')).toEqual([
      { date: '2026-10-01', value: 81 },
      { date: '2026-10-03', value: 80 },
    ]);
    expect(dailyPoints(logs, 'bodyweight', '2026-10-02', '2026-10-31')).toEqual([{ date: '2026-10-03', value: 80 }]);
  });
  it('gives no calories to a day with no food', () => {
    expect(metricValue(log('2026-10-01', { water: 2 }), 'calories')).toBeNull();
    expect(metricValue(log('2026-10-01', { protein: 100, carbs: 100, fat: 50 }), 'calories')).not.toBeNull();
  });
});

describe('movingAverage', () => {
  it('averages the logged days in the 7 days up to each point', () => {
    const pts = [
      { date: '2026-10-01', value: 10 },
      { date: '2026-10-02', value: 20 },
      { date: '2026-10-09', value: 30 },
    ];
    const avg = movingAverage(pts);
    expect(avg[0].value).toBe(10);
    expect(avg[1].value).toBe(15);
    // 2026-10-02 is 7 days before 10-09, so it falls outside the window.
    expect(avg[2].value).toBe(30);
  });
});

describe('weeklyAverages', () => {
  it('averages by Monday-to-Sunday week and dates each by its Monday', () => {
    const weeks = weeklyAverages([
      { date: '2026-10-05', value: 10 },
      { date: '2026-10-11', value: 20 },
      { date: '2026-10-12', value: 40 },
    ]);
    expect(weeks).toEqual([
      { date: '2026-10-05', value: 15 },
      { date: '2026-10-12', value: 40 },
    ]);
  });
});

describe('summarize', () => {
  it('reports the change on the first reading and whether it is the better way', () => {
    const s = summarize(
      [
        { date: '2026-10-01', value: 82 },
        { date: '2026-10-08', value: 80 },
      ],
      'down'
    );
    expect(s).toMatchObject({ count: 2, latest: 80, change: -2, average: 81, min: 80, max: 82, favourable: true });
  });
  it('has no change from one reading, and no verdict without a better direction', () => {
    expect(summarize([{ date: '2026-10-01', value: 5 }], 'up').change).toBeNull();
    expect(
      summarize(
        [
          { date: '2026-10-01', value: 1 },
          { date: '2026-10-02', value: 2 },
        ]
      ).favourable
    ).toBeNull();
    expect(summarize([]).latest).toBeNull();
  });
});

describe('formatMetricValue / chartDomain', () => {
  it('formats with the metric digits and unit', () => {
    expect(formatMetricValue(81.26, { digits: 1, unit: 'kg' })).toBe('81.3kg');
    expect(formatMetricValue(2100.4, { digits: 0, unit: 'kcal' })).toBe('2,100 kcal');
    expect(formatMetricValue(8200, { digits: 0, unit: '' })).toBe('8,200');
  });
  it('always includes the target line in the chart range', () => {
    const d = chartDomain([80, 82], 90);
    expect(d.max).toBeGreaterThan(90);
    expect(d.min).toBeLessThan(80);
    expect(chartDomain([]).max).toBeGreaterThan(chartDomain([]).min);
  });
});

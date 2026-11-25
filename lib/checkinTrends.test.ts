import { describe, expect, it } from 'vitest';
import { checkinScaleTrends, scaleTrend, trendTone, trendWeekStarts } from './checkinTrends';

// Thu 26 Nov 2026: this week starts Mon 23 Nov.
const TODAY = '2026-11-26';

describe('trendWeekStarts', () => {
  it('is the four Mondays ending with this week, oldest first', () => {
    expect(trendWeekStarts(TODAY)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('starts this week on the Monday when today is a Monday or a Sunday', () => {
    expect(trendWeekStarts('2026-11-23').at(-1)).toBe('2026-11-23');
    expect(trendWeekStarts('2026-11-29').at(-1)).toBe('2026-11-23');
  });
});

describe('scaleTrend', () => {
  it('averages each week and compares the newest scored week with the oldest', () => {
    const t = scaleTrend(
      [
        { log_date: '2026-11-02', energy: 2 },
        { log_date: '2026-11-04', energy: 3 },
        { log_date: '2026-11-11', energy: 3 },
        { log_date: '2026-11-24', energy: 4 },
        { log_date: '2026-11-26', energy: 5 },
      ],
      'energy',
      TODAY
    );
    expect(t.weeks.map((w) => w.avg)).toEqual([2.5, 3, null, 4.5]);
    expect(t.weeks.map((w) => w.days)).toEqual([2, 1, 0, 2]);
    expect(t.latest).toBe(4.5);
    expect(t.latestWeek).toBe('2026-11-23');
    expect(t.change).toBe(2);
    expect(t.days).toBe(5);
  });

  it('leaves out days with no score, days outside the four weeks and days after today', () => {
    const t = scaleTrend(
      [
        { log_date: '2026-11-01', stress: 5 }, // the Sunday before the first week
        { log_date: '2026-11-17', stress: null },
        { log_date: '2026-11-18', stress: 2 },
        { log_date: '2026-11-27', stress: 1 }, // tomorrow
      ],
      'stress',
      TODAY
    );
    expect(t.weeks.map((w) => w.avg)).toEqual([null, null, 2, null]);
    expect(t.latest).toBe(2);
    expect(t.latestWeek).toBe('2026-11-16');
    // One week scored: nothing to compare it with.
    expect(t.change).toBeNull();
  });

  it('is empty when nothing was scored', () => {
    const t = scaleTrend([{ log_date: '2026-11-25', hunger: null }], 'hunger', TODAY);
    expect(t.latest).toBeNull();
    expect(t.latestWeek).toBeNull();
    expect(t.change).toBeNull();
    expect(t.days).toBe(0);
  });
});

describe('checkinScaleTrends', () => {
  it('gives energy, stress and hunger in that order', () => {
    const all = checkinScaleTrends([{ log_date: '2026-11-25', energy: 3, stress: 4, hunger: 2 }], TODAY);
    expect(all.map((t) => [t.key, t.latest])).toEqual([
      ['energy', 3],
      ['stress', 4],
      ['hunger', 2],
    ]);
  });
});

describe('trendTone', () => {
  it('reads energy going up and stress going down as good', () => {
    expect(trendTone('energy', 0.5)).toBe('good');
    expect(trendTone('energy', -0.5)).toBe('bad');
    expect(trendTone('stress', -0.5)).toBe('good');
    expect(trendTone('stress', 0.5)).toBe('bad');
  });

  it('reads hunger as neither, a tiny change as flat and no change as nothing', () => {
    expect(trendTone('hunger', 1)).toBe('neutral');
    expect(trendTone('energy', 0.05)).toBe('flat');
    expect(trendTone('energy', null)).toBeNull();
  });
});

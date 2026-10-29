import { describe, expect, it } from 'vitest';
import { applyExceptionsAndCounts, generateOccurrences } from './schedule';

// 2026-10-12 is a Monday.
const TODAY = '2026-10-12';
const cls = (over: Partial<Parameters<typeof generateOccurrences>[0][number]> = {}) => ({
  id: 'c1', name: 'Strength', day_of_week: 1 as number | null, specific_date: null as string | null,
  start_time: '06:00', capacity: 12, credit_cost: 1, cutoff_hours: 3, ...over,
});
const dates = (os: { date: string }[]) => os.map((o) => o.date);

describe('generateOccurrences', () => {
  it('lists a weekly class for the next 3 weeks, counting today', () => {
    expect(dates(generateOccurrences([cls({ day_of_week: 1 })], { todayIso: TODAY }))).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('starts at the next matching weekday (Wednesday, then Sunday which is 0)', () => {
    expect(dates(generateOccurrences([cls({ day_of_week: 3 })], { todayIso: TODAY }))).toEqual(['2026-10-14', '2026-10-21', '2026-10-28']);
    expect(dates(generateOccurrences([cls({ day_of_week: 0 })], { todayIso: TODAY }))[0]).toBe('2026-10-18');
  });

  it('can look back for past sessions and ahead for longer windows', () => {
    expect(dates(generateOccurrences([cls()], { todayIso: TODAY, weeksBack: 1, weeksAhead: 2 }))).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(generateOccurrences([cls()], { todayIso: TODAY, weeksAhead: 5 })).toHaveLength(5);
  });

  it('keeps a one-off session only inside the window', () => {
    const one = (d: string) => generateOccurrences([cls({ day_of_week: null, specific_date: d })], { todayIso: TODAY });
    expect(dates(one('2026-10-12'))).toEqual(['2026-10-12']); // today
    expect(dates(one('2026-11-01'))).toEqual(['2026-11-01']); // day 20
    expect(one('2026-11-02')).toEqual([]); // day 21 = outside
    expect(one('2026-10-11')).toEqual([]); // yesterday
  });

  it('ignores a class with neither a weekday nor a date', () => {
    expect(generateOccurrences([cls({ day_of_week: null, specific_date: null })], { todayIso: TODAY })).toEqual([]);
  });

  it('carries the class details and the gym blackout window onto each session', () => {
    const [o] = generateOccurrences([cls({ capacity: 8, credit_cost: 2, cutoff_hours: 5 })], { todayIso: TODAY, blackoutStart: '23:00:00', blackoutEnd: '05:00:00' });
    expect(o).toMatchObject({ classId: 'c1', className: 'Strength', startTime: '06:00', capacity: 8, creditCost: 2, cutoffHours: 5, blackoutStart: '23:00:00', blackoutEnd: '05:00:00' });
  });

  it('uses the date it is given, not the server clock (a member whose today is already the next UTC day)', () => {
    expect(dates(generateOccurrences([cls({ day_of_week: 2 })], { todayIso: '2026-10-13' }))[0]).toBe('2026-10-13');
  });
});

describe('applyExceptionsAndCounts', () => {
  const occs = generateOccurrences([cls({ id: 'a', start_time: '17:30' }), cls({ id: 'b', start_time: '06:00' })], { todayIso: TODAY, weeksAhead: 2 });

  it('drops sessions the coach cancelled', () => {
    const out = applyExceptionsAndCounts(occs, [{ class_id: 'a', occurrence_date: '2026-10-19' }], []);
    expect(out.some((o) => o.classId === 'a' && o.date === '2026-10-19')).toBe(false);
    expect(out.some((o) => o.classId === 'b' && o.date === '2026-10-19')).toBe(true);
    expect(out).toHaveLength(3);
  });

  it('adds the whole-gym booked count, defaulting to 0', () => {
    const out = applyExceptionsAndCounts(occs, [], [{ class_id: 'a', booking_date: '2026-10-12', booked_count: 11 }]);
    expect(out.find((o) => o.classId === 'a' && o.date === '2026-10-12')?.bookedCount).toBe(11);
    expect(out.find((o) => o.classId === 'b' && o.date === '2026-10-12')?.bookedCount).toBe(0);
  });

  it('sorts by date, then by start time', () => {
    const out = applyExceptionsAndCounts(occs, [], []);
    expect(out.map((o) => `${o.date} ${o.startTime}`)).toEqual(['2026-10-12 06:00', '2026-10-12 17:30', '2026-10-19 06:00', '2026-10-19 17:30']);
  });
});

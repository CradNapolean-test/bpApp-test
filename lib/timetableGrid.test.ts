import { describe, expect, it } from 'vitest';
import { GAP_H, HOUR_H, hourRows, mondayOf, newSessionStart, phoneDayFor, timeAtY, yOfMinute } from './timetableGrid';

// Thursday 26 Nov 2026; its week starts Monday 23 Nov.
const TODAY = '2026-11-26';
const THIS_WEEK = '2026-11-23';
const NEXT_WEEK = '2026-11-30';
const LAST_WEEK = '2026-11-16';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
const NO_SUNDAY = [1, 2, 3, 4, 5, 6];

describe('mondayOf', () => {
  it('finds the Monday of the week, Sunday included', () => {
    expect(mondayOf(TODAY)).toBe(THIS_WEEK);
    expect(mondayOf('2026-11-29')).toBe(THIS_WEEK);
    expect(mondayOf(THIS_WEEK)).toBe(THIS_WEEK);
  });
});

describe('hourRows', () => {
  it('draws the hours with a session, one either side, and folds the gap between', () => {
    const { rows, total } = hourRows(['06:00:00', '18:00:00']);
    expect(rows.map((r) => r.hour)).toEqual([5, 6, 7, null, 17, 18, 19]);
    expect(total).toBe(6 * HOUR_H + GAP_H);
  });

  it('draws 5am to 8pm when nothing is scheduled', () => {
    const { rows } = hourRows([]);
    expect(rows[0].hour).toBe(5);
    expect(rows[rows.length - 1].hour).toBe(20);
  });
});

describe('timeAtY: the tapped slot (CS7)', () => {
  const { rows } = hourRows(['06:00:00', '18:00:00']);
  const six = rows.find((r) => r.hour === 6)!;
  const five = rows.find((r) => r.hour === 17)!;

  it('lands on the quarter hour that was tapped', () => {
    expect(timeAtY(rows, six.top)).toBe('06:00');
    expect(timeAtY(rows, six.top + HOUR_H / 4 - 1)).toBe('06:00');
    expect(timeAtY(rows, six.top + HOUR_H / 4)).toBe('06:15');
    expect(timeAtY(rows, six.top + HOUR_H / 2 + 1)).toBe('06:30');
    expect(timeAtY(rows, six.top + HOUR_H - 1)).toBe('06:45');
  });

  it('works below a folded band too', () => {
    expect(timeAtY(rows, five.top + 1)).toBe('17:00');
    expect(timeAtY(rows, five.top + (HOUR_H * 3) / 4 + 1)).toBe('17:45');
  });

  it('is nothing on a folded band or off the grid', () => {
    const gap = rows.find((r) => r.hour === null)!;
    expect(timeAtY(rows, gap.top + 2)).toBeNull();
    expect(timeAtY(rows, -5)).toBeNull();
    expect(timeAtY(rows, 10_000)).toBeNull();
  });

  it('round-trips with where a session is drawn', () => {
    for (const t of ['06:00', '06:15', '06:30', '18:45']) {
      const [h, m] = t.split(':').map(Number);
      expect(timeAtY(rows, yOfMinute(rows, h * 60 + m) + 1)).toBe(t);
    }
  });
});

describe('newSessionStart (CS7)', () => {
  it('starts on the day and time tapped, in the week shown', () => {
    expect(newSessionStart(NEXT_WEEK, TODAY, { day: 3, time: '07:15' })).toEqual({ dayOfWeek: 3, date: '2026-12-02', startTime: '07:15' });
    expect(newSessionStart(THIS_WEEK, TODAY, { day: 5, time: '18:30' })).toEqual({ dayOfWeek: 5, date: '2026-11-27', startTime: '18:30' });
    expect(newSessionStart(THIS_WEEK, TODAY, { day: 4, time: '09:00' })).toEqual({ dayOfWeek: 4, date: TODAY, startTime: '09:00' });
  });

  it('a Sunday tap is the Sunday at the end of the week shown', () => {
    expect(newSessionStart(THIS_WEEK, TODAY, { day: 0, time: '10:00' }).date).toBe('2026-11-29');
  });

  it('a tap on a day that has gone keeps the weekday, and a one-off date of the next such day', () => {
    expect(newSessionStart(THIS_WEEK, TODAY, { day: 1, time: '06:00' })).toEqual({ dayOfWeek: 1, date: NEXT_WEEK, startTime: '06:00' });
    expect(newSessionStart(LAST_WEEK, TODAY, { day: 4, time: '06:00' })).toEqual({ dayOfWeek: 4, date: TODAY, startTime: '06:00' });
    expect(newSessionStart(LAST_WEEK, TODAY, { day: 2, time: '06:00' }).date).toBe('2026-12-01');
  });

  it('"Add session" on this week starts today, not Monday', () => {
    expect(newSessionStart(THIS_WEEK, TODAY)).toEqual({ dayOfWeek: 4, date: TODAY, startTime: '06:00' });
  });

  it('"Add session" on a later week starts on that week', () => {
    expect(newSessionStart(NEXT_WEEK, TODAY)).toEqual({ dayOfWeek: 1, date: NEXT_WEEK, startTime: '06:00' });
    expect(newSessionStart('2027-01-04', TODAY).date).toBe('2027-01-04');
  });

  it('"Add session" on a week that has gone starts today', () => {
    expect(newSessionStart(LAST_WEEK, TODAY)).toEqual({ dayOfWeek: 4, date: TODAY, startTime: '06:00' });
  });
});

describe('phoneDayFor: the one-day view on a phone (CS11)', () => {
  it('opens on today in this week', () => {
    expect(phoneDayFor(THIS_WEEK, TODAY, null, NO_SUNDAY)).toBe(4);
  });

  it('opens on Monday in any other week', () => {
    expect(phoneDayFor(NEXT_WEEK, TODAY, null, NO_SUNDAY)).toBe(1);
    expect(phoneDayFor(LAST_WEEK, TODAY, null, NO_SUNDAY)).toBe(1);
  });

  it('keeps the day the coach picked, from week to week', () => {
    expect(phoneDayFor(THIS_WEEK, TODAY, 6, NO_SUNDAY)).toBe(6);
    expect(phoneDayFor(NEXT_WEEK, TODAY, 2, NO_SUNDAY)).toBe(2);
    expect(phoneDayFor(NEXT_WEEK, TODAY, 0, ALL_DAYS)).toBe(0);
  });

  it('never shows a day that is not drawn (an empty Sunday)', () => {
    expect(phoneDayFor(THIS_WEEK, TODAY, 0, NO_SUNDAY)).toBe(4);
    expect(phoneDayFor(THIS_WEEK, '2026-11-29', null, NO_SUNDAY)).toBe(1);
    expect(phoneDayFor(THIS_WEEK, '2026-11-29', null, ALL_DAYS)).toBe(0);
  });
});

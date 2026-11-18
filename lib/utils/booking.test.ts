import { describe, expect, it } from 'vitest';
import { cancelSummary, creditWeekStart, nextResetDate, sessionPayment, shortDayLabel } from './booking';

// Same cases as packages/shared/src/utils/booking.test.ts: the web and the phone must give members the same answer.
describe('cancelSummary', () => {
  const b = (class_: { start_time: string | null; cutoff_hours: number } | null, status: 'booked' | 'waitlist' = 'booked', booking_date = '2026-10-13') => ({ status, booking_date, class: class_ });
  const at = (iso: string) => Date.parse(iso + ':00Z'); // gym wall-clock encoded as UTC ms

  it('is late once now reaches start minus the cut-off', () => {
    const booking = b({ start_time: '17:30', cutoff_hours: 3 }); // deadline 14:30 on the 13th
    expect(cancelSummary(booking, at('2026-10-13T14:29'), null, null).late).toBe(false);
    expect(cancelSummary(booking, at('2026-10-13T14:30'), null, null).late).toBe(true);
  });

  it('moves an early-morning deadline back to the evening before when it falls in the overnight blackout', () => {
    const booking = b({ start_time: '06:00', cutoff_hours: 3 }); // 03:00 is inside 23:00-05:00 -> deadline 23:00 on the 12th
    const s = cancelSummary(booking, at('2026-10-12T22:59'), '23:00:00', '05:00:00');
    expect(s.deadline).toMatchObject({ time: '23:00', dayBefore: true });
    expect(s.late).toBe(false);
    expect(cancelSummary(booking, at('2026-10-12T23:00'), '23:00:00', '05:00:00').late).toBe(true);
  });

  it('is never late for a waitlist spot (nothing was charged) or a booking with no class loaded', () => {
    expect(cancelSummary(b({ start_time: '06:00', cutoff_hours: 3 }, 'waitlist'), at('2026-10-13T05:59'), null, null)).toEqual({ waitlisted: true, late: false, deadline: null, refundUntilStart: false });
    expect(cancelSummary(b(null), at('2026-10-13T05:59'), null, null)).toMatchObject({ late: false, deadline: null });
  });

  // Decision D1 (migration 0158): a place given from the waitlist after the cut-off is refunded until the session starts.
  it('a booking moved off the waitlist after the cut-off is refunded until the session starts, then not', () => {
    const promoted = { ...b({ start_time: '17:30', cutoff_hours: 3 }), promoted_after_cutoff: true }; // deadline 14:30, start 17:30
    expect(cancelSummary(promoted, at('2026-10-13T17:29'), null, null)).toMatchObject({ late: false, refundUntilStart: true });
    expect(cancelSummary(promoted, at('2026-10-13T17:30'), null, null)).toMatchObject({ late: true, refundUntilStart: false });
    expect(cancelSummary({ ...promoted, promoted_after_cutoff: false }, at('2026-10-13T17:29'), null, null)).toMatchObject({ late: true, refundUntilStart: false });
  });
});

// Weekly credits reset on Saturday (migration 0144). 2026-10-17 is a Saturday.
describe('creditWeekStart', () => {
  it('is the Saturday on or before the date, like the database credit_week_start()', () => {
    expect(creditWeekStart('2026-10-17')).toBe('2026-10-17'); // Saturday
    expect(creditWeekStart('2026-10-18')).toBe('2026-10-17'); // Sunday
    expect(creditWeekStart('2026-10-19')).toBe('2026-10-17'); // Monday
    expect(creditWeekStart('2026-10-23')).toBe('2026-10-17'); // Friday
    expect(creditWeekStart('2026-10-24')).toBe('2026-10-24'); // next Saturday
  });
  it('crosses a month boundary', () => {
    expect(creditWeekStart('2026-11-02')).toBe('2026-10-31'); // Monday
  });
});

describe('nextResetDate', () => {
  it('is always the following Saturday', () => {
    expect(nextResetDate('2026-10-12')).toBe('2026-10-17'); // Monday
    expect(nextResetDate('2026-10-14')).toBe('2026-10-17'); // Wednesday
    expect(nextResetDate('2026-10-16')).toBe('2026-10-17'); // Friday
    expect(nextResetDate('2026-10-18')).toBe('2026-10-24'); // Sunday
  });
  it('points a week ahead on a Saturday, because that day\'s reset has already run', () => {
    expect(nextResetDate('2026-10-17')).toBe('2026-10-24');
  });
});

// A credit counts in the week the session runs (D13b, migration 0171). Today is Friday 20 Nov 2026; the next credit week starts Sat 21 Nov.
describe('sessionPayment', () => {
  const today = '2026-11-20';
  const week = (weeklyLeft: number, bonus = 0, planLastDay: string | null = null) => ({ weeklyLeft, bonus, planLastDay });

  it('a session next week is paid from next week\'s credits, not what is left this week', () => {
    const p = sessionPayment('2026-11-23', 1, today, week(3), 0);
    expect(p).toMatchObject({ laterWeek: true, weekStart: '2026-11-21', available: 3, enough: true, left: 2, afterPlanEnd: false });
    expect(sessionPayment('2026-11-23', 1, today, week(0), 3).enough).toBe(false);
  });

  it('Friday is this week and Saturday the next', () => {
    expect(sessionPayment('2026-11-20', 1, today, week(1), 1).laterWeek).toBe(false);
    expect(sessionPayment('2026-11-21', 1, today, week(1), 1).laterWeek).toBe(true);
  });

  it('bonus credits count in any week', () => {
    expect(sessionPayment('2026-11-23', 2, today, week(1, 1), 0)).toMatchObject({ available: 2, enough: true, left: 0 });
    expect(sessionPayment('2026-11-23', 1, today, week(0, -2), 0)).toMatchObject({ available: 0, enough: false });
  });

  it('a session after the plan\'s planned last day cannot be booked', () => {
    expect(sessionPayment('2026-11-23', 1, today, week(0, 5, '2026-11-22'), 0)).toMatchObject({ afterPlanEnd: true, enough: false });
    expect(sessionPayment('2026-11-22', 1, today, week(1, 0, '2026-11-22'), 0)).toMatchObject({ afterPlanEnd: false, enough: true });
  });

  it('before the numbers load: this week uses the balance on screen, a later week is left to the database', () => {
    expect(sessionPayment('2026-11-20', 1, today, undefined, 0)).toMatchObject({ available: 0, enough: false });
    expect(sessionPayment('2026-11-23', 1, today, undefined, 0)).toMatchObject({ available: null, enough: true, left: null });
  });
});

describe('shortDayLabel', () => {
  it('is the short weekday, day and month', () => {
    expect(shortDayLabel('2026-11-21')).toBe('Sat 21 Nov');
    expect(shortDayLabel('2027-01-01')).toBe('Fri 1 Jan');
  });
});

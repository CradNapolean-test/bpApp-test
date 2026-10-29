import { describe, expect, it } from 'vitest';
import type { ScheduleOccurrence } from '../data/types';
import { bookableOccurrences, bookingWindowDays, bookSummary, cancelSummary, creditWeekStart, isMorning, nextResetDate, slotState, spots, startMs } from './booking';

const occ = (over: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence => ({
  classId: 'c', className: 'Strength', date: '2026-10-12', startTime: '06:00', capacity: 12, creditCost: 1, bookedCount: 0,
  cutoffHours: 3, blackoutStart: null, blackoutEnd: null, ...over,
});

describe('bookingWindowDays', () => {
  it('is two weeks by default and the package limit when there is one', () => {
    expect(bookingWindowDays(null)).toBe(13);
    expect(bookingWindowDays(undefined)).toBe(13);
    expect(bookingWindowDays(7)).toBe(7);
  });
});

describe('bookableOccurrences', () => {
  const today = '2026-10-12';
  const now = startMs(today, '07:00'); // 7am on the 12th, gym wall-clock
  it('hides sessions that have already started', () => {
    const out = bookableOccurrences([occ({ startTime: '06:00' }), occ({ startTime: '17:30' })], now, today, 13);
    expect(out.map((o) => o.startTime)).toEqual(['17:30']);
  });
  it('hides sessions beyond the booking window (last bookable day is today + windowDays)', () => {
    const out = bookableOccurrences([occ({ date: '2026-10-25' }), occ({ date: '2026-10-26' })], now, today, 13);
    expect(out.map((o) => o.date)).toEqual(['2026-10-25']);
    expect(bookableOccurrences([occ({ date: '2026-10-20' })], now, today, 7)).toEqual([]);
  });
  it('offers a session with no start time all day', () => {
    expect(bookableOccurrences([occ({ startTime: null })], startMs(today, '00:00') - 1, today, 13)).toHaveLength(1);
  });
});

describe('isMorning', () => {
  it('splits at noon', () => {
    expect(isMorning({ startTime: '11:59' })).toBe(true);
    expect(isMorning({ startTime: '12:00' })).toBe(false);
    expect(isMorning({ startTime: null })).toBe(true);
  });
});

describe('slotState and spots', () => {
  it('reflects the member’s own booking first', () => {
    expect(slotState(occ({ bookedCount: 12 }), { status: 'booked' })).toBe('booked');
    expect(slotState(occ(), { status: 'waitlist' })).toBe('waitlisted');
  });
  it('is full at capacity and open below it', () => {
    expect(slotState(occ({ bookedCount: 12 }), undefined)).toBe('full');
    expect(slotState(occ({ bookedCount: 11 }), undefined)).toBe('open');
  });
  it('counts spots left and flags scarcity at 3 or fewer', () => {
    expect(spots({ capacity: 12, bookedCount: 9 })).toEqual({ left: 3, full: false, fillPct: 75, scarce: true });
    expect(spots({ capacity: 12, bookedCount: 12 })).toMatchObject({ left: 0, full: true, scarce: false, fillPct: 100 });
    expect(spots({ capacity: 12, bookedCount: 0 })).toMatchObject({ left: 12, scarce: false, fillPct: 0 });
  });
});

describe('bookSummary', () => {
  it('shows what is left after booking and whether the member can confirm', () => {
    expect(bookSummary(occ({ creditCost: 2 }), 5)).toEqual({ full: false, cost: 2, enough: true, left: 3, canConfirm: true });
    expect(bookSummary(occ({ creditCost: 2 }), 1)).toMatchObject({ enough: false, left: -1, canConfirm: false });
  });
  it('lets a member join the waitlist of a full session with no credits (nothing is charged until a spot opens)', () => {
    expect(bookSummary(occ({ bookedCount: 12 }), 0)).toMatchObject({ full: true, canConfirm: true });
  });
});

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
    expect(cancelSummary(b({ start_time: '06:00', cutoff_hours: 3 }, 'waitlist'), at('2026-10-13T05:59'), null, null)).toEqual({ waitlisted: true, late: false, deadline: null });
    expect(cancelSummary(b(null), at('2026-10-13T05:59'), null, null)).toMatchObject({ late: false, deadline: null });
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

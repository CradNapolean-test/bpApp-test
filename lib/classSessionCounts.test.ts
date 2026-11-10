import { describe, expect, it } from 'vitest';
import { countSessionBookings, sessionKey, type SessionBookingRow } from './classSessionCounts';

// Wall-clock ms at the gym, as nowLocalMs gives it.
const at = (date: string, time: string) => Date.parse(`${date}T${time}:00Z`);

const row = (over: Partial<SessionBookingRow>): SessionBookingRow => ({
  class_id: 'six',
  booking_date: '2026-11-10',
  status: 'booked',
  attended: false,
  no_show: false,
  ...over,
});

const starts = new Map<string, string | null>([
  ['six', '06:00'],
  ['eve', '18:30'],
]);

describe('countSessionBookings', () => {
  it('counts a session that started earlier today as needing marking (CV9/BK28)', () => {
    const { unmarked } = countSessionBookings([row({}), row({ class_id: 'eve' })], starts, at('2026-11-10', '14:57'));
    expect(unmarked.get(sessionKey('six', '2026-11-10'))).toBe(1);
    // The evening session hasn't started, so it isn't "to mark" yet.
    expect(unmarked.get(sessionKey('eve', '2026-11-10'))).toBeUndefined();
  });

  it('counts from the start time, to the minute', () => {
    expect(countSessionBookings([row({})], starts, at('2026-11-10', '05:59')).unmarked.size).toBe(0);
    expect(countSessionBookings([row({})], starts, at('2026-11-10', '06:00')).unmarked.size).toBe(1);
  });

  it('counts earlier days, and leaves marked bookings out', () => {
    const rows = [row({ booking_date: '2026-11-09' }), row({ booking_date: '2026-11-09', attended: true }), row({ booking_date: '2026-11-09', no_show: true })];
    const { booked, unmarked } = countSessionBookings(rows, starts, at('2026-11-10', '00:01'));
    expect(booked.get(sessionKey('six', '2026-11-09'))).toBe(3);
    expect(unmarked.get(sessionKey('six', '2026-11-09'))).toBe(1);
  });

  it('counts the waitlist apart from the places taken (BK15)', () => {
    const rows = [row({ booking_date: '2026-11-12' }), row({ booking_date: '2026-11-12', status: 'waitlist' }), row({ booking_date: '2026-11-12', status: 'waitlist' })];
    const { booked, waiting, unmarked } = countSessionBookings(rows, starts, at('2026-11-10', '12:00'));
    expect(booked.get(sessionKey('six', '2026-11-12'))).toBe(1);
    expect(waiting.get(sessionKey('six', '2026-11-12'))).toBe(2);
    expect(unmarked.size).toBe(0);
  });

  it('ignores cancelled bookings and never asks to mark a waitlist row', () => {
    const rows = [row({ status: 'cancelled' }), row({ status: 'waitlist' })];
    const { booked, unmarked } = countSessionBookings(rows, starts, at('2026-11-11', '12:00'));
    expect(booked.size).toBe(0);
    expect(unmarked.size).toBe(0);
  });
});

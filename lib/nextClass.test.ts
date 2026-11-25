import { describe, expect, it } from 'vitest';
import { isUpcomingClass, nextBookedClass } from './nextClass';

const TODAY = '2026-11-06';
const at = (h: number, m = 0) => h * 60 + m;
const booking = (id: string, date: string, start: string | null, status = 'booked') => ({
  id,
  booking_date: date,
  status,
  class: { start_time: start },
});

describe('isUpcomingClass', () => {
  it('drops a class earlier today once it has started', () => {
    expect(isUpcomingClass(booking('a', TODAY, '06:00:00'), TODAY, at(14, 50))).toBe(false);
    // On the minute it starts it is no longer next.
    expect(isUpcomingClass(booking('a', TODAY, '14:50'), TODAY, at(14, 50))).toBe(false);
    expect(isUpcomingClass(booking('a', TODAY, '18:00:00'), TODAY, at(14, 50))).toBe(true);
  });

  it('keeps any later day and drops any earlier one, whatever the time', () => {
    expect(isUpcomingClass(booking('a', '2026-11-07', '06:00'), TODAY, at(23, 59))).toBe(true);
    expect(isUpcomingClass(booking('a', '2026-11-05', '23:00'), TODAY, at(0))).toBe(false);
  });

  it('keeps a class today with no start time, and drops one that is not booked', () => {
    expect(isUpcomingClass(booking('a', TODAY, null), TODAY, at(20)), 'no time').toBe(true);
    expect(isUpcomingClass(booking('a', TODAY, ''), TODAY, at(20)), 'empty time').toBe(true);
    expect(isUpcomingClass(booking('a', '2026-11-08', '09:00', 'cancelled'), TODAY, at(9))).toBe(false);
  });
});

describe('nextBookedClass', () => {
  it('is the soonest class still to come (CV8: not this morning’s at 2:50pm)', () => {
    const list = [booking('later', '2026-11-08', '09:00'), booking('morning', TODAY, '06:00'), booking('evening', TODAY, '18:00')];
    expect(nextBookedClass(list, TODAY, at(14, 50))?.id).toBe('evening');
    expect(nextBookedClass(list, TODAY, at(5, 30))?.id).toBe('morning');
    expect(nextBookedClass(list, TODAY, at(19))?.id).toBe('later');
  });

  it('is undefined when nothing is still to come', () => {
    expect(nextBookedClass([booking('a', TODAY, '06:00')], TODAY, at(7))).toBeUndefined();
    expect(nextBookedClass([], TODAY, at(7))).toBeUndefined();
  });
});

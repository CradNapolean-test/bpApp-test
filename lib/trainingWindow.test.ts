import { describe, expect, it } from 'vitest';
import { BOOKING_HISTORY_DAYS, WORKOUT_LOG_DAYS, bookingWindowStart, workoutWindowStart } from './trainingWindow';

describe('the history windows (H5)', () => {
  it('starts the set window 90 days back at midnight UTC', () => {
    expect(WORKOUT_LOG_DAYS).toBe(90);
    expect(workoutWindowStart('2026-10-15')).toBe('2026-07-17T00:00:00.000Z');
  });
  it('crosses a year end', () => {
    expect(workoutWindowStart('2026-02-10')).toBe('2025-11-12T00:00:00.000Z');
  });
  it('starts the booking window 90 days back as a date', () => {
    expect(BOOKING_HISTORY_DAYS).toBe(90);
    expect(bookingWindowStart('2026-10-15')).toBe('2026-07-17');
  });
  it('takes any number of days', () => {
    expect(bookingWindowStart('2026-10-15', 1)).toBe('2026-10-14');
  });
});

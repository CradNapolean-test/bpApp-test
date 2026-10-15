import { describe, expect, it } from 'vitest';
import { programWeekAt } from './programWeek';

describe('programWeekAt (L1)', () => {
  it('is week 1 on the first day and for the first seven days', () => {
    expect(programWeekAt('2026-10-01', '2026-10-01')).toBe(1);
    expect(programWeekAt('2026-10-07', '2026-10-01')).toBe(1);
  });

  it('moves on every seven days', () => {
    expect(programWeekAt('2026-10-08', '2026-10-01')).toBe(2);
    expect(programWeekAt('2026-10-15', '2026-10-01')).toBe(3);
  });

  it('keeps counting past 12 weeks, instead of sticking at 13', () => {
    // 280 days in is the start of week 41.
    expect(programWeekAt('2027-01-01', '2026-03-27')).toBe(41);
  });

  it('is week 1 with no start date, or one in the future', () => {
    expect(programWeekAt('2026-10-15', null)).toBe(1);
    expect(programWeekAt('2026-10-15', undefined)).toBe(1);
    expect(programWeekAt('2026-10-15', '2026-11-01')).toBe(1);
    expect(programWeekAt('2026-10-15', 'garbage')).toBe(1);
  });
});

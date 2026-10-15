import { describe, expect, it } from 'vitest';
import { scanDateProblem } from './scanDate';

describe('scanDateProblem (BS1)', () => {
  const today = '2026-10-15';
  it('accepts today and earlier days', () => {
    expect(scanDateProblem('2026-10-15', today)).toBeNull();
    expect(scanDateProblem('2026-01-02', today)).toBeNull();
  });
  it('refuses a day that has not happened', () => {
    expect(scanDateProblem('2026-10-16', today)).toBe('A scan cannot be dated in the future.');
  });
  it('refuses something that is not a date', () => {
    expect(scanDateProblem('', today)).toBe('Please pick the scan date');
    expect(scanDateProblem('15/10/2026', today)).toBe('Please pick the scan date');
    expect(scanDateProblem('2026-13-45', today)).toBe('Please pick the scan date');
  });
});

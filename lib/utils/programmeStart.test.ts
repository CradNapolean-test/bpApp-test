import { describe, expect, it } from 'vitest';
import { isTestTemplateName, nextProgrammeStart } from './programmeStart';

describe('nextProgrammeStart (CW17)', () => {
  it('is the coming Monday, or today on a Monday', () => {
    expect(nextProgrammeStart('2026-11-06')).toBe('2026-11-09'); // Friday
    expect(nextProgrammeStart('2026-11-08')).toBe('2026-11-09'); // Sunday
    expect(nextProgrammeStart('2026-11-09')).toBe('2026-11-09'); // Monday
    expect(nextProgrammeStart('2026-12-29')).toBe('2027-01-04'); // Tuesday, over the year end
  });
});

describe('isTestTemplateName (CW17)', () => {
  it('matches only throwaway test names', () => {
    expect(['Test', 'test 2', 'TEST3', ' test '].every(isTestTemplateName)).toBe(true);
    expect(['October Weeks 5-8', 'Test week', 'Testosterone block', 'Fitness test'].some(isTestTemplateName)).toBe(false);
  });
});

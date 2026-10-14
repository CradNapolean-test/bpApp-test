import { describe, expect, it } from 'vitest';
import { showsStreak } from './streak';

const m = (duration_weeks: number | null | undefined) => ({ package: { duration_weeks } as never });

describe('showsStreak', () => {
  it('shows for challenge plans and when there is no plan', () => {
    expect(showsStreak(m(6))).toBe(true);
    expect(showsStreak(null)).toBe(true);
    expect(showsStreak({ package: null })).toBe(true);
  });
  it('hides for ongoing (full-time) plans', () => {
    expect(showsStreak(m(null))).toBe(false);
    expect(showsStreak(m(undefined))).toBe(false);
  });
});

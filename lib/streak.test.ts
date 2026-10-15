import { describe, expect, it } from 'vitest';
import { currentStreak, showsStreak } from './streak';

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

describe('currentStreak (L2)', () => {
  // `days` dates in a row starting on `from`.
  const run = (from: string, days: number) =>
    Array.from({ length: days }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

  it('counts consecutive days ending today', () => {
    expect(currentStreak(run('2026-10-11', 5), '2026-10-15')).toBe(5);
  });

  it('keeps the streak alive in the morning: today is not logged yet but yesterday was', () => {
    // 11th to 14th logged, today is the 15th and nothing is in yet.
    expect(currentStreak(run('2026-10-11', 4), '2026-10-15')).toBe(4);
  });

  it('is 0 once a whole day has been missed', () => {
    expect(currentStreak(run('2026-10-11', 3), '2026-10-15')).toBe(0);
  });

  it('stops at a gap', () => {
    expect(currentStreak([...run('2026-10-01', 5), ...run('2026-10-12', 4)], '2026-10-15')).toBe(4);
  });

  it('is not capped at the 84 days the page loads', () => {
    // 200 days in a row, ending yesterday (14 Oct 2026).
    const long = run('2026-03-29', 200);
    expect(long.at(-1)).toBe('2026-10-14');
    expect(currentStreak(long, '2026-10-15')).toBe(200);
  });

  it('is 0 with nothing logged, and ignores duplicates and order', () => {
    expect(currentStreak([], '2026-10-15')).toBe(0);
    expect(currentStreak(['2026-10-14', '2026-10-15', '2026-10-14'], '2026-10-15')).toBe(2);
    expect(currentStreak(['2026-10-13', '2026-10-15', '2026-10-14'], '2026-10-15')).toBe(3);
  });
});

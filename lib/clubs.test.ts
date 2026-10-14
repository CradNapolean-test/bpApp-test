import { describe, expect, it } from 'vitest';
import { clubBadges, clubProgress } from './clubs';

describe('clubProgress', () => {
  it('counts up to the first club', () => {
    expect(clubProgress(0)).toEqual({ earned: 0, next: 100, toGo: 100, pct: 0 });
    expect(clubProgress(99)).toEqual({ earned: 0, next: 100, toGo: 1, pct: 99 });
  });
  it('resets to 0 the moment a club is reached', () => {
    expect(clubProgress(100)).toEqual({ earned: 1, next: 200, toGo: 100, pct: 0 });
    expect(clubProgress(101).pct).toBe(1);
    expect(clubProgress(250)).toEqual({ earned: 2, next: 300, toGo: 50, pct: 50 });
  });
});

describe('clubBadges', () => {
  it('marks reached clubs and keeps going past 500', () => {
    expect(clubBadges(100).filter((b) => b.reached).map((b) => b.n)).toEqual([100]);
    expect(clubBadges(650)).toHaveLength(7);
    expect(clubBadges(650)[6]).toEqual({ n: 700, reached: false });
  });
});

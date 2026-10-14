import { describe, expect, it } from 'vitest';
import { clubBadges, clubProgress } from './clubs';

describe('clubProgress', () => {
  it('starts as one stage towards the 100 club', () => {
    const p = clubProgress(40);
    expect(p).toMatchObject({ earned: [], next: 100, toGo: 60 });
    expect(p.segments).toEqual([{ from: 0, to: 100, widthPct: 100, fill: 0.4, reached: false }]);
  });
  it('does not drop back to zero at 100: the range grows to 250 and the first stage stays full', () => {
    const p = clubProgress(100);
    expect(p).toMatchObject({ earned: [100], next: 250, toGo: 150 });
    expect(p.segments.map((s) => [s.from, s.to, s.fill, s.reached])).toEqual([
      [0, 100, 1, true],
      [100, 250, 0, false],
    ]);
    expect(p.segments[0].widthPct).toBeCloseTo(40);
    expect(p.segments[1].widthPct).toBeCloseTo(60);
  });
  it('fills the current stage as sessions grow, and keeps earlier stages full', () => {
    const p = clubProgress(175);
    expect(p.segments[0].fill).toBe(1);
    expect(p.segments[1].fill).toBeCloseTo(0.5);
    expect(p.toGo).toBe(75);
  });
  it('moves on to 500, then every 500 after that', () => {
    expect(clubProgress(250)).toMatchObject({ earned: [100, 250], next: 500, toGo: 250 });
    expect(clubProgress(500)).toMatchObject({ earned: [100, 250, 500], next: 1000, toGo: 500 });
    expect(clubProgress(1234)).toMatchObject({ next: 1500, toGo: 266 });
  });
  it('stage widths always add up to the whole bar', () => {
    for (const n of [0, 99, 100, 249, 250, 499, 500, 1200]) {
      const total = clubProgress(n).segments.reduce((sum, s) => sum + s.widthPct, 0);
      expect(total).toBeCloseTo(100);
    }
  });
});

describe('clubBadges', () => {
  it('shows every fixed club, marks the reached ones and adds further clubs once past 500', () => {
    expect(clubBadges(120)).toEqual([
      { n: 100, reached: true },
      { n: 250, reached: false },
      { n: 500, reached: false },
    ]);
    expect(clubBadges(600).map((b) => b.n)).toEqual([100, 250, 500, 1000]);
    expect(clubBadges(600).filter((b) => b.reached).map((b) => b.n)).toEqual([100, 250, 500]);
  });
});

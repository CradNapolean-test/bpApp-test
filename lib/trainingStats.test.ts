import { describe, expect, it } from 'vitest';
import { estimate1RM, exerciseHistory, setVolume, weeklyVolume } from './trainingStats';

const set = (logged_at: string, actual_load: number | null, actual_reps: number | null, set_type = 'working') =>
  ({ logged_at, actual_load, actual_reps, set_type }) as never;
const TZ = 'Pacific/Auckland';

describe('setVolume', () => {
  it('is load x reps for working sets only', () => {
    expect(setVolume(set('2026-10-12T00:00:00Z', 100, 5))).toBe(500);
    expect(setVolume(set('2026-10-12T00:00:00Z', 60, 10, 'warmup'))).toBe(0);
    expect(setVolume(set('2026-10-12T00:00:00Z', null, 10))).toBe(0);
    expect(setVolume(set('2026-10-12T00:00:00Z', 0, 10))).toBe(0);
  });
});

describe('estimate1RM', () => {
  it('uses Epley, treats a single as itself, ignores very high reps', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1RM(100, 20)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
  });
});

describe('weeklyVolume', () => {
  it('sums by Monday-start week, zero-fills, and keeps the requested number of weeks', () => {
    const logs = [
      set('2026-10-12T20:00:00Z', 100, 5), // Tue 13 Oct NZ -> week of 12 Oct
      set('2026-10-14T01:00:00Z', 50, 10), // Wed 14 Oct NZ -> week of 12 Oct
      set('2026-10-05T01:00:00Z', 80, 5), // week of 5 Oct
    ];
    const w = weeklyVolume(logs, '2026-10-14', TZ, 3);
    expect(w.map((x) => x.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(w.map((x) => x.volume)).toEqual([0, 400, 1000]);
    expect(w[2].sets).toBe(2);
  });
  it('uses the member timezone for the day a set belongs to', () => {
    // 21:00 UTC Sunday 11 Oct is Monday 12 Oct 10am in NZ -> counts in the week of 12 Oct.
    const w = weeklyVolume([set('2026-10-11T21:00:00Z', 100, 1)], '2026-10-14', TZ, 2);
    expect(w[1]).toMatchObject({ weekStart: '2026-10-12', volume: 100 });
  });
});

describe('exerciseHistory', () => {
  it('groups by day, finds the top set and flags new bests', () => {
    const h = exerciseHistory(
      [
        set('2026-10-01T02:00:00Z', 100, 5),
        set('2026-10-01T02:10:00Z', 90, 8),
        set('2026-10-08T02:00:00Z', 95, 5), // lower than the 1st week's estimate -> not a PR
        set('2026-10-15T02:00:00Z', 105, 5), // PR
      ],
      TZ
    );
    expect(h.map((s) => s.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(h.map((s) => s.isPR)).toEqual([true, false, true]);
    expect(h[0]).toMatchObject({ topLoad: 100, topReps: 5, sets: 2, volume: 100 * 5 + 90 * 8 });
  });
  it('ignores warm-ups', () => {
    expect(exerciseHistory([set('2026-10-01T02:00:00Z', 40, 10, 'warmup')], TZ)).toEqual([]);
  });
  it('does not call the first session in a 90-day window a personal best when an older set was heavier (H5)', () => {
    const window = [set('2026-10-01T02:00:00Z', 100, 5), set('2026-10-15T02:00:00Z', 110, 5)];
    // Without the bests from before the window, the first session in it would read as a PR.
    expect(exerciseHistory(window, TZ).map((s) => s.isPR)).toEqual([true, true]);
    // The best set before the window scored 130 (an estimated 1RM): neither session beats it.
    expect(exerciseHistory(window, TZ, 130).map((s) => s.isPR)).toEqual([false, false]);
    // A prior best of 120 is beaten by the 110x5 session (estimated 128).
    expect(exerciseHistory(window, TZ, 120).map((s) => s.isPR)).toEqual([false, true]);
  });
});

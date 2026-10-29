import { describe, expect, it } from 'vitest';
import type { WorkoutLogRow } from '../data/types';
import { earlierLogs, isNewBest, lastSessionFor, lastSetFor, priorBestLoad, type ExerciseRef } from './workoutHistory';

const TZ = 'Pacific/Auckland';
const log = (over: Partial<WorkoutLogRow>): WorkoutLogRow => ({
  id: Math.random().toString(36).slice(2), client_id: 'c', exercise_id: 'e-old', exercise_library_id: null, set_number: 1,
  actual_reps: 8, actual_load: 40, actual_rpe: 7, set_type: 'working', logged_at: '2026-10-05T18:00:00Z', ...over,
});
const refs = new Map<string, ExerciseRef>([
  ['e-old', { name: 'Back Squat', exercise_library_id: null }],
  ['e-lib', { name: 'Squat (renamed)', exercise_library_id: 'lib-squat' }],
  ['e-other', { name: 'Bench Press', exercise_library_id: null }],
  ['e-now', { name: 'Back Squat', exercise_library_id: null }],
]);

describe('earlierLogs', () => {
  it('matches the same exercise by name (case and spacing insensitive) when there is no library entry', () => {
    const logs = [log({ exercise_id: 'e-old' }), log({ exercise_id: 'e-other' })];
    expect(earlierLogs(logs, refs, null, '  back squat ', 'e-now').map((l) => l.exercise_id)).toEqual(['e-old']);
  });

  it('matches by library entry even if the name changed', () => {
    const logs = [log({ exercise_id: 'e-lib' }), log({ exercise_id: 'e-other' })];
    expect(earlierLogs(logs, refs, 'lib-squat', 'Squat', 'e-now')).toHaveLength(1);
  });

  it('uses the library id stored on the log row itself, which survives a coach deleting the exercise', () => {
    const logs = [log({ exercise_id: 'gone', exercise_library_id: 'lib-squat' })];
    expect(earlierLogs(logs, refs, 'lib-squat', 'Squat', 'e-now')).toHaveLength(1);
  });

  it('excludes the exercise being logged now and anything that is not a working set', () => {
    const logs = [log({ exercise_id: 'e-now' }), log({ exercise_id: 'e-old', set_type: 'warmup' }), log({ exercise_id: 'e-old', set_type: 'working' })];
    expect(earlierLogs(logs, refs, null, 'Back Squat', 'e-now')).toHaveLength(1);
  });
});

describe('lastSessionFor', () => {
  it('is null with no earlier sets', () => {
    expect(lastSessionFor([], TZ, '2026-10-12')).toBeNull();
  });

  it('returns the sets of the most recent session only, in set order', () => {
    const earlier = [
      log({ exercise_id: 'old-week', set_number: 1, logged_at: '2026-09-28T18:00:00Z', actual_load: 35 }),
      log({ exercise_id: 'last-week', set_number: 2, logged_at: '2026-10-05T18:10:00Z', actual_load: 42.5 }),
      log({ exercise_id: 'last-week', set_number: 1, logged_at: '2026-10-05T18:05:00Z', actual_load: 40 }),
    ];
    const s = lastSessionFor(earlier, TZ, '2026-10-12')!;
    expect(s.sets.map((x) => x.actual_load)).toEqual([40, 42.5]);
    expect(s.loggedAt).toBe('2026-10-05T18:10:00Z');
  });

  it('labels a session 4 to 10 days ago "Last week" and anything else "Last time"', () => {
    const at = (iso: string) => [log({ logged_at: iso })];
    // 18:00Z on the 5th is 07:00 on the 6th in Auckland (NZDT, UTC+13)
    expect(lastSessionFor(at('2026-10-05T18:00:00Z'), TZ, '2026-10-12')?.label).toBe('Last week'); // 6 days
    expect(lastSessionFor(at('2026-10-09T18:00:00Z'), TZ, '2026-10-12')?.label).toBe('Last time'); // 2 days
    expect(lastSessionFor(at('2026-09-20T18:00:00Z'), TZ, '2026-10-12')?.label).toBe('Last time'); // 22 days
    expect(lastSessionFor(at('2026-10-01T18:00:00Z'), TZ, '2026-10-12')?.label).toBe('Last week'); // 10 days (the edge)
  });
});

describe('priorBestLoad and isNewBest', () => {
  it('is the heaviest earlier load, or null if there is none above zero', () => {
    expect(priorBestLoad([{ actual_load: 40 }, { actual_load: 45 }, { actual_load: null }])).toBe(45);
    expect(priorBestLoad([{ actual_load: 0 }, { actual_load: null }])).toBeNull();
    expect(priorBestLoad([])).toBeNull();
  });
  it('flags only a strictly heavier set, and never when there is no history', () => {
    expect(isNewBest(47.5, 45)).toBe(true);
    expect(isNewBest(45, 45)).toBe(false);
    expect(isNewBest(100, null)).toBe(false);
    expect(isNewBest(null, 45)).toBe(false);
  });
});

describe('lastSetFor', () => {
  const last = { sets: [log({ actual_reps: 10, actual_load: 40 }), log({ actual_reps: 9, actual_load: 42.5 })] };
  it('returns the same set number from last time, falling back to the last set when they did fewer', () => {
    expect(lastSetFor(last, 2)).toEqual({ reps: 9, load: 42.5 });
    expect(lastSetFor(last, 4)).toEqual({ reps: 9, load: 42.5 });
  });
  it('is null with no history', () => {
    expect(lastSetFor(null, 1)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { ClientExerciseMaxRow } from '../data/types';
import { latestMax, percentOfMaxKg } from './oneRepMax';

const max = (over: Partial<ClientExerciseMaxRow> = {}): ClientExerciseMaxRow => ({
  id: 'm', client_id: 'c', exercise_library_id: 'squat', tested_max: 100, reps: 1, is_estimated: false,
  tested_date: '2026-09-01', recorded_by: null, created_at: '2026-09-01T10:00:00Z', ...over,
});

describe('latestMax', () => {
  it('is null with no maxes, no library id, or no match', () => {
    expect(latestMax(undefined, 'squat')).toBeNull();
    expect(latestMax([max()], null)).toBeNull();
    expect(latestMax([max({ exercise_library_id: 'bench' })], 'squat')).toBeNull();
  });

  it('uses a true 1RM as is', () => {
    expect(latestMax([max({ tested_max: 120, reps: 1 })], 'squat')?.estimated1RM).toBe(120);
  });

  it('converts a rep max to an estimated 1RM with Epley: weight x (1 + reps/30)', () => {
    expect(latestMax([max({ tested_max: 100, reps: 3 })], 'squat')?.estimated1RM).toBeCloseTo(110, 6);
    expect(latestMax([max({ tested_max: 90, reps: 5 })], 'squat')?.estimated1RM).toBeCloseTo(105, 6);
    expect(latestMax([max({ tested_max: 60, reps: 10 })], 'squat')?.estimated1RM).toBeCloseTo(80, 6);
  });

  it('takes the most recent test, by date and then by when it was recorded', () => {
    const rows = [
      max({ id: 'old', tested_max: 100, tested_date: '2026-08-01' }),
      max({ id: 'new', tested_max: 110, tested_date: '2026-09-15' }),
      max({ id: 'same-day-later', tested_max: 115, tested_date: '2026-09-15', created_at: '2026-09-15T18:00:00Z' }),
    ];
    expect(latestMax(rows, 'squat')?.source.id).toBe('same-day-later');
  });

  it('ignores other exercises', () => {
    const rows = [max({ id: 'a', exercise_library_id: 'bench', tested_max: 200 }), max({ id: 'b', tested_max: 100 })];
    expect(latestMax(rows, 'squat')?.source.id).toBe('b');
  });
});

describe('percentOfMaxKg', () => {
  it('rounds percent of the estimated 1RM to the nearest kg', () => {
    const r = latestMax([max({ tested_max: 100, reps: 3 })], 'squat'); // 110
    expect(percentOfMaxKg(r, 80)).toBe(88);
    expect(percentOfMaxKg(r, 72.5)).toBe(80); // 79.75 -> 80
  });
  it('is null without a max or a percentage', () => {
    expect(percentOfMaxKg(null, 80)).toBeNull();
    expect(percentOfMaxKg(latestMax([max()], 'squat'), null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { bigDogCount, currentLevels, EXERCISES, tierForCount } from './bigDog';
import type { BigDogResultLike } from './bigDog';

const row = (exercise_key: string, level: BigDogResultLike['level'], tested_date: string, created_at = tested_date): BigDogResultLike => ({
  exercise_key, level, tested_date, created_at,
});

describe('tierForCount', () => {
  it('maps counts to T-shirt tiers at the boundaries', () => {
    expect(tierForCount(0)).toBe('none');
    expect(tierForCount(1)).toBe('white');
    expect(tierForCount(2)).toBe('white');
    expect(tierForCount(3)).toBe('turquoise');
    expect(tierForCount(5)).toBe('turquoise');
    expect(tierForCount(6)).toBe('silver');
    expect(tierForCount(EXERCISES.length - 1)).toBe('silver');
    expect(tierForCount(EXERCISES.length)).toBe('gold');
  });
});

describe('currentLevels / bigDogCount', () => {
  it('uses the most recent result per exercise', () => {
    const results = [
      row('deadlift', 'strong', '2026-01-01'),
      row('deadlift', 'big_dog', '2026-03-01'),
      row('back_squat', 'big_dog', '2026-01-01'),
      row('back_squat', 'strong', '2026-02-01'),
    ];
    expect(currentLevels(results).deadlift.level).toBe('big_dog');
    expect(currentLevels(results).back_squat.level).toBe('strong');
    expect(bigDogCount(results)).toBe(1);
  });
  it('breaks same-day ties by created_at, and a "none" row clears an exercise', () => {
    const results = [
      row('dead_hang', 'big_dog', '2026-05-01', '2026-05-01T09:00:00Z'),
      row('dead_hang', 'none', '2026-05-01', '2026-05-01T10:00:00Z'),
    ];
    expect(bigDogCount(results)).toBe(0);
  });
  it('ignores unknown exercise keys', () => {
    expect(bigDogCount([row('not_a_real_exercise', 'big_dog', '2026-01-01')])).toBe(0);
  });
});

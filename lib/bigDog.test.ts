import { describe, expect, it } from 'vitest';
import { showStandard, bestResult, bigDogCount, tiersReached, currentLevels, EXERCISES, formatResult, levelForResult, nextTarget, parseResultInput, tierForCount } from './bigDog';
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


const ex = (key: string) => EXERCISES.find((e) => e.key === key)!;

describe('levelForResult', () => {
  it('weights: matching a standard counts, just under does not', () => {
    expect(levelForResult(ex('deadlift'), 'male', 160)).toBe('big_dog');
    expect(levelForResult(ex('deadlift'), 'male', 159.5)).toBe('strong');
    expect(levelForResult(ex('deadlift'), 'male', 120)).toBe('strong');
    expect(levelForResult(ex('deadlift'), 'male', 80)).toBe('rookie');
    expect(levelForResult(ex('deadlift'), 'male', 79)).toBe('none');
    expect(levelForResult(ex('deadlift'), 'female', 110)).toBe('big_dog');
    expect(levelForResult(ex('deadlift'), 'female', 84)).toBe('rookie');
  });
  it('chin-ups: banded is already Rookie, and the targets differ by sex', () => {
    expect(levelForResult(ex('chin_ups'), 'male', 0)).toBe('rookie');
    expect(levelForResult(ex('chin_ups'), 'male', 4)).toBe('rookie');
    expect(levelForResult(ex('chin_ups'), 'male', 5)).toBe('strong');
    expect(levelForResult(ex('chin_ups'), 'male', 12)).toBe('big_dog');
    expect(levelForResult(ex('chin_ups'), 'female', 1)).toBe('strong');
    expect(levelForResult(ex('chin_ups'), 'female', 3)).toBe('big_dog');
  });
  it('holds are higher-is-better, in seconds', () => {
    expect(levelForResult(ex('dead_hang'), 'male', 150)).toBe('big_dog');
    expect(levelForResult(ex('dead_hang'), 'male', 105)).toBe('strong');
    expect(levelForResult(ex('dead_hang'), 'male', 60)).toBe('rookie');
    expect(levelForResult(ex('dead_hang'), 'male', 59)).toBe('none');
  });
  it('races are lower-is-better and a time exactly on the line counts', () => {
    expect(levelForResult(ex('row_2000'), 'male', 7 * 60 + 19)).toBe('big_dog');
    expect(levelForResult(ex('row_2000'), 'male', 7 * 60 + 20)).toBe('big_dog'); // exactly 7:20 is Big Dog
    expect(levelForResult(ex('row_2000'), 'male', 7 * 60 + 21)).toBe('strong');
    expect(levelForResult(ex('row_2000'), 'male', 8 * 60 + 30)).toBe('strong'); // exactly 8:30 is Strong
    expect(levelForResult(ex('row_2000'), 'male', 8 * 60 + 31)).toBe('rookie');
    expect(levelForResult(ex('row_2000'), 'male', 9 * 60 + 10)).toBe('rookie'); // exactly 9:10 is Rookie
    expect(levelForResult(ex('row_2000'), 'male', 9 * 60 + 11)).toBe('none');
    expect(levelForResult(ex('ski_2000'), 'female', 9 * 60 + 44)).toBe('big_dog');
  });
  it('distances: matching the standard counts (the owners: exactly 1,100m on the rower is Strong, not Rookie)', () => {
    expect(levelForResult(ex('rower_30_30'), 'male', 1210)).toBe('big_dog');
    expect(levelForResult(ex('rower_30_30'), 'male', 1209)).toBe('strong');
    expect(levelForResult(ex('rower_30_30'), 'male', 1100)).toBe('strong');
    expect(levelForResult(ex('rower_30_30'), 'male', 1099)).toBe('rookie');
    expect(levelForResult(ex('rower_30_30'), 'male', 960)).toBe('rookie');
    expect(levelForResult(ex('rower_30_30'), 'male', 959)).toBe('none');
    expect(levelForResult(ex('rower_30_30'), 'female', 1150)).toBe('big_dog');
    expect(levelForResult(ex('farmer_carries'), 'male', 250)).toBe('big_dog');
  });
});

describe('parseResultInput / formatResult', () => {
  it('reads what members type', () => {
    expect(parseResultInput('weight', '142.5')).toBe(142.5);
    expect(parseResultInput('weight', '142kg')).toBe(142);
    expect(parseResultInput('weight', '0')).toBeNull();
    expect(parseResultInput('time', '8:42')).toBe(522);
    expect(parseResultInput('time', '8:4')).toBe(484);
    expect(parseResultInput('time', 'abc')).toBeNull();
    expect(parseResultInput('hold', '1:45')).toBe(105);
    expect(parseResultInput('reps', 'banded')).toBe(0);
    expect(parseResultInput('reps', '5')).toBe(5);
    expect(parseResultInput('reps', '5.5')).toBeNull();
    expect(parseResultInput('distance', '1210m')).toBe(1210);
    expect(parseResultInput('distance', '')).toBeNull();
  });
  it('formats them back', () => {
    expect(formatResult('weight', 142.5)).toBe('142.5kg');
    expect(formatResult('time', 522)).toBe('8:42');
    expect(formatResult('reps', 0)).toBe('Banded');
    expect(formatResult('reps', 5)).toBe('5 BW');
    expect(formatResult('distance', 1210)).toBe('1210m');
  });
});

describe('nextTarget', () => {
  it('says how far to the next level', () => {
    expect(nextTarget(ex('deadlift'), 'male', 'strong', 150)).toEqual({ level: 'big_dog', label: '160kg', gap: '10kg more' });
    expect(nextTarget(ex('row_2000'), 'male', 'strong', 8 * 60 + 10)?.gap).toBe('0:50 faster');
    expect(nextTarget(ex('chin_ups'), 'male', 'rookie', 3)?.gap).toBe('2 reps more');
    expect(nextTarget(ex('deadlift'), 'male', 'big_dog', 170)).toBeNull();
  });
});

describe('self-logged scores', () => {
  it('never count towards the T-shirt tier, and the best result follows the direction', () => {
    const mine = { ...row('deadlift', 'big_dog', '2026-05-01'), self_reported: true, result_value: 165 };
    const coach = { ...row('back_squat', 'big_dog', '2026-05-01'), self_reported: false };
    expect(bigDogCount([mine, coach])).toBe(1);
    const a = { ...row('row_2000', 'strong', '2026-05-01'), result_value: 500 };
    const b = { ...row('row_2000', 'big_dog', '2026-06-01'), result_value: 430 };
    expect(bestResult([a, b], ex('row_2000'))?.result_value).toBe(430);
    expect(bestResult([{ ...mine, result_value: 150 }, mine], ex('deadlift'))?.result_value).toBe(165);
  });
});

describe('the 12 exercises', () => {
  it('no longer includes the 5000m run, and Gold needs all 12', () => {
    expect(EXERCISES).toHaveLength(12);
    expect(EXERCISES.some((e) => e.key === 'run_5000')).toBe(false);
    expect(tierForCount(12)).toBe('gold');
    expect(tierForCount(11)).toBe('silver');
  });
  it('old run results are ignored rather than counted', () => {
    expect(bigDogCount([row('run_5000', 'big_dog', '2026-01-01')])).toBe(0);
  });
});

// ---- Scoring audit: every exercise, both sexes, every boundary ----------------------------------------
// Reads each standard back out of its display text ("160kg", "7:20", "1210m", "2:30", "Banded", "5 BW") with a
// separate, simple parser, then checks levelForResult on both sides of every boundary. Every boundary is inclusive: matching a standard earns it. A typo in the standards
// table (a level that is easier than the one below it) fails here too.

type Parsed = { n: number };
function readStandard(text: string): Parsed {
  const t = text.replace(/kg|m|BW/i, '').trim();
  if (/banded/i.test(text)) return { n: 0 };
  const clock = t.match(/^(\d+):(\d{2})$/);
  return { n: clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number(t) };
}

describe.each(EXERCISES.flatMap((e) => (['male', 'female'] as const).map((g) => [e.key, g] as const)))('%s (%s)', (key, gender) => {
  const exercise = ex(key);
  const s = exercise[gender];
  const [rookie, strong, bigDog] = [readStandard(s.rookie), readStandard(s.strong), readStandard(s.bigDog)];
  const lowerIsBetter = exercise.kind === 'time';
  // One unit beyond a threshold in the "harder" direction / in the "easier" direction.
  const harder = (n: number) => (lowerIsBetter ? n - 1 : n + 1);
  const easier = (n: number) => (lowerIsBetter ? n + 1 : n - 1);

  it('has standards that get harder: rookie, then strong, then big dog', () => {
    if (lowerIsBetter) {
      expect(strong.n).toBeLessThan(rookie.n);
      expect(bigDog.n).toBeLessThan(strong.n);
    } else {
      expect(strong.n).toBeGreaterThan(rookie.n);
      expect(bigDog.n).toBeGreaterThan(strong.n);
    }
  });

  it('scores a result at, just past and just short of each standard correctly', () => {
    const levelAt = (v: number) => levelForResult(exercise, gender, v);
    // Big Dog
    expect(levelAt(harder(bigDog.n))).toBe('big_dog');
    expect(levelAt(bigDog.n)).toBe('big_dog');
    // Strong
    expect(levelAt(strong.n)).toBe('strong');
    expect(levelAt(easier(bigDog.n))).not.toBe('big_dog');
    // Rookie
    expect(levelAt(rookie.n)).toBe('rookie');
    expect(levelAt(harder(rookie.n))).not.toBe('none');
    // Below rookie (chin-ups: any rep count, including banded 0, is at least rookie)
    if (exercise.kind !== 'reps') expect(levelAt(easier(rookie.n))).toBe('none');
  });
});

describe('scoring edge cases', () => {
  it('a result of exactly 0 is only valid for banded chin-ups', () => {
    expect(parseResultInput('weight', '0')).toBeNull();
    expect(parseResultInput('time', '0:00')).toBeNull();
    expect(parseResultInput('reps', '0')).toBe(0);
    expect(parseResultInput('reps', 'banded')).toBe(0);
  });
  it('reads clock times as seconds', () => {
    expect(parseResultInput('time', '7:19')).toBe(439);
    expect(parseResultInput('time', '439')).toBe(439);
    expect(parseResultInput('hold', '2:30')).toBe(150);
  });
  it('rejects nonsense', () => {
    expect(parseResultInput('weight', 'abc')).toBeNull();
    expect(parseResultInput('reps', '2.5')).toBeNull();
    expect(parseResultInput('weight', '-5')).toBeNull();
  });
});

describe('tiersReached', () => {
  it('lists every shirt earned so far', () => {
    expect(tiersReached(0)).toEqual([]);
    expect(tiersReached(1)).toEqual(['white']);
    expect(tiersReached(3)).toEqual(['white', 'turquoise']);
    expect(tiersReached(6)).toEqual(['white', 'turquoise', 'silver']);
    expect(tiersReached(EXERCISES.length)).toEqual(['white', 'turquoise', 'silver', 'gold']);
  });
});

describe('showStandard', () => {
  it('writes race standards as "or faster" and leaves the rest alone', () => {
    expect(showStandard('time', '7:20')).toBe('7:20 or faster');
    expect(showStandard('distance', '1100m')).toBe('1100m');
    expect(showStandard('weight', '160kg')).toBe('160kg');
  });
});

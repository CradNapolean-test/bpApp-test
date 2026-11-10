import { describe, expect, it } from 'vitest';
import { PART_DAY_KCAL_NO_TARGET, calorieTone, proteinTone, splitFoodDays } from './weekFood';

const day = (log_date: string, kcal: number) => ({ log_date, kcal });
const kcalOf = (d: { kcal: number }) => d.kcal;

describe('full days for the Overview averages (NU25)', () => {
  // Graham, Thursday 5 Nov: one full day, a shake-only day and today's half day; target 2,450.
  const week = [day('2026-11-02', 2047), day('2026-11-03', 139), day('2026-11-05', 640)];

  it('leaves out today and a shake-only day', () => {
    const s = splitFoodDays(week, '2026-11-05', '2026-11-02', 2450, kcalOf);
    expect(s.full.map((d) => d.log_date)).toEqual(['2026-11-02']);
    expect(s.part.map((d) => d.log_date)).toEqual(['2026-11-03']);
    expect(s.completedDays).toBe(3);
  });

  it('counts a low but real day of eating', () => {
    const s = splitFoodDays([day('2026-11-02', 1300)], '2026-11-03', '2026-11-02', 2450, kcalOf);
    expect(s.full).toHaveLength(1);
  });

  it('uses half the calorie floor when there is no target', () => {
    const s = splitFoodDays([day('2026-11-02', PART_DAY_KCAL_NO_TARGET - 1), day('2026-11-03', PART_DAY_KCAL_NO_TARGET)], '2026-11-04', '2026-11-02', null, kcalOf);
    expect(s.part.map((d) => d.log_date)).toEqual(['2026-11-02']);
    expect(s.full.map((d) => d.log_date)).toEqual(['2026-11-03']);
  });

  it('has no completed days on a Monday, and 7 once the week is over', () => {
    expect(splitFoodDays([day('2026-11-02', 2000)], '2026-11-02', '2026-11-02', 2000, kcalOf)).toMatchObject({ full: [], completedDays: 0 });
    expect(splitFoodDays([], '2026-11-12', '2026-11-02', 2000, kcalOf).completedDays).toBe(7);
  });
});

describe('colour against target (CL13, DB11)', () => {
  it('calories: green within 10%, amber within 20%, red beyond, either side', () => {
    expect(calorieTone(1892, 1892)).toBe('green');
    expect(calorieTone(2080, 1892)).toBe('green');
    expect(calorieTone(1682, 1892)).toBe('amber');
    expect(calorieTone(2250, 1892)).toBe('amber');
    expect(calorieTone(986, 2450)).toBe('red');
    expect(calorieTone(2500, 1892)).toBe('red');
  });

  it('protein: green at 90% or more (over is fine), amber at 75%, red under', () => {
    expect(proteinTone(160, 140)).toBe('green');
    expect(proteinTone(126, 140)).toBe('green');
    expect(proteinTone(110, 140)).toBe('amber');
    expect(proteinTone(90, 140)).toBe('red');
  });

  it('no colour without a target', () => {
    expect(calorieTone(1500, 0)).toBeNull();
    expect(proteinTone(100, 0)).toBeNull();
  });
});

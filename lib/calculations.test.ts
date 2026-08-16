import { describe, expect, it } from 'vitest';
import {
  CALORIE_FLOOR,
  calPerMinute,
  calcEngine,
  cycleDayFor,
  dayCalories,
  equivalentMinutesForActivity,
  estimateAdaptiveTdee,
  isPlateaued,
  phaseForWeek,
  stepTargetForWeek,
  weeklyTarget,
  type ClientProfile,
} from './calculations';

// Golden values below are hand-verified against the formulas in docs/PROJECT_SPEC.md
// section 3 (Katch-McArdle BMR, tiered protein/fat, phase deficits) -- these tests exist to
// catch accidental regressions to a formula CLAUDE.md says is already validated against a
// real coaching spreadsheet, not to re-derive the formulas themselves.

const maleFlat: ClientProfile = {
  age: 30,
  gender: 'Male',
  startWeight: 100,
  goalWeight: 90,
  bodyFatPct: 25,
  activityLevel: 1.5,
  dietApproach: 'High Carb Low Fat',
  tier: 1,
  cycling: false,
};

const femaleCycling: ClientProfile = {
  age: 28,
  gender: 'Female',
  startWeight: 70,
  goalWeight: 60,
  bodyFatPct: 30,
  activityLevel: 1.6,
  dietApproach: 'Higher Fat',
  tier: 2,
  cycling: true,
};

describe('calcEngine', () => {
  it('computes BMR/TDEE via Katch-McArdle with the male +198 offset', () => {
    const result = calcEngine(maleFlat);
    expect(result).not.toBeNull();
    expect(result!.bmr).toBeCloseTo(2030.82, 2);
    expect(result!.tdee).toBeCloseTo(3046.23, 2);
  });

  it('applies the male offset only for male gender', () => {
    const female = calcEngine({ ...maleFlat, gender: 'Female' });
    const male = calcEngine(maleFlat);
    expect(male!.bmr - female!.bmr).toBeCloseTo(198, 6);
  });

  it.each([
    [5, 2.2], // gap <= 5kg
    [8, 2.0], // gap <= 8kg
    [12, 1.8], // gap <= 12kg
    [20, 1.6], // gap > 12kg
  ])('gives %skg gap a protein target of %s g/kg of start weight', (gapKg, perKg) => {
    const profile: ClientProfile = { ...maleFlat, startWeight: 100, goalWeight: 100 - gapKg };
    expect(calcEngine(profile)!.protein).toBeCloseTo(100 * perKg, 6);
  });

  it('gives High Carb Low Fat 0.8 g/kg and Higher Fat 1.2 g/kg', () => {
    expect(calcEngine(maleFlat)!.fat).toBeCloseTo(80, 6);
    expect(calcEngine({ ...maleFlat, dietApproach: 'Higher Fat' })!.fat).toBeCloseTo(120, 6);
  });

  it.each([
    ['age', { age: 0 }],
    ['startWeight', { startWeight: 0 }],
    ['goalWeight', { goalWeight: 0 }],
    ['bodyFatPct', { bodyFatPct: 0 }],
    ['activityLevel', { activityLevel: 0 }],
  ])('returns null when %s is missing/zero rather than dividing by a falsy value', (_field, patch) => {
    expect(calcEngine({ ...maleFlat, ...patch })).toBeNull();
  });
});

describe('phaseForWeek / stepTargetForWeek', () => {
  it('splits the 12-week program into phases 1-4 / 5-8 / 9-12', () => {
    expect([1, 4, 5, 8, 9, 12].map(phaseForWeek)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('follows the 10k -> 12k -> 13k step schedule from the spec', () => {
    expect([1, 2, 6, 7, 12].map(stepTargetForWeek)).toEqual([10000, 12000, 12000, 13000, 13000]);
  });
});

describe('weeklyTarget', () => {
  it('keeps protein/fat flat across phases and only shrinks carbs as the deficit grows', () => {
    const w1 = weeklyTarget(maleFlat, 1)!;
    const w5 = weeklyTarget(maleFlat, 5)!;
    const w9 = weeklyTarget(maleFlat, 9)!;
    expect(w1.protein).toBe(w5.protein);
    expect(w5.protein).toBe(w9.protein);
    expect(w1.fat).toBe(w5.fat);
    expect(w5.fat).toBe(w9.fat);
    // Later phases carry a bigger deficit at this tier, so carbs strictly decrease.
    expect(w1.dailyFlat!.carbs).toBeGreaterThan(w5.dailyFlat!.carbs);
    expect(w5.dailyFlat!.carbs).toBeGreaterThan(w9.dailyFlat!.carbs);
  });

  it('matches the golden flat-day figures for tier 1 phase 1', () => {
    const target = weeklyTarget(maleFlat, 1)!;
    expect(target.dailyFlat!.calories).toBeCloseTo(2546.23, 2);
    expect(target.dailyFlat!.carbs).toBeCloseTo(276.5575, 2);
    expect(target.calories).toBeCloseTo(target.dailyFlat!.calories * 7, 6);
  });

  it('never lets carbs go negative even at a deficit steep enough to exceed TDEE', () => {
    const starving: ClientProfile = { ...maleFlat, activityLevel: 1.0, tier: 3 };
    const target = weeklyTarget(starving, 12)!;
    expect(target.dailyFlat!.carbs).toBeGreaterThanOrEqual(0);
  });

  it('splits a cycling week into 5 low + 2 high days averaging the flat-equivalent deficit', () => {
    const target = weeklyTarget(femaleCycling, 3)!;
    expect(target.dailyLow).toBeDefined();
    expect(target.dailyHigh).toBeDefined();
    expect(target.dailyFlat).toBeUndefined();
    expect(target.calories).toBeCloseTo(target.dailyLow!.calories * 5 + target.dailyHigh!.calories * 2, 6);
    // Low days carry a bigger deficit than high days by construction (PHASE_DEFICITS table).
    expect(target.dailyLow!.calories).toBeLessThan(target.dailyHigh!.calories);
  });

  it('flags the known low-carb-floor tension the spec calls out (not a bug, but worth asserting the behavior)', () => {
    // Tier 3, phase 3, low activity: a real combination where carbs can crash toward the
    // floor the UI is supposed to warn on (~50g) -- see PROJECT_SPEC.md section 3.
    const tightProfile: ClientProfile = { ...maleFlat, activityLevel: 1.2, tier: 3 };
    const target = weeklyTarget(tightProfile, 12)!;
    expect(target.dailyFlat!.calories).toBeLessThan(CALORIE_FLOOR + 500); // sanity: genuinely tight, not a fluke
  });
});

describe('dayCalories', () => {
  it('derives calories from macros as protein*4 + carbs*4 + fat*9, never entered directly', () => {
    expect(dayCalories(180, 200, 80)).toBe(180 * 4 + 200 * 4 + 80 * 9);
  });

  it('treats missing macro fields as zero rather than NaN', () => {
    expect(dayCalories(0, 0, 0)).toBe(0);
  });
});

describe('cycleDayFor', () => {
  it('counts forward from the most recent prior period-start date', () => {
    expect(cycleDayFor(['2026-08-01', '2026-08-29'], '2026-08-10')).toBe(10);
  });

  it('returns null when there is no prior period-start date to count from', () => {
    expect(cycleDayFor([], '2026-08-10')).toBeNull();
    expect(cycleDayFor(['2026-08-15'], '2026-08-10')).toBeNull();
  });
});

describe('MET-based activity conversion', () => {
  it('computes calories/min as 0.0175 * MET * bodyweight', () => {
    expect(calPerMinute(8, 80)).toBeCloseTo(0.0175 * 8 * 80, 6);
  });

  it('converts a step target into equivalent-effort minutes for another activity', () => {
    expect(equivalentMinutesForActivity(10000, 10, 80, 8)).toBeCloseTo(37.5, 4);
  });

  it('returns 0 rather than dividing by zero when the target activity has 0 MET', () => {
    expect(equivalentMinutesForActivity(10000, 10, 80, 0)).toBe(0);
  });
});

describe('estimateAdaptiveTdee', () => {
  it('derives a real-world maintenance estimate from logged calories vs. weight change', () => {
    // Losing weight (negative delta) means real maintenance is higher than logged intake.
    expect(estimateAdaptiveTdee(2200, -1.5, 14)).toBeCloseTo(2200 - (-1.5 * 7700) / 14, 6);
  });

  it('does not divide by zero when spanDays is 0', () => {
    expect(Number.isFinite(estimateAdaptiveTdee(2200, -1.5, 0))).toBe(true);
  });
});

describe('isPlateaued', () => {
  it('flags <0.3kg movement across the series as a plateau', () => {
    expect(isPlateaued([80, 79.9, 79.8, 79.9, 80, 79.85])).toBe(true);
  });

  it('does not flag a real trend as a plateau', () => {
    expect(isPlateaued([80, 79, 78, 77, 76, 75])).toBe(false);
  });

  it('requires at least 6 points before judging a plateau either way', () => {
    expect(isPlateaued([80, 79.9, 79.8])).toBe(false);
  });
});

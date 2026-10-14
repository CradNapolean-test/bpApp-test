import { describe, expect, it } from 'vitest';
import {
  CALORIE_FLOOR,
  dailyAdjustment,
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
  goal: 'fat_loss',
  setting: 'steady',
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
  goal: 'fat_loss',
  setting: 'moderate',
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

  it('gives High Carb Low Fat 20% of calories and Higher Fat 35%, with 0.5 g/kg fat and 1 g/kg carb minimums', () => {
    const low = calcEngine(maleFlat)!;
    expect(low.fatPct).toBeCloseTo(0.2, 6);
    expect(calcEngine({ ...maleFlat, dietApproach: 'Higher Fat' })!.fatPct).toBeCloseTo(0.35, 6);
    expect(low.fatMin).toBeCloseTo(50, 6);
    expect(low.carbMin).toBeCloseTo(100, 6);
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

describe('dailyAdjustment', () => {
  it('turns a % of bodyweight per week into a daily deficit at 3,500 kcal/lb', () => {
    // 75kg x 0.5% = 0.375kg/week = 0.827lb/week -> ~413 kcal/day
    expect(dailyAdjustment('fat_loss', 'steady', 75)).toBeCloseTo(-413.4, 0);
    expect(dailyAdjustment('fat_loss', 'moderate', 75)).toBeCloseTo(-620.1, 0);
    expect(dailyAdjustment('fat_loss', 'aggressive', 75)).toBeCloseTo(-826.8, 0);
  });

  it('turns a % of bodyweight per month into a daily surplus', () => {
    // Pyramid table: 82kg at 1%/month ~ 200 kcal/day
    expect(dailyAdjustment('muscle_gain', 'moderate', 82)).toBeCloseTo(211, 0);
    expect(dailyAdjustment('muscle_gain', 'steady', 82)).toBeCloseTo(105.5, 0);
    expect(dailyAdjustment('muscle_gain', 'aggressive', 82)).toBeCloseTo(316.4, 0);
  });

  it('scales with bodyweight', () => {
    expect(dailyAdjustment('fat_loss', 'steady', 100)).toBeCloseTo(dailyAdjustment('fat_loss', 'steady', 50) * 2, 6);
  });
});

describe('weeklyTarget', () => {
  it('uses the same rate every week; only the phase label changes', () => {
    const w1 = weeklyTarget(maleFlat, 1)!;
    const w9 = weeklyTarget(maleFlat, 9)!;
    expect(w1.phase).toBe(1);
    expect(w9.phase).toBe(3);
    expect(w9.dailyFlat).toEqual(w1.dailyFlat);
  });

  it('matches the golden flat-day figures for fat loss, steady', () => {
    const target = weeklyTarget(maleFlat, 1)!;
    const day = target.dailyFlat!;
    const cals = 3046.23 + dailyAdjustment('fat_loss', 'steady', 100);
    expect(day.calories).toBeCloseTo(cals, 1);
    expect(day.protein).toBeCloseTo(180, 6);
    expect(day.fat).toBeCloseTo((cals * 0.2) / 9, 1);
    expect(day.carbs).toBeCloseTo((cals - 720 - day.fat * 9) / 4, 1);
    expect(day.floorApplied).toBe(false);
    expect(target.calories).toBeCloseTo(day.calories * 7, 6);
  });

  it('gives a bigger deficit, and so fewer carbs, at each step up', () => {
    const at = (setting: ClientProfile['setting']) => weeklyTarget({ ...maleFlat, setting }, 1)!.dailyFlat!;
    expect(at('steady').calories).toBeGreaterThan(at('moderate').calories);
    expect(at('moderate').calories).toBeGreaterThan(at('aggressive').calories);
    expect(at('steady').carbs).toBeGreaterThan(at('aggressive').carbs);
  });

  it('puts muscle gain above maintenance with 2.2 g/kg protein and 25% fat', () => {
    const gain: ClientProfile = { ...maleFlat, goal: 'muscle_gain', setting: 'moderate' };
    const engine = calcEngine(gain)!;
    const day = weeklyTarget(gain, 1)!.dailyFlat!;
    expect(day.calories).toBeCloseTo(engine.tdee + dailyAdjustment('muscle_gain', 'moderate', 100), 1);
    expect(day.calories).toBeGreaterThan(engine.tdee);
    expect(day.protein).toBeCloseTo(220, 6);
    expect(day.fat).toBeCloseTo((day.calories * 0.25) / 9, 1);
  });

  it('raises calories rather than letting carbs fall under 1 g/kg, and flags it', () => {
    // 75kg, 22% BF, sedentary, aggressive: the old tier-3 engine gave 0g carbs here.
    const p: ClientProfile = { ...maleFlat, age: 35, startWeight: 75, goalWeight: 70, bodyFatPct: 22, activityLevel: 1.2, setting: 'aggressive' };
    const day = weeklyTarget(p, 1)!.dailyFlat!;
    expect(day.floorApplied).toBe(true);
    expect(day.carbs).toBeCloseTo(75, 6);
    expect(day.calories).toBeCloseTo(day.protein * 4 + day.fat * 9 + day.carbs * 4, 6);
  });

  it('never lets carbs go negative or fat/carbs under their minimums', () => {
    const tight: ClientProfile = { ...maleFlat, activityLevel: 1.0, setting: 'aggressive' };
    const day = weeklyTarget(tight, 12)!.dailyFlat!;
    expect(day.fat).toBeGreaterThanOrEqual(50 - 1e-9);
    expect(day.carbs).toBeGreaterThanOrEqual(100 - 1e-9);
    expect(CALORIE_FLOOR).toBeGreaterThan(0);
  });

  it('splits a cycling week into 5 low + 2 high days that average to the flat target', () => {
    const cycling = weeklyTarget(femaleCycling, 3)!;
    const flat = weeklyTarget({ ...femaleCycling, cycling: false }, 3)!;
    expect(cycling.dailyLow).toBeDefined();
    expect(cycling.dailyHigh).toBeDefined();
    expect(cycling.dailyFlat).toBeUndefined();
    expect(cycling.calories).toBeCloseTo(cycling.dailyLow!.calories * 5 + cycling.dailyHigh!.calories * 2, 6);
    expect(cycling.dailyLow!.calories).toBeLessThan(cycling.dailyHigh!.calories);
    if (!cycling.floorApplied) expect(cycling.calories).toBeCloseTo(flat.calories, 4);
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

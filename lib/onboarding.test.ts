import { describe, expect, it } from 'vitest';
import { ageFromDob, buildOnboardingPlan, estimateBodyFat } from './onboarding';

describe('onboarding', () => {
  it('works out age from date of birth', () => {
    expect(ageFromDob('1990-03-14', new Date('2026-03-13T12:00:00Z'))).toBe(35);
    expect(ageFromDob('1990-03-14', new Date('2026-03-14T12:00:00Z'))).toBe(36);
    expect(ageFromDob('nonsense')).toBeNull();
  });

  it('estimates body fat from BMI, age and sex and keeps it in a sane range', () => {
    // BMI 27.7, age 35, female: 1.2*27.7 + 0.23*35 - 5.4 = 35.9
    expect(estimateBodyFat(170, 80, 35, 'Female')).toBeCloseTo(35.9, 1);
    expect(estimateBodyFat(170, 80, 35, 'Male')).toBeCloseTo(25.1, 1);
    expect(estimateBodyFat(200, 40, 20, 'Male')).toBe(5);
  });

  it('builds a starting plan and flags an estimated body fat', () => {
    const plan = buildOnboardingPlan({
      gender: 'Female', age: 35, startWeight: 80, goalWeight: 70, heightCm: 170,
      activityLevel: 1.5, bodyFatPct: null, hasHealthNotes: false,
    });
    expect(plan).not.toBeNull();
    expect(plan!.bodyFatEstimated).toBe(true);
    expect(plan!.reasons).toContain('Body fat was estimated, not measured');
    expect(plan!.calories).toBeGreaterThan(1200);
    // calories line up with the macros
    expect(Math.abs(plan!.protein * 4 + plan!.carbs * 4 + plan!.fat * 9 - plan!.calories)).toBeLessThan(25);
  });

  it('uses a measured body fat and flags unusual goals', () => {
    const plan = buildOnboardingPlan({
      gender: 'Male', age: 40, startWeight: 90, goalWeight: 92, heightCm: 180,
      activityLevel: 1.35, bodyFatPct: 22, hasHealthNotes: true,
    });
    expect(plan!.bodyFatEstimated).toBe(false);
    expect(plan!.bodyFatPct).toBe(22);
    expect(plan!.reasons).toContain('Goal weight is not below start weight');
    expect(plan!.reasons).toContain('Health or injury notes added');
  });
});

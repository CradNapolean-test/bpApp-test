import { describe, expect, it } from 'vitest';
import { ageFromDob, ageProblem, buildOnboardingPlan, estimateBodyFat, isActivityLevel, isMissingColumnError, needsBodyStep, targetsHeldBack } from './onboarding';

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

describe('who can sign up, and who sees a target (M8, D18, D6)', () => {
  it('turns away anyone under 16 with a message that points to the coach', () => {
    expect(ageProblem(15)).toBe('Please ask your coach to set up your account.');
    expect(ageProblem(16)).toBeNull();
    expect(ageProblem(40)).toBeNull();
    expect(ageProblem(100)).toBeNull();
  });

  it('refuses an age that cannot be right', () => {
    expect(ageProblem(null)).toBe('Please check your date of birth.');
    expect(ageProblem(101)).toBe('Please check your date of birth.');
    expect(ageProblem(-1)).toBe('Please check your date of birth.');
  });

  it('only accepts the activity levels the form offers', () => {
    expect(isActivityLevel(1.2)).toBe(true);
    expect(isActivityLevel(1.75)).toBe(true);
    expect(isActivityLevel(3)).toBe(false);
    expect(isActivityLevel(0.1)).toBe(false);
  });

  it('holds back targets from a member whose plan is waiting for their coach, but never from the coach', () => {
    expect(targetsHeldBack({ needs_coach_review: true }, false)).toBe(true);
    expect(targetsHeldBack({ needs_coach_review: true }, true)).toBe(false);
    expect(targetsHeldBack({ needs_coach_review: false }, false)).toBe(false);
    expect(targetsHeldBack({}, false)).toBe(false);
    expect(targetsHeldBack(null, false)).toBe(false);
  });

  it('flags a starting or goal weight under a BMI of 18.5', () => {
    const base = { gender: 'Female' as const, age: 30, heightCm: 170, activityLevel: 1.5, bodyFatPct: 25, hasHealthNotes: false };
    // 170 cm at 52 kg is a BMI of 18.0.
    const light = buildOnboardingPlan({ ...base, startWeight: 52, goalWeight: 50 });
    expect(light!.reasons).toContain('Starting BMI is under 18.5');
    // 80 kg to 52 kg: a normal start, a goal under the floor.
    const aggressive = buildOnboardingPlan({ ...base, startWeight: 80, goalWeight: 52 });
    expect(aggressive!.reasons).toContain('Goal weight would give a BMI under 18.5');
    expect(aggressive!.reasons).not.toContain('Starting BMI is under 18.5');
    const ordinary = buildOnboardingPlan({ ...base, startWeight: 80, goalWeight: 70 });
    expect(ordinary!.reasons.some((r) => r.includes('BMI'))).toBe(false);
  });
});

describe('needsBodyStep (OB3)', () => {
  it('asks a member with no height or weights for them', () => {
    expect(needsBodyStep({ height_cm: null, start_weight: 80, goal_weight: 75 })).toBe(true);
    expect(needsBodyStep({ height_cm: 175, start_weight: 0, goal_weight: 75 })).toBe(true);
    expect(needsBodyStep({ height_cm: 175, start_weight: 80, goal_weight: null })).toBe(true);
    expect(needsBodyStep({})).toBe(true);
  });
  it('leaves a member whose coach already filled them in on the short version', () => {
    expect(needsBodyStep({ height_cm: 175, start_weight: 80, goal_weight: 75 })).toBe(false);
  });
  it('has nothing to ask about when there is no profile row (the full flow asks everything)', () => {
    expect(needsBodyStep(null)).toBe(false);
  });
});

describe('isMissingColumnError', () => {
  it('recognises a column that is not there yet', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column "consented_at" of relation "client_profiles" does not exist' }, 'consented_at')).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'consented_at' column of 'client_profiles' in the schema cache" }, 'consented_at')).toBe(true);
  });
  it('does not mistake another failure for it', () => {
    expect(isMissingColumnError({ code: '23514', message: 'new row violates check constraint' }, 'consented_at')).toBe(false);
    expect(isMissingColumnError({ code: '42703', message: 'column "other_column" does not exist' }, 'consented_at')).toBe(false);
    expect(isMissingColumnError(null, 'consented_at')).toBe(false);
  });
});

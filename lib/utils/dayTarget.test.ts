import { describe, expect, it } from 'vitest';
import { weeklyTarget, type ClientProfile } from '@/lib/calculations';
import { averageDayTarget, dayTargetFor, highDaysLeft, HIGH_DAYS_PER_WEEK, isCyclingTarget } from './dayTarget';

const base: ClientProfile = {
  age: 34, gender: 'Female', startWeight: 82, goalWeight: 70, bodyFatPct: 31, activityLevel: 1.5,
  dietApproach: 'High Carb Low Fat', goal: 'fat_loss', setting: 'moderate', cycling: false,
};
const flatWeek = weeklyTarget(base, 1)!;
const cyclingWeek = weeklyTarget({ ...base, cycling: true }, 1)!;

describe('dayTargetFor (web)', () => {
  it('is null with no weekly target', () => {
    expect(dayTargetFor(null, 'flat')).toBeNull();
  });

  it('gives a member who is not cycling the flat target whatever the day says', () => {
    for (const t of ['flat', 'low', 'high', null, undefined] as const) expect(dayTargetFor(flatWeek, t)).toBe(flatWeek.dailyFlat);
    expect(isCyclingTarget(flatWeek)).toBe(false);
  });

  // The bug: a cycling member's unmarked day had no target, and nothing ever marked a day, so they saw none anywhere.
  it('gives a cycling member the low target on every day not marked high, and the high target on a high day', () => {
    expect(isCyclingTarget(cyclingWeek)).toBe(true);
    for (const t of ['flat', 'low', null, undefined] as const) expect(dayTargetFor(cyclingWeek, t)).toBe(cyclingWeek.dailyLow);
    expect(dayTargetFor(cyclingWeek, 'high')).toBe(cyclingWeek.dailyHigh);
  });

  it('keeps a typed-in target on every day, even with cycling ticked', () => {
    const custom = weeklyTarget({ ...base, cycling: true, customTarget: { calories: 2000, protein: 150, carbs: 200, fat: 60 } }, 1)!;
    expect(dayTargetFor(custom, 'high')).toBe(custom.dailyFlat);
    expect(isCyclingTarget(custom)).toBe(false);
  });
});

describe('averageDayTarget', () => {
  it('is the flat target for a member who is not cycling', () => {
    expect(averageDayTarget(flatWeek)).toBe(flatWeek.dailyFlat);
  });

  it('is the week over seven for a cycling member: 5 low and 2 high days together', () => {
    const avg = averageDayTarget(cyclingWeek)!;
    expect(avg.calories).toBeCloseTo((cyclingWeek.dailyLow!.calories * 5 + cyclingWeek.dailyHigh!.calories * 2) / 7, 6);
    expect(avg.protein).toBeCloseTo(cyclingWeek.dailyLow!.protein, 6);
    expect(avg.calories).toBeGreaterThan(cyclingWeek.dailyLow!.calories);
    expect(avg.calories).toBeLessThan(cyclingWeek.dailyHigh!.calories);
  });
});

describe('highDaysLeft', () => {
  it(`allows ${HIGH_DAYS_PER_WEEK} high days a week`, () => {
    expect(highDaysLeft([])).toBe(2);
    expect(highDaysLeft(['flat', 'high', 'low', null])).toBe(1);
    expect(highDaysLeft(['high', 'high'])).toBe(0);
    expect(highDaysLeft(['high', 'high', 'high'])).toBe(0);
  });
});

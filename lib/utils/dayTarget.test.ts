import { describe, expect, it } from 'vitest';
import { weeklyTarget, type ClientProfile } from '@/lib/calculations';
import { averageDayTarget, dayTargetFor, highDaysLeft, HIGH_DAYS_PER_WEEK, isCyclingTarget, highDayProblem, highDayWeek } from './dayTarget';

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

describe('highDayWeek', () => {
  it('is the Monday to Sunday the date is in', () => {
    // Wednesday 11 Nov 2026
    expect(highDayWeek('2026-11-11')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(highDayWeek('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(highDayWeek('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  });

  it('crosses a month and a year', () => {
    expect(highDayWeek('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });
});

describe('highDayProblem', () => {
  it(`allows a high day while fewer than ${HIGH_DAYS_PER_WEEK} other days are high`, () => {
    expect(highDayProblem(0, true)).toBeNull();
    expect(highDayProblem(HIGH_DAYS_PER_WEEK - 1, true)).toBeNull();
  });

  it('refuses one more, and says what to do', () => {
    expect(highDayProblem(HIGH_DAYS_PER_WEEK, true)).toBe(`You already have ${HIGH_DAYS_PER_WEEK} high days this week. Make one of them a normal day first.`);
    expect(highDayProblem(HIGH_DAYS_PER_WEEK + 1, true)).not.toBeNull();
  });

  it('always allows going back to a normal day', () => {
    expect(highDayProblem(HIGH_DAYS_PER_WEEK + 1, false)).toBeNull();
  });
});

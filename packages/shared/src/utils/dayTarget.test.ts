import { describe, expect, it } from 'vitest';
import { weeklyTarget, type ClientProfile } from '../calculations';
import { averageDayTarget, dayTargetFor, highDaysLeft, HIGH_DAYS_PER_WEEK, isCyclingTarget, highDayProblem, highDayWeek } from './dayTarget';

const base: ClientProfile = {
  age: 34, gender: 'Female', startWeight: 82, goalWeight: 70, bodyFatPct: 31, activityLevel: 1.5,
  dietApproach: 'High Carb Low Fat', goal: 'fat_loss', setting: 'moderate', cycling: false,
};

describe('dayTargetFor', () => {
  it('is null with no weekly target', () => {
    expect(dayTargetFor(null, 'flat')).toBeNull();
  });

  it('uses the flat target for a non-cycling member whatever the day type', () => {
    const w = weeklyTarget(base, 1)!;
    expect(dayTargetFor(w, 'flat')).toBe(w.dailyFlat);
    expect(dayTargetFor(w, 'low')).toBe(w.dailyFlat); // falls back to flat when there is no low target
    expect(dayTargetFor(w, 'high')).toBe(w.dailyFlat); // a day marked high before cycling was switched off
    expect(dayTargetFor(w, null)).toBe(w.dailyFlat);
    expect(isCyclingTarget(w)).toBe(false);
  });

  it('uses the low and high targets for a cycling member', () => {
    const w = weeklyTarget({ ...base, cycling: true }, 1)!;
    expect(dayTargetFor(w, 'low')).toBe(w.dailyLow);
    expect(dayTargetFor(w, 'high')).toBe(w.dailyHigh);
    expect(w.dailyHigh!.calories).toBeGreaterThan(w.dailyLow!.calories);
  });

  it('makes every unmarked day a low day for a cycling member (it used to have no target at all)', () => {
    const w = weeklyTarget({ ...base, cycling: true }, 1)!;
    expect(isCyclingTarget(w)).toBe(true);
    expect(dayTargetFor(w, 'flat')).toBe(w.dailyLow);
    expect(dayTargetFor(w, null)).toBe(w.dailyLow);
    expect(dayTargetFor(w, undefined)).toBe(w.dailyLow);
  });

  it('reads week averages against the planned average day (5 low + 2 high over 7)', () => {
    const w = weeklyTarget({ ...base, cycling: true }, 1)!;
    expect(averageDayTarget(w)!.calories).toBeCloseTo((w.dailyLow!.calories * 5 + w.dailyHigh!.calories * 2) / 7, 6);
    const flat = weeklyTarget(base, 1)!;
    expect(averageDayTarget(flat)).toBe(flat.dailyFlat);
  });

  it('allows two high days a week', () => {
    expect(HIGH_DAYS_PER_WEEK).toBe(2);
    expect(highDaysLeft([])).toBe(2);
    expect(highDaysLeft(['high'])).toBe(1);
    expect(highDaysLeft(['high', 'high', 'flat'])).toBe(0);
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

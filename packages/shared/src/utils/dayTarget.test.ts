import { describe, expect, it } from 'vitest';
import { weeklyTarget, type ClientProfile } from '../calculations';
import { dayTargetFor } from './dayTarget';

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
    expect(dayTargetFor(w, null)).toBe(w.dailyFlat);
  });

  it('uses the low and high targets for a cycling member', () => {
    const w = weeklyTarget({ ...base, cycling: true }, 1)!;
    expect(dayTargetFor(w, 'low')).toBe(w.dailyLow);
    expect(dayTargetFor(w, 'high')).toBe(w.dailyHigh);
    expect(w.dailyHigh!.calories).toBeGreaterThan(w.dailyLow!.calories);
  });

  it('has no target on a flat day for a cycling member (matches the web)', () => {
    expect(dayTargetFor(weeklyTarget({ ...base, cycling: true }, 1), 'flat')).toBeNull();
  });
});

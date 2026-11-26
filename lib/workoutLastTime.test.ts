import { describe, expect, it } from 'vitest';
import { lastTimeLine } from './workoutLastTime';

const set = (over: Partial<{ actual_reps: number | null; actual_load: number | null; actual_seconds: number | null; actual_distance: number | null; actual_calories: number | null }>) => ({
  actual_reps: null,
  actual_load: null,
  ...over,
});

describe('lastTimeLine (TR17: one small "last time" line)', () => {
  it('weight and reps', () => {
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_reps: 8, actual_load: 60 }), tracking: 'weight_reps' })).toBe(
      'Last week, 12 Nov: 8 × 60kg'
    );
  });

  it('a set with no weight (or 0 kg) reads as reps only', () => {
    expect(lastTimeLine({ label: 'Last time', date: '3 Nov', set: set({ actual_reps: 12 }), tracking: 'weight_reps' })).toBe('Last time, 3 Nov: 12 reps');
    expect(lastTimeLine({ label: 'Last time', date: '3 Nov', set: set({ actual_reps: 12, actual_load: 0 }), tracking: 'weight_reps' })).toBe(
      'Last time, 3 Nov: 12 reps'
    );
  });

  it('a weight with the reps left blank', () => {
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_load: 40 }), tracking: 'weight_reps' })).toBe('Last week, 12 Nov: — × 40kg');
  });

  it('other ways of tracking say what was recorded, with units', () => {
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_seconds: 45 }), tracking: 'time' })).toBe('Last week, 12 Nov: 45s');
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_calories: 20 }), tracking: 'calories' })).toBe('Last week, 12 Nov: 20 cal');
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_reps: 15 }), tracking: 'reps' })).toBe('Last week, 12 Nov: 15 reps');
  });

  it('nothing when there is no last time, nothing was recorded, or the exercise is only ticked off', () => {
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: null, tracking: 'weight_reps' })).toBeNull();
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({}), tracking: 'weight_reps' })).toBeNull();
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({}), tracking: 'tick' })).toBeNull();
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_seconds: 30 }), tracking: 'distance' })).toBeNull();
    // 0 kg and no reps: not "— × 0".
    expect(lastTimeLine({ label: 'Last week', date: '12 Nov', set: set({ actual_load: 0 }), tracking: 'weight_reps' })).toBeNull();
  });
});

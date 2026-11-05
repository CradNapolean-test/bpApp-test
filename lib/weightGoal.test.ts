import { describe, expect, it } from 'vitest';
import { weightGoalProgress } from './weightGoal';

describe('weightGoalProgress', () => {
  it('reports progress towards a weight-loss goal', () => {
    expect(weightGoalProgress(90, 80, 85)).toEqual({ pct: 50, toGoKg: 5, awayKg: 0, movingAway: false });
  });

  it('flags a member who has gained on a weight-loss goal', () => {
    const p = weightGoalProgress(78.5, 70, 87.5);
    expect(p?.pct).toBe(0);
    expect(p?.awayKg).toBeCloseTo(9);
    expect(p?.movingAway).toBe(true);
    expect(p?.toGoKg).toBeCloseTo(17.5);
  });

  it('works for a weight-gain goal', () => {
    expect(weightGoalProgress(60, 66, 63)).toEqual({ pct: 50, toGoKg: 3, awayKg: 0, movingAway: false });
    expect(weightGoalProgress(60, 66, 58)?.movingAway).toBe(true);
  });

  it('treats half a kilo the wrong way as scale noise', () => {
    expect(weightGoalProgress(90, 80, 90.4)?.movingAway).toBe(false);
    expect(weightGoalProgress(90, 80, 90.6)?.movingAway).toBe(true);
  });

  it('caps at 100% once the goal is passed', () => {
    expect(weightGoalProgress(90, 80, 78)).toEqual({ pct: 100, toGoKg: 0, awayKg: 0, movingAway: false });
  });

  it('has nothing to say when start and goal are the same', () => {
    expect(weightGoalProgress(80, 80, 82)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { dashboardConfirmArgs, dashboardScore, pendingScore } from './bigDogConfirm';
import { EXERCISES, levelForResult } from './bigDog';

const key = EXERCISES[0].key;

describe("confirming a Peak Week score from the dashboard (CV17)", () => {
  it("is offered on the coach's own member, with the number the member logged", () => {
    expect(dashboardConfirmArgs({ exerciseKey: key, value: 110, mine: true }, 'gym')).toEqual({ exerciseKey: key, value: 110 });
    // "My members" lists only the coach's own members.
    expect(dashboardConfirmArgs({ exerciseKey: key, value: 110, mine: false }, 'mine')).toEqual({ exerciseKey: key, value: 110 });
    expect(dashboardConfirmArgs({ exerciseKey: key, value: 0, mine: true }, 'coach')).toEqual({ exerciseKey: key, value: 0 });
  });

  it("is not offered on another coach's member: the same rule as the Verify button on the member's page (isOwnClient)", () => {
    expect(dashboardConfirmArgs({ exerciseKey: key, value: 110, mine: false }, 'gym')).toBeNull();
    expect(dashboardConfirmArgs({ exerciseKey: key, value: 110, mine: false }, 'coach')).toBeNull();
  });

  it('needs a known exercise and a number', () => {
    expect(dashboardConfirmArgs({ exerciseKey: 'not_an_exercise', value: 110, mine: true }, 'mine')).toBeNull();
    expect(dashboardConfirmArgs({ exerciseKey: key, value: null, mine: true }, 'mine')).toBeNull();
    expect(dashboardConfirmArgs({ exerciseKey: key, value: Number.NaN, mine: true }, 'mine')).toBeNull();
  });
});

const deadlift = EXERCISES.find((e) => e.key === 'deadlift')!;
const row = (value: number, self: boolean, created: string, extra: Record<string, unknown> = {}) => ({
  exercise_key: 'deadlift',
  level: levelForResult(deadlift, 'female', value),
  tested_date: created.slice(0, 10),
  created_at: created,
  self_reported: self,
  result_value: value,
  result_text: `${value}kg`,
  ...extra,
});

describe('what Confirm verifies: the same score as the Big Dog page (review finding 1)', () => {
  it('a member who logged 120kg then 100kg: the row names 120kg, and 120kg is what is verified', () => {
    const rows = [row(120, true, '2026-11-20T10:00:00Z'), row(100, true, '2026-11-24T10:00:00Z')];
    expect(dashboardScore(rows, 'deadlift')).toEqual({ text: '120kg', value: 120 });
    expect(pendingScore(rows, deadlift, 'female')?.result_value).toBe(120);
  });

  it('nothing to verify when a coach already verified a level as high (an older verified row the dashboard does not read)', () => {
    const verifiedHigh = row(200, false, '2026-01-10T10:00:00Z');
    const lowSelf = row(60, true, '2026-11-24T10:00:00Z');
    expect(levelForResult(deadlift, 'female', 200)).not.toBe(levelForResult(deadlift, 'female', 60));
    expect(pendingScore([verifiedHigh, lowSelf], deadlift, 'female')).toBeNull();
  });

  it("the row has no Confirm when the best score it can see is a coach's", () => {
    const rows = [row(150, false, '2026-11-20T10:00:00Z'), row(100, true, '2026-11-24T10:00:00Z')];
    expect(dashboardScore(rows, 'deadlift')).toEqual({ text: '100kg', value: null });
    expect(dashboardScore([], 'deadlift')).toBeNull();
  });
});

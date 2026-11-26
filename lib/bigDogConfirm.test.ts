import { describe, expect, it } from 'vitest';
import { dashboardConfirmArgs } from './bigDogConfirm';
import { EXERCISES } from './bigDog';

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

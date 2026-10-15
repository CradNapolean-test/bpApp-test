import { describe, expect, it } from 'vitest';
import { PLAN_NAME_UNREADABLE, planNameOf } from './coach';

// The shape the embedded select `client_memberships!client_id(ended_at, membership_packages(name))` comes back in.
const open = (pkg: unknown) => [{ ended_at: null, membership_packages: pkg }];

describe('planNameOf', () => {
  it('names the plan on the open membership', () => {
    expect(planNameOf(open({ name: 'Unlimited' }))).toBe('Unlimited');
    expect(planNameOf(open([{ name: 'Unlimited' }]))).toBe('Unlimited');
  });

  it('skips plans that have ended', () => {
    const rows = [
      { ended_at: '2026-01-05T00:00:00Z', membership_packages: { name: 'Old plan' } },
      { ended_at: null, membership_packages: { name: 'Current plan' } },
    ];
    expect(planNameOf(rows)).toBe('Current plan');
  });

  it('is null only for a member with no open plan', () => {
    expect(planNameOf([])).toBeNull();
    expect(planNameOf(null)).toBeNull();
    expect(planNameOf([{ ended_at: '2026-01-05T00:00:00Z', membership_packages: { name: 'Old plan' } }])).toBeNull();
  });

  it('still counts a member as being on a plan when the plan itself belongs to the other gym and cannot be read', () => {
    // The plan row is hidden (null), but the membership is open: this member is NOT "No plan".
    expect(planNameOf(open(null))).toBe(PLAN_NAME_UNREADABLE);
    expect(planNameOf(open([]))).toBe(PLAN_NAME_UNREADABLE);
  });
});

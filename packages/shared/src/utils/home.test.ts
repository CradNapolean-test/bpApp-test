import { describe, expect, it } from 'vitest';

import { monthsSince, nextSessionsReward } from './home';

describe('monthsSince', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  it('counts calendar months, not 30-day blocks', () => {
    expect(monthsSince('2026-10-01', now)).toBe(0);
    expect(monthsSince('2026-09-30', now)).toBe(1);
    expect(monthsSince('2026-01-15', now)).toBe(9);
    expect(monthsSince('2025-10-12', now)).toBe(12);
  });
  it('is never negative', () => {
    expect(monthsSince('2026-12-01', now)).toBe(0);
  });
});


describe('nextSessionsReward', () => {
  const rewards = [
    { kind: 'sessions', threshold: 200, name: 'Bag' },
    { kind: 'sessions', threshold: 100, name: 'Hoodie' },
    { kind: 'sessions', threshold: 50, name: 'Bottle' },
    { kind: 'streak', threshold: 60, name: 'Streak thing' },
  ];
  it('picks the nearest sessions reward still ahead', () => {
    expect(nextSessionsReward(rewards, 60)?.name).toBe('Hoodie');
    expect(nextSessionsReward(rewards, 0)?.name).toBe('Bottle');
  });
  it('ignores other kinds and reached thresholds', () => {
    expect(nextSessionsReward(rewards, 100)?.name).toBe('Bag');
    expect(nextSessionsReward(rewards, 200)).toBeUndefined();
  });
});

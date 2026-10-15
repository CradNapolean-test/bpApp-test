import { describe, expect, it } from 'vitest';
import { msUntilNextMidnight } from './midnight';

describe('msUntilNextMidnight', () => {
  it('counts down to midnight at the timezone, not UTC', () => {
    const now = new Date('2026-10-15T22:30:00Z');
    // London is on BST (UTC+1): 23:30 there, so 30 minutes to go.
    expect(msUntilNextMidnight('Europe/London', now)).toBe(30 * 60 * 1000);
    // UTC itself: 22:30, so 90 minutes.
    expect(msUntilNextMidnight('UTC', now)).toBe(90 * 60 * 1000);
    // Auckland is 13 hours ahead: 11:30 on the 16th, so 12.5 hours.
    expect(msUntilNextMidnight('Pacific/Auckland', now)).toBe(12.5 * 3600 * 1000);
  });

  it('is a full day just after midnight', () => {
    expect(msUntilNextMidnight('UTC', new Date('2026-10-15T00:00:00Z'))).toBe(86_400_000);
  });

  it('allows for the milliseconds already passed', () => {
    expect(msUntilNextMidnight('UTC', new Date('2026-10-15T23:59:59.500Z'))).toBe(500);
  });
});

import { describe, expect, it } from 'vitest';
import { cancellationPolicyText, sharedCutoffHours } from './bookingRules';

describe('sharedCutoffHours (L5)', () => {
  it('is the cut-off every session shares', () => {
    expect(sharedCutoffHours([3, 3, 3])).toBe(3);
    expect(sharedCutoffHours([12])).toBe(12);
  });

  it('is null when the sessions differ, so no single number is claimed', () => {
    expect(sharedCutoffHours([3, 12])).toBeNull();
  });

  it('falls back to the usual 3 hours when nothing is scheduled or booked', () => {
    expect(sharedCutoffHours([])).toBe(3);
    expect(sharedCutoffHours([null, undefined])).toBe(3);
  });
});

describe('cancellationPolicyText', () => {
  it('describes the gym\'s overnight window even when no session is scheduled', () => {
    expect(cancellationPolicyText({ start: '23:00:00', end: '05:00:00' }, [])).toBe(
      "Cancel at least 3 hours before a session to keep your credit. Overnight (11pm–5am) doesn't count, so for early-morning sessions, cancel by 11pm the night before."
    );
  });

  it('has no overnight sentence when the gym has no window', () => {
    expect(cancellationPolicyText(null, [3])).toBe('Cancel at least 3 hours before a session to keep your credit.');
    expect(cancellationPolicyText({ start: null, end: null }, [3])).toBe('Cancel at least 3 hours before a session to keep your credit.');
  });

  it('uses the class\'s own number, singular for one hour', () => {
    expect(cancellationPolicyText(null, [1])).toBe('Cancel at least 1 hour before a session to keep your credit.');
    expect(cancellationPolicyText(null, [6, 6])).toBe('Cancel at least 6 hours before a session to keep your credit.');
  });

  it('does not pick one class\'s cut-off when they differ', () => {
    expect(cancellationPolicyText(null, [3, 12])).toBe('Each session has its own cancel-by time, shown on the session, to keep your credit.');
  });
});

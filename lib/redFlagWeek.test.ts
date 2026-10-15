import { describe, expect, it } from 'vitest';
import { gymToday, lastCompletedWeekIn } from './redFlagWeek';

describe('lastCompletedWeekIn', () => {
  it('is the Monday a week before the current week', () => {
    // Wednesday 14 Oct 2026 in London: this week began Monday 12th, the last finished week began Monday 5th.
    expect(lastCompletedWeekIn('Europe/London', new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-05');
  });

  it('rolls over on Monday morning at the gym, not in London', () => {
    // Sunday 18 Oct 2026, 12:00 UTC. London: still Sunday, the week of the 12th is not over. Auckland (UTC+13 then): already Monday 19th.
    const now = new Date('2026-10-18T12:00:00Z');
    expect(lastCompletedWeekIn('Europe/London', now)).toBe('2026-10-05');
    expect(lastCompletedWeekIn('Pacific/Auckland', now)).toBe('2026-10-12');
  });

  it('works across the year end', () => {
    expect(lastCompletedWeekIn('Europe/London', new Date('2027-01-05T09:00:00Z'))).toBe('2026-12-28');
  });
});

describe('gymToday', () => {
  it('is the date on the gym wall, which can differ from the UTC date', () => {
    const now = new Date('2026-10-14T23:30:00Z');
    expect(gymToday('UTC', now)).toBe('2026-10-14');
    expect(gymToday('Pacific/Auckland', now)).toBe('2026-10-15');
    expect(gymToday('America/Los_Angeles', now)).toBe('2026-10-14');
  });
});

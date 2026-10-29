import { describe, expect, it } from 'vitest';
import { planCountdown, planCountdownLabel } from './planCountdown';

// 6 week challenge: start + 6 weeks + 1 day (SOP).
const m = { started_at: '2026-10-12', scheduled_end: '2026-11-23', durationWeeks: 6 };
const fmt = (d: string) => d;

describe('planCountdown', () => {
  it('is upcoming before the start', () => {
    const c = planCountdown(m, '2026-10-09');
    expect(c).toMatchObject({ state: 'upcoming', week: null, daysToStart: 3 });
    expect(planCountdownLabel('Challenge', c, fmt)).toBe('Challenge · starts 2026-10-12');
  });
  it('is week 1 on day 1 and day 7, week 2 on day 8', () => {
    expect(planCountdown(m, '2026-10-12').week).toBe(1);
    expect(planCountdown(m, '2026-10-18').week).toBe(1);
    expect(planCountdown(m, '2026-10-19').week).toBe(2);
  });
  it('flags the final week and never exceeds the total, including the extra last day', () => {
    const c = planCountdown(m, '2026-11-23');
    expect(c).toMatchObject({ state: 'active', week: 6, lastWeek: true, daysLeft: 0 });
    expect(planCountdown(m, '2026-11-16').lastWeek).toBe(true);
    expect(planCountdown(m, '2026-11-15').lastWeek).toBe(false);
  });
  it('is ended the day after the planned end', () => {
    const c = planCountdown(m, '2026-11-24');
    expect(c.state).toBe('ended');
    expect(planCountdownLabel('Challenge', c, fmt)).toBe('Challenge · ended 2026-11-23');
  });
  it('ongoing plans have no week or days left', () => {
    expect(planCountdown({ started_at: '2026-01-01', durationWeeks: null }, '2026-10-14')).toMatchObject({ state: 'active', week: null, daysLeft: null });
  });
});

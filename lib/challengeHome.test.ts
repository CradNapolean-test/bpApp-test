import { describe, expect, it } from 'vitest';
import { challengeHome, ongoingPlans, whatsNextDraft } from './challengeHome';

// The live Test member: 6 Week Challenge from 3 Oct, ends 14 Nov (start + 6 weeks).
const challenge = { started_at: '2026-10-03', scheduled_end: '2026-11-14', ended_at: null, package: { name: '6 Week Challenge', duration_weeks: 6 } };
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

describe('challengeHome', () => {
  it('is null for an ongoing plan, a plan with no length, or none', () => {
    expect(challengeHome(null, '2026-11-06', fmt)).toBeNull();
    expect(challengeHome({ ...challenge, package: { name: 'Big Dog', duration_weeks: null } }, '2026-11-06', fmt)).toBeNull();
    expect(challengeHome({ ...challenge, package: { name: 'Big Dog', duration_weeks: 0 } }, '2026-11-06', fmt)).toBeNull();
    expect(challengeHome({ ...challenge, package: null }, '2026-11-06', fmt)).toBeNull();
  });

  it('counts the weeks with the end date, and offers nothing yet before the last 2 weeks', () => {
    const h = challengeHome(challenge, '2026-10-20', fmt)!;
    expect(h.label).toBe('Week 3 of 6 · ends 14 Nov');
    expect(h.whatsNext).toBe(false);
    expect(h.planName).toBe('6 Week Challenge');
  });

  it('reads "Week 5 of 6 · ends 14 Nov" in week 5 and offers what is next', () => {
    const h = challengeHome(challenge, '2026-11-06', fmt)!;
    expect(h.label).toBe('Week 5 of 6 · ends 14 Nov');
    expect(h.whatsNext).toBe(true);
  });

  it('says final week, then last day', () => {
    expect(challengeHome(challenge, '2026-11-10', fmt)!.label).toBe('Final week · ends 14 Nov');
    expect(challengeHome(challenge, '2026-11-14', fmt)!.label).toBe('Last day today');
  });

  it('keeps offering what is next once the end has passed and the plan is still open', () => {
    const h = challengeHome(challenge, '2026-11-15', fmt)!;
    expect(h.label).toBe('Ended 14 Nov');
    expect(h.whatsNext).toBe(true);
  });

  it('says when a plan that has not started starts', () => {
    const h = challengeHome({ ...challenge, started_at: '2026-11-17', scheduled_end: '2026-12-29' }, '2026-11-11', fmt)!;
    expect(h.label).toBe('Starts 17 Nov');
    expect(h.whatsNext).toBe(false);
  });

  it('offers what is next when the coach set the end sooner than the length says', () => {
    const h = challengeHome({ ...challenge, scheduled_end: '2026-10-25' }, '2026-10-20', fmt)!;
    expect(h.label).toBe('Week 3 of 6 · ends 25 Oct');
    expect(h.whatsNext).toBe(true);
  });

  it('has no end date part when the plan has none', () => {
    expect(challengeHome({ ...challenge, scheduled_end: null }, '2026-10-20', fmt)!.label).toBe('Week 3 of 6');
  });
});

describe('ongoingPlans', () => {
  const plans = [
    { id: '1', name: 'Classes Only Tier', credits_per_week: 4, duration_weeks: null },
    { id: '2', name: '6 Week Challenge', credits_per_week: 3, duration_weeks: 6 },
    { id: '3', name: 'Big Dog', credits_per_week: 6, duration_weeks: null },
    { id: '4', name: 'Trial', credits_per_week: 2, duration_weeks: 0 },
  ];
  it('leaves out fixed-length plans and puts the most sessions first', () => {
    expect(ongoingPlans(plans).map((p) => p.name)).toEqual(['Big Dog', 'Classes Only Tier', 'Trial']);
  });
  it('keeps to the limit', () => {
    expect(ongoingPlans(plans, 1).map((p) => p.name)).toEqual(['Big Dog']);
  });
});

describe('whatsNextDraft', () => {
  it('writes a message about carrying on, or asking for a call', () => {
    const h = challengeHome(challenge, '2026-11-06', fmt)!;
    expect(whatsNextDraft(h, { plan: 'Big Dog' }, fmt)).toBe("Hi! My 6 Week Challenge ends on 14 Nov. I'd like to carry on with Big Dog. What do I need to do?");
    expect(whatsNextDraft(h, 'call', fmt)).toBe("Hi! My 6 Week Challenge ends on 14 Nov. Could we have a quick call about what's next for me?");
  });
  it('says the plan has finished once it has', () => {
    const h = challengeHome(challenge, '2026-11-20', fmt)!;
    expect(whatsNextDraft(h, 'call', fmt)).toBe("Hi! My 6 Week Challenge finished on 14 Nov. Could we have a quick call about what's next for me?");
  });
});

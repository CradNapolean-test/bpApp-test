import { describe, expect, it } from 'vitest';
import { challengePrompt } from './challengeCheckins';

// Started Mon 12 Oct 2026, 6 weeks, ends Mon 23 Nov.
const m = { id: 'm1', started_at: '2026-10-12', scheduled_end: '2026-11-23', durationWeeks: 6 };
const none = new Set<string>();

describe('challengePrompt', () => {
  it('prompts all of week 3 (days 15 to 21), and not before or after', () => {
    expect(challengePrompt(m, '2026-10-25', none)).toBeNull(); // week 2
    expect(challengePrompt(m, '2026-10-26', none)).toMatchObject({ milestone: 'week3', week: 3, totalWeeks: 6 });
    expect(challengePrompt(m, '2026-11-01', none)).toMatchObject({ milestone: 'week3' });
    expect(challengePrompt(m, '2026-11-02', none)).toBeNull(); // week 4
  });
  it('prompts again from 10 days before the planned last day (D5)', () => {
    expect(challengePrompt(m, '2026-11-12', none)).toBeNull(); // 11 days left
    expect(challengePrompt(m, '2026-11-13', none)).toMatchObject({ milestone: 'final', week: 5, daysLeft: 10, endsOn: '2026-11-23' });
    expect(challengePrompt(m, '2026-11-16', none)).toMatchObject({ milestone: 'final', week: 6 });
    expect(challengePrompt(m, '2026-11-23', none)).toMatchObject({ milestone: 'final', daysLeft: 0 });
    expect(challengePrompt(m, '2026-11-24', none)).toBeNull(); // ended
  });
  it('falls back to the final week when the plan has no end date', () => {
    const open = { ...m, scheduled_end: null };
    expect(challengePrompt(open, '2026-11-13', none)).toBeNull(); // week 5
    expect(challengePrompt(open, '2026-11-16', none)).toMatchObject({ milestone: 'final', daysLeft: null, endsOn: null });
  });
  it('asks once on a short plan where week 3 is within the last 10 days', () => {
    const short = { id: 'm2', started_at: '2026-10-12', scheduled_end: '2026-11-01', durationWeeks: 3 };
    expect(challengePrompt(short, '2026-10-26', none)).toMatchObject({ milestone: 'final', week: 3 });
    expect(challengePrompt(short, '2026-10-26', new Set(['challenge_final|m2']))).toBeNull();
  });
  it('stops once the coach has marked that milestone done', () => {
    expect(challengePrompt(m, '2026-10-27', new Set(['challenge_week3|m1']))).toBeNull();
    expect(challengePrompt(m, '2026-11-17', new Set(['challenge_week3|m1']))).toMatchObject({ milestone: 'final' });
    expect(challengePrompt(m, '2026-11-17', new Set(['challenge_final|m1']))).toBeNull();
  });
  it('ignores ongoing plans, ended memberships and plans that have not started', () => {
    expect(challengePrompt({ ...m, durationWeeks: null }, '2026-10-27', none)).toBeNull();
    expect(challengePrompt({ ...m, ended_at: '2026-10-30' }, '2026-10-27', none)).toBeNull();
    expect(challengePrompt(m, '2026-10-05', none)).toBeNull();
  });
});

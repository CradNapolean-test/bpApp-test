import { describe, expect, it } from 'vitest';

import { EVENT_GRACE_MS, FAQS, eventState, referMessage, rewardCaption, rewardStatus, sortRewards, spotsText, validateFeedback } from './community';

const now = new Date('2026-10-12T12:00:00Z');
const ev = (over: Partial<Parameters<typeof eventState>[0]> = {}) => ({ capacity: null, signups: 0, signedUp: false, starts_at: '2026-10-20T10:00:00Z', ...over });

describe('eventState', () => {
  it('is open for a future event with room', () => {
    expect(eventState(ev(), now)).toBe('open');
    expect(eventState(ev({ capacity: 10, signups: 9 }), now)).toBe('open');
  });
  it('is full when the spots are taken', () => {
    expect(eventState(ev({ capacity: 10, signups: 10 }), now)).toBe('full');
    expect(eventState(ev({ capacity: 10, signups: 12 }), now)).toBe('full');
  });
  it('lets a member who is going always leave, even when it is full or over', () => {
    expect(eventState(ev({ signedUp: true, capacity: 1, signups: 1 }), now)).toBe('going');
    expect(eventState(ev({ signedUp: true, starts_at: '2026-01-01T10:00:00Z' }), now)).toBe('going');
  });
  it('is over once it started more than 6 hours ago', () => {
    const start = new Date(now.getTime() - EVENT_GRACE_MS - 60_000).toISOString();
    expect(eventState(ev({ starts_at: start }), now)).toBe('over');
    const recent = new Date(now.getTime() - EVENT_GRACE_MS + 60_000).toISOString();
    expect(eventState(ev({ starts_at: recent }), now)).toBe('open');
  });
});

describe('spotsText', () => {
  it('shows going, and spots when there is a limit', () => {
    expect(spotsText({ capacity: null, signups: 4 })).toBe('4 going');
    expect(spotsText({ capacity: 12, signups: 4 })).toBe('4 going · 12 spots');
  });
});

describe('validateFeedback', () => {
  it('needs a rating from 1 to 5', () => {
    expect(validateFeedback(0, '')).toMatch(/rating/);
    expect(validateFeedback(6, '')).toMatch(/rating/);
    expect(validateFeedback(3.5, '')).toMatch(/rating/);
    expect(validateFeedback(5, '')).toBeNull();
  });
  it('keeps the comment inside the limit', () => {
    expect(validateFeedback(4, 'x'.repeat(1000))).toBeNull();
    expect(validateFeedback(4, 'x'.repeat(1001))).toMatch(/1000/);
  });
});

describe('referMessage', () => {
  it('uses the first name and the link', () => {
    const m = referMessage('Jordan Reyes', 'https://example.test/refer');
    expect(m.startsWith('Jordan here')).toBe(true);
    expect(m.endsWith('https://example.test/refer')).toBe(true);
  });
  it('copes with no name', () => {
    expect(referMessage(null, 'https://example.test/refer').startsWith('A friend here')).toBe(true);
    expect(referMessage('  ', 'https://example.test/refer').startsWith('A friend here')).toBe(true);
  });
});

describe('rewards', () => {
  const rewards = [
    { id: 'a', kind: 'sessions' as const, threshold: 200, description: 'Bag' },
    { id: 'b', kind: 'sessions' as const, threshold: 100, description: null },
    { id: 'c', kind: 'months' as const, threshold: 6, description: null },
    { id: 'd', kind: 'months' as const, threshold: 18, description: null },
  ];
  it('works out progress, earned and given', () => {
    expect(rewardStatus(rewards[1], 27, 3, [])).toEqual({ value: 27, unit: 'sessions', given: false, earned: false, pct: 27 });
    expect(rewardStatus(rewards[2], 27, 6, [])).toMatchObject({ earned: true, pct: 100, unit: 'months' });
    expect(rewardStatus(rewards[1], 120, 3, ['b'])).toMatchObject({ given: true, earned: true, pct: 100 });
  });
  it('lists earned-but-not-received first, then nearest, then received', () => {
    const sorted = sortRewards(rewards, 120, 7, ['c']).map((r) => r.id);
    // b: earned, not given (rank 0); c: given (rank 2); a: 60% (rank 1); d: 39% (rank 1)
    expect(sorted).toEqual(['b', 'a', 'd', 'c']);
  });
  it('words what each reward needs', () => {
    expect(rewardCaption(rewards[0])).toBe('After 200 sessions · Bag');
    expect(rewardCaption(rewards[2])).toBe('After 6 months as a member');
  });
});

describe('FAQS', () => {
  it('has a question and an answer for each entry', () => {
    expect(FAQS.length).toBeGreaterThan(5);
    for (const f of FAQS) {
      expect(f.q.length).toBeGreaterThan(5);
      expect(f.a.length).toBeGreaterThan(5);
    }
  });
});

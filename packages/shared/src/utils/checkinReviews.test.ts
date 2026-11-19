import { describe, expect, it } from 'vitest';
import { reviewedByLine, reviewsByRef, type CheckinReviewRow } from './checkinReviews';

// Same cases as lib/checkinReviews.test.ts: the web and the phone must say the same thing.
const row = (kind: string, ref: string, at: string, name: string | null): CheckinReviewRow => ({ kind, ref, reviewed_at: at, reviewer_first_name: name });

describe('reviewsByRef', () => {
  it('keeps one kind, keyed by what was reviewed', () => {
    const rows = [row('week', '2026-11-09', '2026-11-16T10:00:00Z', 'Brad'), row('form', 'a1', '2026-11-12T09:00:00Z', 'Brad')];
    expect([...reviewsByRef(rows, 'week').keys()]).toEqual(['2026-11-09']);
    expect(reviewsByRef(rows, 'form').get('a1')).toEqual({ by: 'Brad', at: '2026-11-12T09:00:00Z' });
  });

  it('ignores kinds a member is never shown', () => {
    const rows = [row('diary_day', '2026-11-10', '2026-11-11T08:00:00Z', 'Brad'), row('checkin_reminders', '2026-11-01', '2026-11-02T08:00:00Z', 'Brad')];
    expect(reviewsByRef(rows, 'week').size).toBe(0);
    expect(reviewsByRef(rows, 'form').size).toBe(0);
  });

  it('keeps the latest mark when one thing was marked twice', () => {
    const rows = [row('week', 'w', '2026-11-16T10:00:00Z', 'Sam'), row('week', 'w', '2026-11-10T10:00:00Z', 'Brad')];
    expect(reviewsByRef(rows, 'week').get('w')?.by).toBe('Sam');
  });

  it('copes with nothing', () => {
    expect(reviewsByRef(null, 'week').size).toBe(0);
    expect(reviewsByRef(undefined, 'form').size).toBe(0);
  });
});

describe('reviewedByLine', () => {
  it("names the coach by their first name", () => {
    expect(reviewedByLine({ by: 'Brad' })).toBe('Reviewed by Brad ✓');
    expect(reviewedByLine({ by: '  Brad Stein ' })).toBe('Reviewed by Brad ✓');
  });
  it('says "your coach" when the coach has no name set', () => {
    expect(reviewedByLine({ by: null })).toBe('Reviewed by your coach ✓');
    expect(reviewedByLine({ by: '   ' })).toBe('Reviewed by your coach ✓');
  });
});

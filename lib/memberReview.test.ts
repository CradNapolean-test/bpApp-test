import { describe, expect, it } from 'vitest';
import { olderUnreviewed, olderUnreviewedLine } from './memberReview';

// Thursday 15 Oct 2026. This week began Monday 12th; the two listed weeks began 5 Oct and 28 Sep.
const todayIso = '2026-10-15';

describe('olderUnreviewed', () => {
  it('finds a week from before the two listed ones that nobody reviewed', () => {
    const r = olderUnreviewed({ loggedDates: ['2026-09-20', '2026-09-19', '2026-10-07'], completedForms: [], reviewedWeeks: [], reviewedForms: [], todayIso });
    expect(r.weeks).toEqual(['2026-09-14']);
  });

  it('leaves out weeks that were reviewed, and weeks the page already lists', () => {
    const r = olderUnreviewed({
      loggedDates: ['2026-09-01', '2026-09-20', '2026-09-30', '2026-10-07', '2026-10-13'],
      completedForms: [],
      reviewedWeeks: ['2026-08-31'],
      reviewedForms: [],
      todayIso,
    });
    expect(r.weeks).toEqual(['2026-09-14']);
  });

  it('lists several older weeks newest first', () => {
    const r = olderUnreviewed({ loggedDates: ['2026-08-03', '2026-09-08', '2026-09-15'], completedForms: [], reviewedWeeks: [], reviewedForms: [], todayIso });
    expect(r.weeks).toEqual(['2026-09-14', '2026-09-07', '2026-08-03']);
  });

  it('finds completed forms older than 30 days that were not marked read', () => {
    const r = olderUnreviewed({
      loggedDates: [],
      completedForms: [
        { id: 'old', completedAt: '2026-08-01T10:00:00Z' },
        { id: 'oldRead', completedAt: '2026-08-02T10:00:00Z' },
        { id: 'recent', completedAt: '2026-10-01T10:00:00Z' },
        { id: 'unfinished', completedAt: null },
      ],
      reviewedWeeks: [],
      reviewedForms: ['oldRead'],
      todayIso,
    });
    expect(r.forms).toEqual(['old']);
  });

  it('is empty when everything is in the listed window or reviewed', () => {
    const r = olderUnreviewed({ loggedDates: ['2026-10-13'], completedForms: [], reviewedWeeks: [], reviewedForms: [], todayIso });
    expect(r).toEqual({ weeks: [], forms: [] });
    expect(olderUnreviewedLine(r)).toBeNull();
  });
});

describe('olderUnreviewedLine', () => {
  it('says how many and of what', () => {
    expect(olderUnreviewedLine({ weeks: ['2026-09-14'], forms: [] })).toEqual({
      title: '1 older item not reviewed',
      hint: '1 check-in week from before the last 2 weeks',
    });
    expect(olderUnreviewedLine({ weeks: ['a', 'b'], forms: ['f'] })).toEqual({
      title: '3 older items not reviewed',
      hint: '2 check-in weeks and 1 form from before the last 2 weeks',
    });
  });
});

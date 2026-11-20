import { describe, expect, it } from 'vitest';
import { MARK_ALL_MAX, activityFeedNames, photoCount, reviewRows, startedBy } from './coachDashboardRules';

describe('meal photos on a day, read as a count (item 9)', () => {
  it('reads the count the database sends', () => {
    expect(photoCount([{ count: 3 }])).toBe(3);
    expect(photoCount([{ count: 0 }])).toBe(0);
  });

  it('reads no count, or no row, as none', () => {
    expect(photoCount([])).toBe(0);
    expect(photoCount(null)).toBe(0);
    expect(photoCount(undefined)).toBe(0);
    expect(photoCount([{ count: null }])).toBe(0);
  });
});

describe('names in the activity feed', () => {
  it("keeps the dashboard's own name for its members and adds the others' profile names", () => {
    const names = activityFeedNames({ a: 'Sam (dashboard)', b: 'b@example.com' }, { a: 'Sam (profile)', c: 'Alex' });
    expect(names).toEqual({ a: 'Sam (dashboard)', b: 'b@example.com', c: 'Alex' });
  });

  it('leaves out a blank profile name and does not change the lookup it was given', () => {
    const own = { a: 'Sam' };
    expect(activityFeedNames(own, { c: '' })).toEqual({ a: 'Sam' });
    expect(own).toEqual({ a: 'Sam' });
  });
});

describe('started by now ("this time last week")', () => {
  it('counts a session that started at or before now', () => {
    expect(startedBy('06:30:00', 6 * 60 + 30)).toBe(true);
    expect(startedBy('06:30', 7 * 60)).toBe(true);
  });

  it('does not count one that starts later', () => {
    expect(startedBy('18:00:00', 9 * 60)).toBe(false);
  });

  it('does not count a session with no start time, which used to read as midnight', () => {
    expect(startedBy(null, 0)).toBe(false);
    expect(startedBy(null, 23 * 60)).toBe(false);
    expect(startedBy('', 12 * 60)).toBe(false);
  });
});

describe('rows for "Mark all reviewed" (one insert)', () => {
  it('makes one row per week, with the kind on each', () => {
    expect(
      reviewRows('week', [
        { clientId: 'a', ref: '2026-10-26' },
        { clientId: 'b', ref: '2026-10-26' },
        { clientId: 'a', ref: '2026-10-19' },
      ])
    ).toEqual([
      { kind: 'week', client_id: 'a', ref: '2026-10-26' },
      { kind: 'week', client_id: 'b', ref: '2026-10-26' },
      { kind: 'week', client_id: 'a', ref: '2026-10-19' },
    ]);
  });

  it('drops blanks and repeats', () => {
    expect(
      reviewRows('diary_day', [
        { clientId: 'a', ref: '2026-11-02' },
        { clientId: 'a', ref: '2026-11-02' },
        { clientId: '', ref: '2026-11-03' },
        { clientId: 'a', ref: '' },
      ])
    ).toEqual([{ kind: 'diary_day', client_id: 'a', ref: '2026-11-02' }]);
  });

  it('refuses more than the cap', () => {
    const many = Array.from({ length: MARK_ALL_MAX + 1 }, (_, i) => ({ clientId: `c${i}`, ref: '2026-10-26' }));
    expect(reviewRows('week', many)).toBeNull();
    expect(reviewRows('week', many.slice(0, MARK_ALL_MAX))).toHaveLength(MARK_ALL_MAX);
  });
});

import { describe, expect, it } from 'vitest';
import { MARK_ALL_MAX, reviewRows, startedBy } from './coachDashboardRules';

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

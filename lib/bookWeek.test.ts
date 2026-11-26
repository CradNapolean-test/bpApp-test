import { describe, expect, it } from 'vitest';
import { pageOf, weekPages, weekRangeLabel } from './bookWeek';

// Thu 26 Nov 2026 and the 13 days after it.
const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 10, 26 + i)).toISOString().slice(0, 10));

describe('Book on a laptop (BK26)', () => {
  it('splits the booking window into weeks of seven days from today', () => {
    const pages = weekPages(days);
    expect(pages).toHaveLength(2);
    expect(pages[0][0]).toBe('2026-11-26');
    expect(pages[0]).toHaveLength(7);
    expect(pages[1][0]).toBe('2026-12-03');
    // A window that isn't a whole number of weeks ends on a short page.
    expect(weekPages(days.slice(0, 10)).map((p) => p.length)).toEqual([7, 3]);
    expect(weekPages([])).toEqual([]);
  });

  it('opens on the week that holds the day picked, else the first', () => {
    const pages = weekPages(days);
    expect(pageOf(pages, '2026-12-05')).toBe(1);
    expect(pageOf(pages, '2026-11-26')).toBe(0);
    expect(pageOf(pages, '2027-01-01')).toBe(0);
    expect(pageOf(pages, null)).toBe(0);
  });

  it('labels the week, naming the month once unless it changes', () => {
    expect(weekRangeLabel(['2026-12-03', '2026-12-04', '2026-12-09'])).toBe('Thu 3 – Wed 9 Dec');
    expect(weekRangeLabel(weekPages(days)[0])).toBe('Thu 26 Nov – Wed 2 Dec');
    expect(weekRangeLabel(['2026-12-03'])).toBe('Thu 3 Dec');
    expect(weekRangeLabel([])).toBe('');
  });
});

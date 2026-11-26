import { describe, expect, it } from 'vitest';
import { bookDayMark, bookDayStatus, bookStripCaption } from './dayStrip';

// Book's day marks (BK6). In their own file so the phone's copy of dayStrip.test.ts stays as it is; dayStripTwin.test.ts holds the
// phone's dayStrip.ts to this one, so these tests cover it too.

const booked = new Set(['2026-11-27']);
const waitlisted = new Set(['2026-11-27', '2026-11-28']);

describe('bookDayMark', () => {
  it('marks a booked day as booked', () => {
    expect(bookDayMark('2026-11-27', booked, new Set())).toBe('booked');
  });

  it('marks a day with only a waitlist place, distinct from a booked day', () => {
    expect(bookDayMark('2026-11-28', booked, waitlisted)).toBe('waitlist');
  });

  it('lets booked win on a day with both', () => {
    expect(bookDayMark('2026-11-27', booked, waitlisted)).toBe('booked');
  });

  it('leaves any other day plain', () => {
    expect(bookDayMark('2026-11-29', booked, waitlisted)).toBeNull();
  });
});

describe('bookDayStatus', () => {
  it('says each thing that is true of the day', () => {
    expect(bookDayStatus('2026-11-27', booked, waitlisted, true)).toBe(', booked, on a waitlist');
    expect(bookDayStatus('2026-11-28', booked, waitlisted, true)).toBe(', on a waitlist');
    expect(bookDayStatus('2026-11-29', booked, waitlisted, false)).toBe(', no sessions');
    expect(bookDayStatus('2026-11-29', booked, waitlisted, true)).toBe('');
  });
});

describe('bookStripCaption', () => {
  it('says when nothing is booked', () => {
    expect(bookStripCaption(0, 0)).toBe('Nothing booked yet.');
  });

  it('keeps the booked-only wording', () => {
    expect(bookStripCaption(1, 0)).toBe('1 session booked. The ringed days are yours.');
    expect(bookStripCaption(3, 0)).toBe('3 sessions booked. The ringed days are yours.');
  });

  it('explains the dashed ring for waitlists', () => {
    expect(bookStripCaption(0, 1)).toBe('On 1 waitlist. A dashed ring marks the day.');
    expect(bookStripCaption(0, 2)).toBe('On 2 waitlists. Dashed rings mark the days.');
  });

  it('says both when there are both', () => {
    expect(bookStripCaption(2, 1)).toBe('2 sessions booked, 1 on a waitlist. Solid rings are booked, dashed rings are waitlists.');
    expect(bookStripCaption(1, 3)).toBe('1 session booked, 3 on waitlists. Solid rings are booked, dashed rings are waitlists.');
  });
});

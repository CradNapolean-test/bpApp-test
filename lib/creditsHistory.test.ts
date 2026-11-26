import { describe, expect, it } from 'vitest';
import { appendCreditPage, MEMBER_HISTORY_PAGE, memberSince, shownToMember } from './creditsForm';

const row = (id: string, delta: number) => ({ id, delta });

describe("a member's credit history (BK24)", () => {
  it('shows 10 rows a page', () => {
    expect(MEMBER_HISTORY_PAGE).toBe(10);
  });

  it('leaves out the weekly resets that changed nothing', () => {
    expect(shownToMember(row('a', 0))).toBe(false);
    expect(shownToMember(row('b', 3))).toBe(true);
    expect(shownToMember(row('c', -1))).toBe(true);
  });

  it('adds the next page after the rows on screen, newest first', () => {
    const first = [row('a', -1), row('b', 3)];
    expect(appendCreditPage(first, [row('c', -2), row('d', 1)]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never shows a row twice when one moved down a page meanwhile, and never a ±0 row', () => {
    const first = [row('a', -1), row('b', 3)];
    expect(appendCreditPage(first, [row('b', 3), row('z', 0), row('c', -2)]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the rows on screen when the next page is empty', () => {
    const first = [row('a', -1)];
    expect(appendCreditPage(first, [])).toEqual(first);
  });
});

describe('memberSince (RO15)', () => {
  it('uses the earliest plan start when the account is newer (an imported member)', () => {
    expect(memberSince('2024-03-01', '2026-10-01')).toEqual({ date: '2024-03-01', source: 'plan' });
  });

  it('uses the day the account was made when that is earlier than any plan', () => {
    expect(memberSince('2026-11-01', '2026-09-14')).toEqual({ date: '2026-09-14', source: 'account' });
  });

  it('uses the account when there is no plan', () => {
    expect(memberSince(null, '2026-09-14')).toEqual({ date: '2026-09-14', source: 'account' });
  });

  it('prefers the plan on the same day', () => {
    expect(memberSince('2026-09-14', '2026-09-14')).toEqual({ date: '2026-09-14', source: 'plan' });
  });

  it("doesn't move when the plan changes: the earliest start is used, not the current plan's", () => {
    // The caller passes the earliest plan start, so a new plan started today changes nothing.
    expect(memberSince('2025-01-06', '2025-01-05')?.date).toBe('2025-01-05');
  });

  it('shows nothing when neither is known or a date is not a date', () => {
    expect(memberSince(null, null)).toBeNull();
    expect(memberSince('soon', undefined)).toBeNull();
  });
});

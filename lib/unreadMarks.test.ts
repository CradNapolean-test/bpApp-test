import { describe, expect, it } from 'vitest';
import { NO_UNREAD_MARKS, liveUnreadTotal, readSince, withThreadRead, withThreadUnread, withUnreadTotal } from './unreadMarks';

describe('unread marks', () => {
  it('a conversation read after the figures were drawn counts as read; one read before them does not', () => {
    const readA = withThreadRead(NO_UNREAD_MARKS, 'a'); // change 1
    const drawnAt = readA.seq; // the page's figures arrive after that
    const readB = withThreadRead(readA, 'b'); // change 2
    expect(readSince(readB, 'b', drawnAt)).toBe(true);
    // Already in the server's figures, which are the ones to trust.
    expect(readSince(readB, 'a', drawnAt)).toBe(false);
    expect(readSince(readB, 'c', drawnAt)).toBe(false);
  });

  it('marking a conversation unread again lets the drawn figures count it', () => {
    const read = withThreadRead(NO_UNREAD_MARKS, 'a');
    const unread = withThreadUnread(read, 'a');
    expect(readSince(unread, 'a', 0)).toBe(false);
    expect(withThreadUnread(NO_UNREAD_MARKS, 'a')).toBe(NO_UNREAD_MARKS);
  });

  it("shows an inbox list's total only when it was counted after the server's figure arrived", () => {
    expect(liveUnreadTotal(5, 0, NO_UNREAD_MARKS)).toBe(5);
    const counted = withUnreadTotal(NO_UNREAD_MARKS, 2); // change 1
    expect(liveUnreadTotal(5, 0, counted)).toBe(2);
    // A server figure that arrived after the count (a new page) wins.
    expect(liveUnreadTotal(4, counted.seq, counted)).toBe(4);
    // Reading the last one down to zero shows zero, not the server's figure.
    expect(liveUnreadTotal(5, 0, withUnreadTotal(counted, 0))).toBe(0);
  });
});

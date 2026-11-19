// What a coach has done to unread messages in this browser tab since the page's figures were drawn. The badges and lists that count
// unread messages (the header Messages button, the sidebar's Messages, the dashboard's "Reply to messages", a member page's "Message ·
// 2 new") are drawn by the server; reading a conversation wrote its read marker but changed none of them, so they said "unread" until
// the page was reloaded. Changes are numbered in the order they happen (a counter, not a clock), so a figure can be compared with the
// changes made after it arrived.
export interface UnreadMarks {
  seq: number;
  // Conversations read here, by member id, with the number of the change that read them.
  readAt: Record<string, number>;
  // The coach's unread total as an open inbox list last counted it, with the number of that change.
  total: { value: number; at: number } | null;
}

export const NO_UNREAD_MARKS: UnreadMarks = { seq: 0, readAt: {}, total: null };

export function withThreadRead(marks: UnreadMarks, clientId: string): UnreadMarks {
  const seq = marks.seq + 1;
  return { ...marks, seq, readAt: { ...marks.readAt, [clientId]: seq } };
}

// Marked unread again: the figures drawn for it count again.
export function withThreadUnread(marks: UnreadMarks, clientId: string): UnreadMarks {
  if (!(clientId in marks.readAt)) return marks;
  const readAt = { ...marks.readAt };
  delete readAt[clientId];
  return { ...marks, seq: marks.seq + 1, readAt };
}

export function withUnreadTotal(marks: UnreadMarks, value: number): UnreadMarks {
  const seq = marks.seq + 1;
  return { ...marks, seq, total: { value, at: seq } };
}

// The change number at which server-drawn figures (an object from the page's server render) first came on screen, kept in `seen`. A page
// brought back by the browser's or phone's Back is drawn from Next's history cache with the very same objects, so it keeps the number it
// first had and a conversation read in between still counts as read; a fresh server render brings new objects and starts from now.
export function firstSeenAt(seen: WeakMap<object, number>, drawn: object, seq: number): number {
  const at = seen.get(drawn);
  if (at !== undefined) return at;
  seen.set(drawn, seq);
  return seq;
}

// Whether the conversation was read here after figures drawn at change `since`.
export function readSince(marks: UnreadMarks, clientId: string, since: number): boolean {
  return (marks.readAt[clientId] ?? 0) > since;
}

// The unread total to show for a server figure that arrived at change `since`: the server's, unless an inbox list counted it since.
export function liveUnreadTotal(serverTotal: number, since: number, marks: UnreadMarks): number {
  return marks.total && marks.total.at > since ? marks.total.value : serverTotal;
}

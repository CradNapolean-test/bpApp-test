// A coach's reply to a member's weekly check-in goes into the member's chat, headed with the week it is about, so the member
// (and the coach scrolling back later) can tell which week it answers.

// The chat refuses a message over 4,000 characters (0108_chat_limits.sql); the heading takes some of that.
export const CHAT_TEXT_MAX = 4000;

const weekShort = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function checkinReplyHeading(weekStartIso: string): string {
  return `Your check-in, week of ${weekShort(weekStartIso)}:`;
}

// The message as it is stored: the heading, a blank line, then what the coach wrote (trimmed).
export function checkinReplyText(weekStartIso: string, body: string): string {
  return `${checkinReplyHeading(weekStartIso)}\n\n${body.trim()}`;
}

// How much the coach can type once the heading is counted.
export function checkinReplyMax(weekStartIso: string): number {
  return CHAT_TEXT_MAX - checkinReplyHeading(weekStartIso).length - 2;
}

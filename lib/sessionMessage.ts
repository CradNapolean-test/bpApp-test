// "Message everyone booked" on a session (BK16): one message, into each booked member's own chat with the coach.
// Who it reaches is decided in the database (message_session_booked, migration 0178): the members booked into that session on that date,
// read when the coach presses Send. This is the same rule for the pop-up's count, so the confirm says how many it goes to.

// chat_messages.text allows 4,000 (migration 0108); a colleague's member's copy starts with the sender's name, so 3,900 leaves room.
export const SESSION_MESSAGE_MAX = 3900;

// The database takes a session from yesterday on (message_session_booked, 0178), so the pop-up offers it from then.
export function canMessageSession(sessionDate: string, todayIso: string): boolean {
  const yesterday = new Date(Date.parse(todayIso + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  return sessionDate >= yesterday;
}

// Booked places only: not the waitlist, not anyone removed or cancelled. One message each, even if a member somehow has two bookings.
export function bookedRecipients(roster: { clientId: string; status: string }[]): string[] {
  return [...new Set(roster.filter((r) => r.status === 'booked').map((r) => r.clientId))];
}

// What is wrong with the message before it is sent, or null.
export function sessionMessageProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Write a message first.';
  if (t.length > SESSION_MESSAGE_MAX) return `That's too long: keep it under ${SESSION_MESSAGE_MAX.toLocaleString('en-GB')} characters.`;
  return null;
}

export const membersWord = (n: number) => `${n} member${n === 1 ? '' : 's'}`;

// The confirm before it goes (it can't be taken back).
export function sessionMessageConfirm(n: number, sessionLabel: string): { title: string; body: string; confirmLabel: string } {
  return {
    title: `Send this to ${membersWord(n)}?`,
    body: `Everyone booked into ${sessionLabel} gets it in their own chat, with a notification. Not the waitlist. It can't be unsent.`,
    confirmLabel: `Send to ${membersWord(n)}`,
  };
}

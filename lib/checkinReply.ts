import { addDays, toIsoDate } from '@/lib/utils/dates';
import { wallTimeToIso } from '@/lib/broadcastSend';

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

// What the member said in chat since their Sunday check-in, shown on the coach's view of the week so they read it before replying (CW1).
// The window starts at the start of the week's Sunday (the member's own midnight) and runs a week, so an old week shows what was said
// around it, not everything since. Null before that Sunday has begun (nothing to read yet).
export const CHECKIN_CHAT_MAX = 30;

export function checkinChatWindow(
  weekStartIso: string,
  timezone: string,
  nowMs: number = Date.now()
): { sunday: string; fromIso: string; toIso: string } | null {
  const sunday = toIsoDate(addDays(new Date(`${weekStartIso}T00:00:00Z`), 6));
  const nextSunday = toIsoDate(addDays(new Date(`${sunday}T00:00:00Z`), 7));
  const fromIso = wallTimeToIso(`${sunday}T00:00`, timezone);
  const toIso = wallTimeToIso(`${nextSunday}T00:00`, timezone);
  if (!fromIso || !toIso || new Date(fromIso).getTime() > nowMs) return null;
  return { sunday, fromIso, toIso };
}

// One message as a line on that card: the words, or what was sent instead of words.
export function checkinChatLine(m: {
  text: string | null;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  image_path?: string | null;
}): string {
  const text = m.text?.trim();
  if (text) return text;
  if (m.audio_path) {
    const s = Math.max(0, Math.round(m.audio_duration_seconds ?? 0));
    return s > 0 ? `Voice note (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})` : 'Voice note';
  }
  if (m.image_path) return 'Photo';
  return 'Message';
}

// Pure helpers for the Broadcasts screen (R25): the "are you sure" wording for a send-now, and date handling in the GYM's timezone rather
// than the coach's browser's (a coach travelling, or a laptop on the wrong timezone, would otherwise schedule a message for the wrong hour).

export type BroadcastChannel = 'message' | 'email' | 'both';
export type BroadcastTarget = 'my_clients' | 'gym' | 'group';

const people = (n: number) => `${n} member${n === 1 ? '' : 's'}`;

export function channelPhrase(channel: BroadcastChannel): string {
  return channel === 'message' ? 'by message' : channel === 'email' ? 'by email' : 'by message and email';
}

export interface BroadcastConfirmation {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
}

// A send-now cannot be recalled, so it always asks, with the number of people and the channel. Email gets stronger wording because it
// leaves the app for good.
export function broadcastConfirmation(input: {
  count: number;
  channel: BroadcastChannel;
  target: BroadcastTarget;
  groupName?: string | null;
  // Which gym "the whole gym" is, for a coach who works in more than one.
  gymName?: string | null;
}): BroadcastConfirmation {
  const { count, channel, target, groupName, gymName } = input;
  const audience =
    target === 'gym'
      ? `everyone at ${gymName ?? 'the gym'}, including other coaches' clients`
      : target === 'group'
        ? `the group "${groupName ?? 'selected'}"`
        : 'your own clients';
  const emails = channel !== 'message';
  return {
    title: `Send to ${people(count)} ${channelPhrase(channel)}?`,
    body: emails
      ? `This goes to ${audience}. Emails leave the app straight away and cannot be recalled or edited afterwards.`
      : `This goes to ${audience}. A message cannot be unsent once it is delivered.`,
    confirmLabel: emails ? `Send ${channel === 'both' ? 'message and email' : 'email'}` : 'Send message',
    destructive: emails,
  };
}

// Milliseconds the timezone is ahead of UTC at an instant.
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

// "2026-10-20T09:00" typed in a datetime-local box, read as a wall-clock time in the gym's timezone -> the real instant (ISO, UTC).
// Null for text that is not a date and time.
export function wallTimeToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // The offset depends on the instant, which depends on the offset: two passes settle it, including across a clock change.
  const first = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(first, tz);
  const result = new Date(second);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

// The current wall-clock time in the gym's timezone as a datetime-local value: the `min` of the schedule box.
export function nowAsWallTime(tz: string, now: number = Date.now()): string {
  const wall = new Date(now + offsetMs(now, tz));
  return wall.toISOString().slice(0, 16);
}

// True when the typed time is not in the future at the gym.
export function isPastSchedule(local: string, tz: string, now: number = Date.now()): boolean {
  const iso = wallTimeToIso(local, tz);
  return iso == null || new Date(iso).getTime() <= now;
}

export function formatInZone(iso: string, tz: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function weekdayInZone(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long' });
}

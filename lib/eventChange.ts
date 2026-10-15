// The in-app message sent to everyone signed up when a coach changes or cancels an event (EV2). Built here so the wording can be tested; the
// database function notify_event_signups (migration 0135) only stores it. Times are written in the gym's timezone.
import { formatInZone } from './broadcastSend';

export interface EventSnapshot {
  title: string;
  starts_at: string;
  location: string | null;
}

const place = (location: string | null) => (location && location.trim() ? location.trim() : 'no location set');

// What to tell signed-up members about an edit, or null when nothing they care about changed (title, time, place).
export function eventChangeMessage(before: EventSnapshot, after: EventSnapshot, tz: string): string | null {
  const timeChanged = new Date(before.starts_at).getTime() !== new Date(after.starts_at).getTime();
  const placeChanged = (before.location ?? '').trim() !== (after.location ?? '').trim();
  if (!timeChanged && !placeChanged) return null;

  const parts: string[] = [];
  if (timeChanged) parts.push(`is now ${formatInZone(after.starts_at, tz)} (it was ${formatInZone(before.starts_at, tz)})`);
  if (placeChanged) parts.push(`has moved to ${place(after.location)} (it was ${place(before.location)})`);
  return truncate(`Event update: "${after.title}" ${parts.join(' and ')}.`);
}

export function eventCancelledMessage(event: EventSnapshot, tz: string): string {
  return truncate(`Event cancelled: "${event.title}" on ${formatInZone(event.starts_at, tz)} has been cancelled.`);
}

// The database accepts up to 300 characters.
function truncate(message: string): string {
  return message.length <= 300 ? message : `${message.slice(0, 297)}...`;
}

// An event cannot be created to start in the past.
export function startsInThePast(startsAtIso: string, now: number = Date.now()): boolean {
  return new Date(startsAtIso).getTime() < now;
}

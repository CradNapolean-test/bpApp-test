// When a coach is pushed about a member's message (R40, DECISION D19). The rules are plain functions with the clock passed in, so they are
// tested with a fake one.
//
//  * Quiet hours: no push from 21:00 to 07:00 in the member's gym's timezone. The in-app badge still counts the message.
//  * One push per burst: a push goes out for a message only if the member had sent nothing in the 5 minutes before it, so a person typing
//    five lines gives the coach one buzz, not five. A burst ends after 5 minutes of quiet; the next message then pushes again.
//  * The push never carries the message text (a lock screen shows it to whoever is looking), only who it is from.

import type { PushPayload } from './push';

export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 7;
export const BURST_WINDOW_MS = 5 * 60 * 1000;

// 0 to 23, the hour of day in a timezone. An unknown timezone name falls back to UTC rather than throwing.
export function hourInZone(now: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(now);
    return Number(hour) % 24;
  } catch {
    return now.getUTCHours();
  }
}

// 21:00 up to (not including) 07:00, which crosses midnight.
export function isQuietHour(now: Date, timeZone: string, startHour = QUIET_START_HOUR, endHour = QUIET_END_HOUR): boolean {
  const hour = hourInZone(now, timeZone);
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}

export type CoachPushDecision = { push: true } | { push: false; reason: 'quiet-hours' | 'same-burst' };

export function decideCoachPush(input: {
  now: Date;
  timeZone: string;
  // When this member's previous message in the thread was sent, or null when there was none.
  previousMemberMessageAt: Date | null;
}): CoachPushDecision {
  if (isQuietHour(input.now, input.timeZone)) return { push: false, reason: 'quiet-hours' };
  const previous = input.previousMemberMessageAt;
  if (previous && input.now.getTime() - previous.getTime() < BURST_WINDOW_MS) return { push: false, reason: 'same-burst' };
  return { push: true };
}

// "New message from Alex": the member's first name, or "a member" when there is none. No message text.
export function coachPushPayload(memberName: string | null | undefined, clientId: string): PushPayload {
  const first = (memberName ?? '').trim().split(/\s+/)[0];
  return {
    title: `New message from ${first || 'a member'}`,
    body: 'Open the app to read it.',
    url: `/coach/clients/${clientId}?open=messages`,
    // One notification per member: a newer one replaces the older instead of stacking.
    tag: `chat-${clientId}`,
  };
}

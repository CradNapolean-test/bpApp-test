import { formatClock, nowLocalMs } from './cancelDeadline';

// Check-in is only offered around the session itself. These are the SERVER's numbers (check_in_booking, migration 0132: 30 minutes
// before the start to 60 after, in the gym's timezone). They used to be 2 and 15, so a member who arrived early was told it was closed.
// If the owner changes the rule, change it here AND in check_in_booking.
export const CHECKIN_OPENS_BEFORE_MIN = 30;
export const CHECKIN_CLOSES_AFTER_MIN = 60;

export type CheckinWindow =
  | { state: 'open' }
  | { state: 'not_open_yet'; opensAt: string } // opensAt is formatted like the rest of the app, e.g. "5:58am"
  | { state: 'closed' };

// startTime is the class's "HH:MM[:SS]" (local to the gym/member timezone); null means no start time, so
// check-in is open all day. `date` is the booking date (YYYY-MM-DD).
export function checkinWindow(startTime: string | null, date: string, timeZone: string, now: Date = new Date()): CheckinWindow {
  if (!startTime) return { state: 'open' };
  const [h, m] = startTime.split(':').map(Number);
  const startMs = Date.parse(`${date}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
  const nowMs = nowLocalMs(timeZone, now);
  const opensMs = startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000;
  if (nowMs < opensMs) return { state: 'not_open_yet', opensAt: formatClock(new Date(opensMs).toISOString().slice(11, 16)) };
  if (nowMs > startMs + CHECKIN_CLOSES_AFTER_MIN * 60_000) return { state: 'closed' };
  return { state: 'open' };
}

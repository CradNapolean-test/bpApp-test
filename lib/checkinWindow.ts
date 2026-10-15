// When a member can check in to a session (R17, DECISION D5). The check-in button allowed 2 minutes before the start to 15 after, while the
// database (check_in_booking, migration 0132) allows 30 minutes before to 60 after, so a member who arrived early was told it was closed,
// or shown a button the server then refused. Both now use these two numbers; if the owner changes the rule, change it here AND in
// check_in_booking (the 30 and 60 in the 'Check-in opens 30 minutes before the class' / 'Check-in has closed' lines).
export const CHECKIN_OPENS_BEFORE_MIN = 30;
export const CHECKIN_CLOSES_AFTER_MIN = 60;

export type CheckinState =
  | { state: 'open' }
  | { state: 'not_yet'; opensAtMs: number }
  | { state: 'closed' };

// `startMs` and `nowMs` are on the same clock (the member's wall time, as the screen already uses). A session with no start time has no
// window to enforce: check-in is open all day, as on the server.
export function checkinWindow(startMs: number | null, nowMs: number): CheckinState {
  if (startMs == null) return { state: 'open' };
  const opensAtMs = startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000;
  if (nowMs < opensAtMs) return { state: 'not_yet', opensAtMs };
  if (nowMs > startMs + CHECKIN_CLOSES_AFTER_MIN * 60_000) return { state: 'closed' };
  return { state: 'open' };
}

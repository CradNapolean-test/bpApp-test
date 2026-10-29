// How much set history the member's screens carry (H5). Every set is a row, about 20 a session, so a member reaches the database's
// 1,000-row limit in a few months; the screens read the last 90 days (the weekly volume chart needs 12 weeks, "last time" and the
// check-in button need far less) and ask the database for the all-time bests (member_strength_bests, migration 0137).
export const WORKOUT_LOG_DAYS = 90;

// The start of the window as a timestamp: the member's "today" minus the window, at midnight UTC (a few hours either way does not matter
// for a 90-day window). The same value is the cut-off for the bests that come from before the window.
export function workoutWindowStart(todayIso: string, days: number = WORKOUT_LOG_DAYS): string {
  const start = new Date(`${todayIso}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

// Bookings the member screens carry: the last 90 days (the attended sessions shown on past check-in weeks) and everything ahead.
// The lifetime attended total comes from the rewards function, not from counting these rows.
export const BOOKING_HISTORY_DAYS = 90;
export function bookingWindowStart(todayIso: string, days: number = BOOKING_HISTORY_DAYS): string {
  const start = new Date(`${todayIso}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

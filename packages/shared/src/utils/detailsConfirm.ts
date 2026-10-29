// "Your coach asked you to check your details" (CH3). The banner never blocks the app: pressing "Later" hides it for a day.

export const DETAILS_SNOOZE_MS = 24 * 60 * 60 * 1000;

export const detailsSnoozeKey = (clientId: string) => `details-confirm-later:${clientId}`;

// True when the member pressed "Later" less than a day ago. `stored` is whatever localStorage held (a millisecond timestamp), or null.
export function snoozedRecently(stored: string | null, now = Date.now()): boolean {
  const at = Number(stored);
  return Number.isFinite(at) && at > 0 && now - at < DETAILS_SNOOZE_MS;
}

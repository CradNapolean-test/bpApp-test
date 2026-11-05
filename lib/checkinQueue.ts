// The dashboard's list of weekly check-ins, in the order the coach saw it, kept for this browser tab. Opening one check-in from the
// dashboard saves the list; after replying to (or marking) that week, the week page offers the next one on it, so a Monday review is
// one flow instead of back to the dashboard and open the list again each time (UX6). Browser storage can be missing or blocked: the
// link then simply doesn't show.

const KEY = 'coach-checkin-queue';

// Weeks with this many days logged or fewer are listed under "Only 1 or 2 days logged", below the weeks worth reading (UX5).
export const THIN_WEEK_DAYS = 2;

// "Week of 26 Oct · 7 days logged · no food": a full week of check-ins can still have nothing eaten logged (UX4).
export function checkinRowHint(c: { weekStart: string; days: number; foodDays: number }): string {
  const week = new Date(c.weekStart + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const food = c.foodDays === 0 ? ' · no food' : c.foodDays < c.days ? ` · food on ${c.foodDays}` : '';
  return `Week of ${week} · ${c.days} day${c.days === 1 ? '' : 's'} logged${food}`;
}

export interface QueuedCheckin {
  clientId: string;
  weekStart: string;
  name: string;
  hint: string;
  href: string;
}

export function saveCheckinQueue(items: QueuedCheckin[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // No storage: no "next" link.
  }
}

// The check-in after this one on the saved list, or null when this week isn't on it or it was the last one.
export function nextQueuedCheckin(clientId: string, weekStart: string): QueuedCheckin | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const items = JSON.parse(raw) as QueuedCheckin[];
    if (!Array.isArray(items)) return null;
    const at = items.findIndex((i) => i.clientId === clientId && i.weekStart === weekStart);
    if (at < 0) return null;
    return items[at + 1] ?? null;
  } catch {
    return null;
  }
}

// Whether this week is on the saved list at all (to say "that was the last one" rather than nothing).
export function isQueuedCheckin(clientId: string, weekStart: string): boolean {
  try {
    const items = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as QueuedCheckin[];
    return Array.isArray(items) && items.some((i) => i.clientId === clientId && i.weekStart === weekStart);
  } catch {
    return false;
  }
}

// The owner's read-only member roster for one gym (R37). The filters here are the ones owner_gym_roster accepts, and match the numbers
// on the Overview, so a figure there and the list behind it agree.

export const ROSTER_FILTERS = ['on_plan', 'no_plan', 'ending_soon', 'flagged', 'new_this_month', 'left_last_30'] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export const ROSTER_FILTER_LABELS: Record<RosterFilter, string> = {
  on_plan: 'On a plan',
  no_plan: 'No plan',
  ending_soon: 'Plan ending in 14 days',
  flagged: 'Red flagged',
  new_this_month: 'New this month',
  left_last_30: 'Plan ended in the last 30 days',
};

// A filter from the address bar; anything unknown means "everyone" rather than an error.
export function parseRosterFilter(value: string | string[] | null | undefined): RosterFilter | null {
  const one = Array.isArray(value) ? value[0] : value;
  return (ROSTER_FILTERS as readonly string[]).includes(one ?? '') ? (one as RosterFilter) : null;
}

export const ROSTER_PAGE_SIZE = 50;

// The address of the roster for a gym, optionally filtered. Used by every number on the Overview.
export function rosterHref(gymId: string, filter?: RosterFilter | null): string {
  return filter ? `/owner/gyms/${gymId}?filter=${filter}` : `/owner/gyms/${gymId}`;
}

// "1 to 50 of 114", "No members".
export function rangeLabel(total: number, limit: number, offset: number): string {
  if (total <= 0) return 'No members';
  const from = Math.min(offset, total - 1) + 1;
  const to = Math.min(total, offset + limit);
  return `${from} to ${to} of ${total}`;
}

export const hasPreviousPage = (offset: number): boolean => offset > 0;
export const hasNextPage = (total: number, limit: number, offset: number): boolean => offset + limit < total;

// Where the previous page starts, never below the first.
export const previousOffset = (limit: number, offset: number): number => Math.max(0, offset - limit);

export const STATUS_LABELS: Record<string, string> = {
  on_plan: 'On a plan',
  ending_soon: 'Plan ending',
  no_plan: 'No plan',
};

// "Today", "Yesterday", "5 days ago", "Never": when the member last logged anything on their daily check-in.
export function lastActiveLabel(lastActive: string | null | undefined, today: Date = new Date()): string {
  if (!lastActive) return 'Never';
  const then = new Date(`${lastActive}T00:00:00Z`).getTime();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((now - then) / 86400000);
  if (!Number.isFinite(days)) return 'Never';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

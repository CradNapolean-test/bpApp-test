import { daysBetween } from './utils/dates';

// The Green / Amber / Red / Unmonitored dot beside a member (Program Health, the Clients list, the member's header). One place works it out
// so a colleague's member in "Whole gym" gets exactly the same answer as one of your own (R32).
//
// Days since active is counted from their last real logged day, relative to THEIR OWN coach-configured reminder days (the same signal
// the check-in reminder automation uses, rather than a second definition of "at risk"). A member who has never logged anything is
// counted from the day they signed up.

export type ClientHealthBucket = 'green' | 'amber' | 'red' | 'unmonitored';

export const DEFAULT_REMINDER_DAYS = 3;

export interface HealthInput {
  // The member's check-in reminder days; 0 switches monitoring off. null/undefined means the default (3).
  reminderDays: number | null | undefined;
  // YYYY-MM-DD of their last day with anything logged, or null if they never logged.
  lastActive: string | null;
  // When they signed up (an ISO timestamp or a date).
  createdAt: string;
  // "Today" for THEM (their own timezone), YYYY-MM-DD.
  todayIso: string;
}

export interface HealthResult {
  daysSinceActive: number;
  status: ClientHealthBucket;
  // true when they have never logged anything: daysSinceActive then counts from sign-up, and the screen says "Never logged", not "N days ago".
  neverLogged: boolean;
}

export function computeHealth(input: HealthInput): HealthResult {
  const threshold = input.reminderDays ?? DEFAULT_REMINDER_DAYS;
  const neverLogged = input.lastActive == null;
  const since = input.lastActive ?? input.createdAt.slice(0, 10);
  // Clamped at 0: a display value should never read as nonsensical, whatever the clocks say.
  const daysSinceActive = Math.max(0, daysBetween(since, input.todayIso));

  let status: ClientHealthBucket;
  if (threshold === 0) status = 'unmonitored';
  else if (daysSinceActive <= threshold) status = 'green';
  else if (daysSinceActive <= threshold * 2) status = 'amber';
  else status = 'red';
  return { daysSinceActive, status, neverLogged };
}

// The line under a member's name: "Active today", "Last active 3 days ago", "Never logged", or "Not monitored".
export function lastActiveLabel(health: { status: ClientHealthBucket; daysSinceActive: number; lastActiveDate: string | null } | null): string {
  if (!health || health.status === 'unmonitored') return 'Not monitored';
  if (health.lastActiveDate == null) return 'Never logged';
  if (health.daysSinceActive === 0) return 'Active today';
  return `Last active ${health.daysSinceActive} day${health.daysSinceActive === 1 ? '' : 's'} ago`;
}

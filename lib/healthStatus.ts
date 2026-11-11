import { DEFAULT_REMINDER_DAYS, loggingBand, quietDays } from './followUp';

// The Green / Amber / Red / Unmonitored dot beside a member (Program Health, the Clients list's Logging column, the member's header). One
// place works it out so a colleague's member in "Whole gym" gets exactly the same answer as one of your own (R32).
//
// It only measures logging: days since their last real logged day (a member who has never logged anything is counted from the day they
// signed up), in the bands of lib/followUp.ts, so red here is exactly "gone quiet" (D11: 5 days) on Clients and the dashboard (CL17, CW7).
// It used to be relative to each member's reminder days (3 by default, red after double). Reminder days of 0 still mean nobody is watching
// their logging: "unmonitored".

export type ClientHealthBucket = 'green' | 'amber' | 'red' | 'unmonitored';

export { DEFAULT_REMINDER_DAYS };

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
  const neverLogged = input.lastActive == null;
  const daysSinceActive = quietDays(input.lastActive, input.createdAt, input.todayIso);
  const status: ClientHealthBucket = (input.reminderDays ?? DEFAULT_REMINDER_DAYS) === 0 ? 'unmonitored' : loggingBand(daysSinceActive);
  return { daysSinceActive, status, neverLogged };
}

// The line under a member's name: "Active today", "Last active 3 days ago", "Never logged", or "Not monitored".
export function lastActiveLabel(health: { status: ClientHealthBucket; daysSinceActive: number; lastActiveDate: string | null } | null): string {
  if (!health || health.status === 'unmonitored') return 'Not monitored';
  if (health.lastActiveDate == null) return 'Never logged';
  if (health.daysSinceActive === 0) return 'Active today';
  return `Last active ${health.daysSinceActive} day${health.daysSinceActive === 1 ? '' : 's'} ago`;
}

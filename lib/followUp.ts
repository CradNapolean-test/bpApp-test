import { isPlateaued } from './calculations';
import { addDays, daysBetween, isoWeekKey, toIsoDate } from './utils/dates';

// One follow-up list for the coach: who to check in on, and why (live review CL16, D10, D11, D28). The dashboard's "Members to check in
// on", the Clients page's filters (Check in on, Gone quiet, Out of credits) and its Logging colours, and the coach Business tab's quiet
// count all use these rules, so the same question gets the same answer everywhere. The owner's quiet count is worked out in the database
// (owner_gym_stats, migration 0166), which repeats QUIET_DAYS and the rest of isGoneQuiet in SQL.

// D11: "gone quiet" = QUIET_DAYS or more without logging anything (any part of the daily check-in, or food), counted from sign-up when they
// have never logged. It used to be max(5, reminder days) on the dashboard, after the reminder days (3) on Clients and 7 on the owner's screen.
export const QUIET_DAYS = 5;
// The Logging colour on Clients (D10): green up to SLIPPING_DAYS - 1 days without a log, amber from SLIPPING_DAYS, red (gone quiet) from
// QUIET_DAYS.
export const SLIPPING_DAYS = 3;
// A member's check-in reminder days when none is stored. 0 switches reminders off, and with them the logging follow-ups ("Not monitored").
export const DEFAULT_REMINDER_DAYS = 3;
// How far back the lists read logs and bookings. Longer than QUIET_DAYS, so a member with nothing logged in it has been quiet for at least
// that long whatever happened before it.
export const FOLLOW_UP_WINDOW_DAYS = 28;
// D28: missed (marked no-show) at least MISSED_CLASSES booked classes in the last MISSED_CLASSES_DAYS days.
export const MISSED_CLASSES = 2;
export const MISSED_CLASSES_DAYS = 14;

export type FollowUpKind = 'quiet' | 'missed' | 'classes' | 'credits' | 'stalled';
// The order reasons are listed in, and the list is sorted by.
export const FOLLOW_UP_KINDS: FollowUpKind[] = ['quiet', 'missed', 'classes', 'credits', 'stalled'];

export interface FollowUpReason {
  kind: FollowUpKind;
  label: string;
}

export interface FollowUp {
  reasons: FollowUpReason[];
  // One line about the first reason: "Last log Mon 2 Nov", "0 credits, nothing booked".
  detail: string;
}

export type LoggingBand = 'green' | 'amber' | 'red';

const shift = (iso: string, days: number) => toIsoDate(addDays(new Date(iso + 'T00:00:00Z'), days));
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Days since the last day with anything logged, or since sign-up when there is none. Never below 0 (a log dated in the member's own
// tomorrow is still today).
export function quietDays(lastLog: string | null, createdAt: string, todayIso: string): number {
  return Math.max(0, daysBetween(lastLog ?? createdAt.slice(0, 10), todayIso));
}

// The Logging colour for that many days without a log.
export function loggingBand(days: number): LoggingBand {
  if (days >= QUIET_DAYS) return 'red';
  if (days >= SLIPPING_DAYS) return 'amber';
  return 'green';
}

export interface WatchState {
  // Finished setting up the app (onboarding). Before that there is nothing to have gone quiet from.
  onboarded: boolean;
  // Membership on hold today (holiday, injury).
  onHold: boolean;
  reminderDays: number | null | undefined;
}

// Whether a member's logging is followed up at all: set up, not on hold, and check-in reminders not switched off.
export function loggingWatched(m: WatchState): boolean {
  return m.onboarded && !m.onHold && (m.reminderDays ?? DEFAULT_REMINDER_DAYS) !== 0;
}

// D11, the one "gone quiet" rule. `lastLog` may come from a window of recent logs (FOLLOW_UP_WINDOW_DAYS, or the Business tab's 14 days):
// any window of at least QUIET_DAYS gives the same answer.
export function isGoneQuiet(m: WatchState & { lastLog: string | null; createdAt: string; todayIso: string }): boolean {
  return loggingWatched(m) && quietDays(m.lastLog, m.createdAt, m.todayIso) >= QUIET_DAYS;
}

export interface FollowUpInput extends WatchState {
  // The gym's today.
  todayIso: string;
  // Sign-up (a timestamp or a date).
  createdAt: string;
  // Days with anything logged (hasLoggedData) from FOLLOW_UP_WINDOW_DAYS ago, any order, with the weight when one was logged.
  logs: { date: string; bodyweight: number | null }[];
  // Credits balance; null when it cannot be read (no credits reason then).
  balance: number | null;
  // On an open plan that gives credits every week.
  weeklyCredits: boolean;
  // Bookings still booked (not cancelled) from FOLLOW_UP_WINDOW_DAYS ago onwards, future ones included.
  bookings: { date: string; noShow: boolean }[];
}

// Why a member is worth a conversation, or null. Nothing for a member on hold. The logging reasons (gone quiet, missed last week, weight
// stalled) only when their logging is watched; the class reasons (D28) for anyone, set up or not.
export function followUpFor(m: FollowUpInput): FollowUp | null {
  if (m.onHold) return null;
  const today = m.todayIso;
  const windowStart = shift(today, -FOLLOW_UP_WINDOW_DAYS);
  const joined = m.createdAt.slice(0, 10);
  const found: (FollowUpReason & { detail: string })[] = [];

  if (loggingWatched(m)) {
    const dates = m.logs.map((l) => l.date).sort();
    const lastLog = dates.at(-1) ?? null;
    const days = quietDays(lastLog, m.createdAt, today);
    const quiet = days >= QUIET_DAYS;
    if (quiet) {
      if (lastLog) found.push({ kind: 'quiet', label: `${days} days quiet`, detail: `Last log ${shortDate(lastLog)}` });
      // Nothing in the window: never logged if they joined inside it, otherwise all we know is nothing for four weeks.
      else if (joined >= windowStart) found.push({ kind: 'quiet', label: 'Never logged', detail: 'No logs yet' });
      else found.push({ kind: 'quiet', label: 'Quiet 4+ weeks', detail: 'Nothing logged in 4 weeks' });
    }
    // Logging this week but nothing at all last week (Monday to Sunday), for a member who has been here long enough to have had one.
    const lastWeekStart = shift(isoWeekKey(today), -7);
    const lastWeekEnd = shift(lastWeekStart, 6);
    if (!quiet && daysBetween(joined, today) > 14 && !dates.some((d) => d >= lastWeekStart && d <= lastWeekEnd)) {
      found.push({ kind: 'missed', label: 'Missed last week', detail: 'No check-in days last week' });
    }
    const weights = m.logs
      .filter((l) => l.bodyweight != null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((l) => l.bodyweight as number);
    if (weights.length >= 6 && isPlateaued(weights)) {
      found.push({ kind: 'stalled', label: 'Weight stalled', detail: `${weights.length} weigh-ins, no change` });
    }
  }

  // D28: missed 2 or more booked classes (marked no-show) in the last 2 weeks.
  const since = shift(today, -MISSED_CLASSES_DAYS);
  const noShows = m.bookings.filter((b) => b.noShow && b.date >= since && b.date <= today).length;
  if (noShows >= MISSED_CLASSES) {
    found.push({ kind: 'classes', label: `Missed ${noShows} classes`, detail: `${noShows} no-shows in 2 weeks` });
  }

  // D28: out of credits and nothing booked this week or later. Only for a member who goes to classes: on a plan with weekly credits, or
  // booked one in the window. A plan member at 0 who has booked their week is fine (CL19, RO5), and a member who never books is not "out".
  const weekStart = isoWeekKey(today);
  const bookedFromThisWeek = m.bookings.some((b) => b.date >= weekStart);
  const goesToClasses = m.weeklyCredits || m.bookings.some((b) => b.date >= windowStart);
  if (m.balance != null && m.balance <= 0 && !bookedFromThisWeek && goesToClasses) {
    found.push({ kind: 'credits', label: 'Out of credits, not booked', detail: `${m.balance} credits, nothing booked` });
  }

  if (found.length === 0) return null;
  found.sort((a, b) => FOLLOW_UP_KINDS.indexOf(a.kind) - FOLLOW_UP_KINDS.indexOf(b.kind));
  return { reasons: found.map(({ kind, label }) => ({ kind, label })), detail: found[0].detail };
}

// Most reasons first, then by the first reason (gone quiet before the rest), then by name.
export function sortFollowUps<T extends { name: string; reasons: FollowUpReason[] }>(list: T[]): T[] {
  const rank = (t: T) => FOLLOW_UP_KINDS.indexOf(t.reasons[0]?.kind ?? 'stalled');
  return [...list].sort((a, b) => b.reasons.length - a.reasons.length || rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// Whether the member has a reason of this kind.
export const hasReason = (f: FollowUp | null | undefined, kind: FollowUpKind) => !!f?.reasons.some((r) => r.kind === kind);

import type { ClientMembershipRow, DailyLogRow } from '../data/types';
import { addDays, toIsoDate } from './dates';
import { hasLoggedData } from './dailyLog';

// Consecutive days that have any logged data. A blank row (created just so a food diary has somewhere to attach entries) does not
// count: see hasLoggedData. It counts back from today if today is logged, else from yesterday: a day that has not finished yet must not
// break the streak (the web's L2 fix; it used to read 0 every morning until something was logged). It can only be as long as the
// history it is given, so callers should pass as many days as they have.
export function currentStreak(historyLogs: DailyLogRow[], todayIso: string): number {
  const loggedDates = new Set(historyLogs.filter(hasLoggedData).map((l) => l.log_date));
  let streak = 0;
  let cursor = loggedDates.has(todayIso) ? todayIso : toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -1));
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = toIsoDate(addDays(new Date(cursor + 'T00:00:00Z'), -1));
  }
  return streak;
}

// Which week of the 12-week programme a member is in, counted from their first log in the history window
// (week 1 if they have no logs). Same rule as dashboardBundle.ts's programWeek.
export function programWeekFromLogs(historyLogs: Pick<DailyLogRow, 'log_date'>[], todayIso: string): number {
  const first = historyLogs[0]?.log_date;
  if (!first) return 1;
  const days = (new Date(todayIso + 'T00:00:00Z').getTime() - new Date(first).getTime()) / 86400000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

// The "current streak" card is for challenge members (a plan with a set length, like the 6 week challenge). Full-time members are on an
// ongoing plan (no duration), so they do not see it. No plan at all keeps the card, as before.
export function showsStreak(membership: Pick<ClientMembershipRow, 'package'> | null | undefined): boolean {
  if (!membership?.package) return true;
  const weeks = membership.package.duration_weeks;
  return weeks != null && weeks > 0;
}

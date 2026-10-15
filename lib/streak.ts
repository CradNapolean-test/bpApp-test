import type { ClientMembershipRow } from '@/lib/data/types';

// The "current streak" card is for challenge members (a plan with a set length, like the 6 week
// challenge). Full-time members are on an ongoing plan (no duration), so they do not see it.
// No plan at all keeps the card, as before.
export function showsStreak(membership: Pick<ClientMembershipRow, 'package'> | null | undefined): boolean {
  const weeks = membership?.package?.duration_weeks;
  if (!membership?.package) return true;
  return weeks != null && weeks > 0;
}

// ---- the streak count (L2) ----
// Consecutive days with anything logged. It used to start from TODAY, so it read 0 every morning until something was logged, and it was
// worked out from the 84 days the page loads, so it could never pass 85. Now:
//  - it counts back from today if today is logged, else from yesterday (a day that has not finished does not break the streak);
//  - it is given as many days as the caller has (the dashboard looks back a year).
export function currentStreak(loggedDates: Iterable<string>, todayIso: string): number {
  const logged = new Set(loggedDates);
  const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let cursor = logged.has(todayIso) ? todayIso : dayBefore(todayIso);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

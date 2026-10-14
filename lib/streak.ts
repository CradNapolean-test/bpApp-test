import type { ClientMembershipRow } from '@/lib/data/types';

// The "current streak" card is for challenge members (a plan with a set length, like the 6 week
// challenge). Full-time members are on an ongoing plan (no duration), so they do not see it.
// No plan at all keeps the card, as before.
export function showsStreak(membership: Pick<ClientMembershipRow, 'package'> | null | undefined): boolean {
  const weeks = membership?.package?.duration_weeks;
  if (!membership?.package) return true;
  return weeks != null && weeks > 0;
}

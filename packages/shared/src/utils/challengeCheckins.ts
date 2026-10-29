import { planCountdown } from './planCountdown';

// During week 3 and the final week of a fixed-length plan (the 6 week challenge) the member's coach is asked to
// check in with them. One prompt per milestone per membership; a coach marks it done (coach_reviews, 0122).

export type ChallengeMilestone = 'week3' | 'final';

export interface ChallengePrompt {
  milestone: ChallengeMilestone;
  week: number;
  totalWeeks: number;
  daysLeft: number | null;
}

export const challengeReviewKind = (m: ChallengeMilestone): 'challenge_week3' | 'challenge_final' => (m === 'week3' ? 'challenge_week3' : 'challenge_final');

// `reviewed` holds "kind|membershipId" keys the coach has already marked done. Returns null when nothing is due.
export function challengePrompt(
  membership: { id: string; started_at: string; scheduled_end?: string | null; ended_at?: string | null; durationWeeks: number | null },
  today: string,
  reviewed: Set<string>
): ChallengePrompt | null {
  if (membership.ended_at || !membership.durationWeeks) return null;
  const c = planCountdown(membership, today);
  if (c.state !== 'active' || c.week == null || c.totalWeeks == null) return null;
  const base = { week: c.week, totalWeeks: c.totalWeeks, daysLeft: c.daysLeft };
  // The final week wins over week 3 on a short plan where they are the same week.
  if (c.lastWeek && !reviewed.has('challenge_final|' + membership.id)) return { milestone: 'final', ...base };
  if (c.week === 3 && !c.lastWeek && !reviewed.has('challenge_week3|' + membership.id)) return { milestone: 'week3', ...base };
  return null;
}

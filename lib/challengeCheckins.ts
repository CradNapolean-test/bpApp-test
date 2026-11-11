import { planCountdown } from './planCountdown';

// During week 3, and from 10 days before the end of a fixed-length plan (the 6 week challenge), the member's coach is asked to check in with
// them: the second one is about what comes next (D5, RO3). One prompt per milestone per membership; a coach marks it done (coach_reviews,
// 0122). The marker kind is still "challenge_final", so a final-week check-in already marked done is not asked again.

// D5: the coach's To do starts this many days before the plan's planned last day.
export const CHALLENGE_ENDING_DAYS = 10;

export type ChallengeMilestone = 'week3' | 'final';

export interface ChallengePrompt {
  milestone: ChallengeMilestone;
  week: number;
  totalWeeks: number;
  daysLeft: number | null;
  // The planned last day, when there is one.
  endsOn: string | null;
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
  const base = { week: c.week, totalWeeks: c.totalWeeks, daysLeft: c.daysLeft, endsOn: c.endsOn };
  // From 10 days before the planned last day; a plan with no end date set falls back to its final week.
  const ending = c.daysLeft != null ? c.daysLeft <= CHALLENGE_ENDING_DAYS : c.lastWeek;
  // The ending prompt wins over week 3 on a short plan where they overlap.
  if (ending && !reviewed.has('challenge_final|' + membership.id)) return { milestone: 'final', ...base };
  if (c.week === 3 && !ending && !reviewed.has('challenge_week3|' + membership.id)) return { milestone: 'week3', ...base };
  return null;
}

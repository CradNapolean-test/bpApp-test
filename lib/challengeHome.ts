import { planCountdown, type PlanCountdown } from './planCountdown';

// D5 (owner, 11 Nov 2026): a member on a plan with a set length (the 6 Week Challenge) sees on Home where they are in it
// ("Week 5 of 6 · ends 14 Nov") and, in the last 2 weeks, a "What's next" card offering the gym's ongoing plan (Big Dog) or a call
// with their coach. Nothing is bought in the app: both choices open the chat with their coach, with a message ready to send.
// The phone has the same rules in packages/shared/src/utils/challengeHome.ts.

export const WHATS_NEXT_WEEKS = 2;

interface MembershipLike {
  started_at: string;
  scheduled_end?: string | null;
  ended_at?: string | null;
  package: { name: string; duration_weeks?: number | null } | null;
}

export interface ChallengeHome {
  planName: string;
  countdown: PlanCountdown;
  // "Week 5 of 6 · ends 14 Nov", "Final week · ends 14 Nov", "Last day today", "Starts 17 Nov", "Ended 14 Nov".
  label: string;
  // The last WHATS_NEXT_WEEKS weeks, or the plan's end has passed while it is still open.
  whatsNext: boolean;
}

// `today` is the member's own date (todayIsoInTz); `fmt` writes an ISO date for display ("14 Nov"). Null for an ongoing plan or none.
export function challengeHome(membership: MembershipLike | null | undefined, today: string, fmt: (iso: string) => string): ChallengeHome | null {
  const weeks = membership?.package?.duration_weeks;
  if (!membership?.package || !weeks || weeks <= 0) return null;
  const c = planCountdown({ ...membership, durationWeeks: weeks }, today);
  const ends = c.endsOn ? ` · ends ${fmt(c.endsOn)}` : '';
  let label: string;
  let whatsNext = false;
  if (c.state === 'upcoming') {
    label = `Starts ${fmt(c.startsOn)}`;
  } else if (c.state === 'ended') {
    label = c.endsOn ? `Ended ${fmt(c.endsOn)}` : 'Ended';
    whatsNext = true;
  } else {
    const week = c.week ?? 1;
    if (c.daysLeft === 0) label = 'Last day today';
    else label = c.lastWeek ? `Final week${ends}` : `Week ${week} of ${weeks}${ends}`;
    // By week number, as the label counts, or by the end date when the coach set it sooner than the length says.
    whatsNext = week > weeks - WHATS_NEXT_WEEKS || (c.daysLeft != null && c.daysLeft < WHATS_NEXT_WEEKS * 7);
  }
  return { planName: membership.package.name, countdown: c, label, whatsNext };
}

export interface PlanOption {
  id: string;
  name: string;
  credits_per_week: number;
  duration_weeks?: number | null;
}

// The gym's ongoing plans (no set length), the most sessions first: what a challenge member can carry on with. At most `limit`.
export function ongoingPlans<T extends PlanOption>(packages: readonly T[], limit = 3): T[] {
  return packages
    .filter((p) => !p.duration_weeks || p.duration_weeks <= 0)
    .sort((a, b) => b.credits_per_week - a.credits_per_week || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// The message waiting in the chat when the member taps a choice. They read it and send it themselves.
export function whatsNextDraft(home: Pick<ChallengeHome, 'planName' | 'countdown'>, choice: { plan: string } | 'call', fmt: (iso: string) => string): string {
  const { endsOn, state } = home.countdown;
  const when = state === 'ended' ? (endsOn ? `finished on ${fmt(endsOn)}` : 'has finished') : endsOn ? `ends on ${fmt(endsOn)}` : 'is nearly over';
  const opener = `Hi! My ${home.planName} ${when}.`;
  return choice === 'call'
    ? `${opener} Could we have a quick call about what's next for me?`
    : `${opener} I'd like to carry on with ${choice.plan}. What do I need to do?`;
}

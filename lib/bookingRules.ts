import { formatClock } from './utils/cancelDeadline';

// The cancellation policy sentence on the member's booking screen (L5). It used to read the overnight window and the cut-off from the
// first upcoming session, so a gym with nothing scheduled showed the wrong rule (or the default 3 hours), and a class with its own cut-off
// was described by another class's. The overnight window is the gym's (sent with the dashboard); each class has its own cut-off, and the
// sentence says "the cut-off shown on each session" rather than guessing when they differ.

export interface GymBlackout {
  start: string | null;
  end: string | null;
}

const FALLBACK_HOURS = 3;

// The cut-off to describe, from the sessions and bookings in front of the member: the one value they all share, or null when they differ.
export function sharedCutoffHours(cutoffs: (number | null | undefined)[]): number | null {
  const distinct = [...new Set(cutoffs.filter((c): c is number => c != null))];
  if (distinct.length === 0) return FALLBACK_HOURS;
  return distinct.length === 1 ? distinct[0] : null;
}

export function cancellationPolicyText(blackout: GymBlackout | null, cutoffs: (number | null | undefined)[]): string {
  const hours = sharedCutoffHours(cutoffs);
  const lead =
    hours == null
      ? 'Each session has its own cancel-by time, shown on the session, to keep your credit.'
      : `Cancel at least ${hours} hour${hours === 1 ? '' : 's'} before a session to keep your credit.`;
  if (!blackout?.start || !blackout.end) return lead;
  const from = formatClock(blackout.start.slice(0, 5));
  const to = formatClock(blackout.end.slice(0, 5));
  return `${lead} Overnight (${from}–${to}) doesn't count, so for early-morning sessions, cancel by ${from} the night before.`;
}

// Coach follow-through (RO19, CW5): what each COACH did, beside what their members did. The database (coach_follow_through, migration 0176)
// hands over counts and times only, never a message's text or a member's id; the counting rules live here so they can be tested.
//
//   Check-ins reviewed: weeks a member who finished onboarding logged anything in, over the last 4 complete weeks (due), and how many of
//     those weeks have a "Reviewed" mark (the dashboard's To do rule).
//   Waiting for a reply: conversations whose newest messages are the member's, under the member's coach, unless the coach marked them
//     "No reply needed" after the member's newest message (the Messages list's Needs reply rule, lib/inboxOverview.ts).
//   Oldest waiting: when the earliest of those unanswered messages was sent.
//   Usual reply time: the median, over the last 30 days, of the time from a member's first unanswered message to the coach's next message.

// What a screen says when it is deployed before migration 0176 is applied.
export const READ_NEEDS_0176 = "These figures need a database update (migration 0176) that hasn't been applied yet.";

export interface FollowThroughCoachRow {
  coachId: string;
  name: string;
  members: number;
  checkinsDue: number;
  checkinsReviewed: number;
}

export interface WaitingThread {
  coachId: string;
  // The member's first message since the last staff message, and their newest.
  since: string;
  lastAt: string;
  // The coach's "No reply needed" mark on the conversation, if any (0160).
  noReplyAt: string | null;
}

export interface ReplyTime {
  coachId: string;
  seconds: number;
}

export interface FollowThroughRaw {
  gymId: string;
  today: string;
  weeksFrom: string;
  weeks: number;
  coaches: FollowThroughCoachRow[];
  waiting: WaitingThread[];
  replies: ReplyTime[];
}

export interface CoachFollowThrough {
  coachId: string;
  name: string;
  members: number;
  checkinsDue: number;
  checkinsReviewed: number;
  // Conversations waiting for this coach's reply, and when the oldest unanswered message among them was sent (null when none waits).
  waiting: number;
  oldestWaitingSince: string | null;
  // Median seconds to reply over the last 30 days, and how many replies that is (null when there were none).
  medianReplySeconds: number | null;
  replies: number;
}

export interface GymFollowThrough {
  gymId: string;
  weeks: number;
  weeksFrom: string;
  coaches: CoachFollowThrough[];
}

// The middle value; for an even count, the mean of the two middle values. Null for no values. Never the mean of everything: one reply
// a week late would drag a mean far from what members usually wait.
export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const time = (iso: string) => Date.parse(iso);

// Still waiting: the coach has not marked the conversation "No reply needed" since the member's newest message.
export function stillWaiting(thread: Pick<WaitingThread, 'lastAt' | 'noReplyAt'>): boolean {
  if (!thread.noReplyAt) return true;
  return time(thread.lastAt) > time(thread.noReplyAt);
}

export function summariseFollowThrough(raw: FollowThroughRaw): GymFollowThrough {
  const coaches = raw.coaches.map((c): CoachFollowThrough => {
    const waiting = raw.waiting.filter((w) => w.coachId === c.coachId && stillWaiting(w));
    const oldest = waiting.reduce<string | null>((min, w) => (min === null || time(w.since) < time(min) ? w.since : min), null);
    const seconds = raw.replies.filter((r) => r.coachId === c.coachId).map((r) => r.seconds);
    return {
      coachId: c.coachId,
      name: c.name,
      members: c.members,
      checkinsDue: c.checkinsDue,
      checkinsReviewed: Math.min(c.checkinsReviewed, c.checkinsDue),
      waiting: waiting.length,
      oldestWaitingSince: oldest,
      medianReplySeconds: median(seconds),
      replies: seconds.length,
    };
  });
  return { gymId: raw.gymId, weeks: raw.weeks, weeksFrom: raw.weeksFrom, coaches };
}

// "under a minute", "25 min", "3 h", "2 days": a reply time or a wait, rounded the way a person would say it.
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return 'under a minute';
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(s / 3600);
  if (hours < 48) return `${hours} h`;
  const days = Math.round(s / 86_400);
  return `${days} days`;
}

// How long the oldest waiting message has waited, as of `now`.
export function waitedLabel(since: string, now: Date = new Date()): string {
  return durationLabel((now.getTime() - time(since)) / 1000);
}

// "7 of 9" (or "–" when nothing was due), for the check-ins column.
export function reviewedLabel(c: Pick<CoachFollowThrough, 'checkinsDue' | 'checkinsReviewed'>): string {
  return c.checkinsDue === 0 ? '–' : `${c.checkinsReviewed} of ${c.checkinsDue}`;
}

// A wait of more than two days is worth a colour.
export const LONG_WAIT_SECONDS = 2 * 86_400;

export function isLongWait(since: string | null, now: Date = new Date()): boolean {
  return since !== null && now.getTime() - time(since) > LONG_WAIT_SECONDS * 1000;
}

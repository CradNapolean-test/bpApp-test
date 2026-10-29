// Session clubs. The bar never drops back to zero: it is one bar from 0 to the next club, split into coloured
// stages at each club already reached (0-100, then 101-250, then 251-500 ...). The next stage grows the range.
//
// Clubs: 100, 250 and 500, then every 500 after that. Change CLUB_MILESTONES to move them.
export const CLUB_MILESTONES = [100, 250, 500];
const CLUB_STEP_AFTER = 500;

// The club after `sessions`: the first milestone above it, or the next multiple of 500 once past the list.
function nextMilestone(sessions: number): number {
  const fixed = CLUB_MILESTONES.find((m) => m > sessions);
  if (fixed != null) return fixed;
  const last = CLUB_MILESTONES[CLUB_MILESTONES.length - 1];
  return last + (Math.floor((sessions - last) / CLUB_STEP_AFTER) + 1) * CLUB_STEP_AFTER;
}

// Every club from the start up to and including `upTo`, e.g. [100, 250, 500, 1000].
function milestonesUpTo(upTo: number): number[] {
  const out = CLUB_MILESTONES.filter((m) => m <= upTo);
  let m = CLUB_MILESTONES[CLUB_MILESTONES.length - 1];
  while (m < upTo) {
    m += CLUB_STEP_AFTER;
    out.push(m);
  }
  return out;
}

export interface ClubSegment {
  from: number; // sessions at the start of the stage (0 for the first)
  to: number; // the club that ends the stage
  widthPct: number; // share of the whole bar
  fill: number; // 0..1 of this stage that is filled
  reached: boolean; // the club at the end of this stage has been earned
}

export interface ClubProgress {
  earned: number[]; // clubs reached so far, e.g. [100, 250]
  next: number; // the club being worked towards
  toGo: number; // sessions left to reach it (always at least 1)
  segments: ClubSegment[];
}

export function clubProgress(sessions: number): ClubProgress {
  const done = Math.max(0, Math.floor(sessions));
  const next = nextMilestone(done);
  const stops = milestonesUpTo(next); // earned clubs plus `next`
  const earned = stops.filter((m) => m <= done);
  let from = 0;
  const segments: ClubSegment[] = stops.map((to) => {
    const seg = { from, to, widthPct: ((to - from) / next) * 100, fill: Math.min(1, Math.max(0, (done - from) / (to - from))), reached: to <= done };
    from = to;
    return seg;
  });
  return { earned, next, toGo: next - done, segments };
}

// Club badges to draw: every fixed club plus any further ones reached or next up.
export function clubBadges(sessions: number): { n: number; reached: boolean }[] {
  const { next } = clubProgress(sessions);
  const upTo = Math.max(next, CLUB_MILESTONES[CLUB_MILESTONES.length - 1]);
  return milestonesUpTo(upTo).map((n) => ({ n, reached: n <= Math.floor(sessions) }));
}

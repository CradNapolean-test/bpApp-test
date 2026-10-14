// Session clubs: every 100 attended sessions is a club (100, 200, 300 ...). The bar always shows the
// lap towards the NEXT club, so it starts again from 0 the moment a club is reached.
export const CLUB_STEP = 100;

export interface ClubProgress {
  earned: number; // clubs reached so far
  next: number; // the next club's session count, e.g. 200
  toGo: number; // sessions left to reach it (always 1..CLUB_STEP)
  pct: number; // 0..99, progress through the current lap
}

export function clubProgress(sessions: number): ClubProgress {
  const done = Math.max(0, Math.floor(sessions));
  const earned = Math.floor(done / CLUB_STEP);
  const next = (earned + 1) * CLUB_STEP;
  return { earned, next, toGo: next - done, pct: Math.round(((done % CLUB_STEP) / CLUB_STEP) * 100) };
}

// Club badges to draw: every club reached, plus the next one (at least `min` in total).
export function clubBadges(sessions: number, min = 5): { n: number; reached: boolean }[] {
  const { earned } = clubProgress(sessions);
  const count = Math.max(min, earned + 1);
  return Array.from({ length: count }, (_, k) => ({ n: (k + 1) * CLUB_STEP, reached: k < earned }));
}

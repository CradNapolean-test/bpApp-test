// The numbers on the member Home screen's "Your progress" block (sessions done, member-for months, club bar).
// Same rules as the web Home (BpHome.tsx), kept here so the phone app shows identical figures.


// Whole calendar months from `startIso` (yyyy-mm-dd) to `now`, never negative: a membership that starts later this
// month, or in the future, is 0.
export function monthsSince(startIso: string, now: Date): number {
  const start = new Date(startIso + 'T00:00:00Z');
  return Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()));
}


// The nearest sessions reward the member has not reached yet (e.g. "Hoodie" at 100), shown on the club bar.
export function nextSessionsReward<R extends { kind: string; threshold: number }>(rewards: R[], sessionsDone: number): R | undefined {
  return rewards.filter((r) => r.kind === 'sessions' && r.threshold > sessionsDone).sort((a, b) => a.threshold - b.threshold)[0];
}

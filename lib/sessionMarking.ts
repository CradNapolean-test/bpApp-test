// The coach's Sessions screen: the "N sessions need attendance marking" banner, the "N to mark" badges and the strip's dots follow what
// the coach marks in the open session straight away, not only after a page reload (BK20). Only numbers here.

interface Marking {
  status: string;
  attended: boolean;
  noShow: boolean;
}

// Booked places still unmarked: the same rule as the page's count (countSessionBookings), for a session that has started.
export function unmarkedInRoster(roster: readonly Marking[]): number {
  return roster.filter((r) => r.status === 'booked' && !r.attended && !r.noShow).length;
}

// The counts the screen knows better than the page: those it remembered when a session closed, and the open one's live count.
export interface MarkedCounts {
  // The occurrences the remembered counts were made against: a fresh page (after a save elsewhere, or a reload) has its own counts.
  source: unknown;
  counts: Readonly<Record<string, number>>;
}

export function sessionKey(o: { classId: string; date: string }): string {
  return `${o.classId}|${o.date}`;
}

// The occurrences with their "to mark" counts brought up to date. `live` is the open session's count from its roster, when it has
// started and its roster has loaded.
export function withMarkedCounts<T extends { classId: string; date: string; unmarkedCount?: number }>(
  occurrences: T[],
  remembered: MarkedCounts | null,
  live: { key: string; count: number } | null
): T[] {
  const counts: Record<string, number> = remembered && remembered.source === occurrences ? { ...remembered.counts } : {};
  if (live) counts[live.key] = live.count;
  if (Object.keys(counts).length === 0) return occurrences;
  return occurrences.map((o) => {
    const key = sessionKey(o);
    return key in counts && counts[key] !== (o.unmarkedCount ?? 0) ? { ...o, unmarkedCount: counts[key] } : o;
  });
}

// Remembers one session's count against the occurrences on screen, keeping the others remembered for the same occurrences.
export function rememberCount(remembered: MarkedCounts | null, occurrences: unknown, key: string, count: number): MarkedCounts {
  const kept = remembered && remembered.source === occurrences ? remembered.counts : {};
  return { source: occurrences, counts: { ...kept, [key]: count } };
}

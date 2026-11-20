import { toMinutes } from '@/lib/todaySessions';

// Small rules behind the coach dashboard, kept here so they can be tested without a database.

// Whether a session had started by `nowMinute` (minutes since midnight at the gym). A session with no start time can't be placed
// before or after now, so it hasn't: toMinutes reads a missing time as midnight, which counted every such session in
// "this time last week" from the first minute of the day.
export function startedBy(startTime: string | null, nowMinute: number): boolean {
  return startTime != null && startTime !== '' && toMinutes(startTime) <= nowMinute;
}

// The number of meal photos on a logged day. The dashboard reads them as food_photo_entries(count), one row holding the count, instead
// of a row per photo (item 9); no row at all reads as none.
export function photoCount(entries: { count?: number | null }[] | null | undefined): number {
  return entries?.[0]?.count ?? 0;
}

// Names for the activity feed: the dashboard's own members by the name it shows them under, then anyone else in the (gym-wide) feed by
// their profile name, so a member of another coach reads as a name, not "A client".
export function activityFeedNames(nameById: Record<string, string>, others: Record<string, string>): Record<string, string> {
  const names: Record<string, string> = { ...nameById };
  for (const [id, name] of Object.entries(others)) if (!names[id] && name) names[id] = name;
  return names;
}

// The most review markers "Mark all reviewed" writes in one go (one database call for the lot).
export const MARK_ALL_MAX = 200;

// The rows for marking several things of one kind reviewed in one insert: blank and repeated ones dropped, and refused (null) when
// there are more than MARK_ALL_MAX.
export function reviewRows<K extends string>(kind: K, items: { clientId: string; ref: string }[]): { kind: K; client_id: string; ref: string }[] | null {
  const seen = new Set<string>();
  const rows: { kind: K; client_id: string; ref: string }[] = [];
  for (const i of items) {
    if (!i.clientId || !i.ref) continue;
    const key = `${i.clientId}|${i.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind, client_id: i.clientId, ref: i.ref });
  }
  return rows.length > MARK_ALL_MAX ? null : rows;
}

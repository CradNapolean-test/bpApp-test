import type { ActivityEventRow } from '@/lib/data/types';

export interface ActivityFeedItem {
  clientId: string;
  type: ActivityEventRow['event_type'];
  summary: string;
  occurredAt: string;
}

function summarize(type: ActivityEventRow['event_type'], detail: string | null, count: number): string {
  switch (type) {
    case 'measurement':
      return 'Recorded measurements';
    case 'habit':
      return count === 1 ? `Completed ${detail}` : `Completed ${count} habits`;
    case 'workout':
      return count === 1 ? 'Logged a set' : `Logged ${count} sets`;
    case 'photo':
      return count === 1 ? 'Uploaded a photo' : `Uploaded ${count} photos`;
    case 'booking':
      return count === 1 ? `Booked ${detail}` : `Booked ${count} classes`;
    case 'food':
      if (count > 1) return `Added ${count} meals`;
      return detail ? `Added to ${detail}` : 'Added a meal';
  }
}

// Groups raw per-event rows (one per set logged, one per food entry, etc.) into one item per
// (client, type, day) -- matches PT Distinction's own dashboard style ("Added 3 meals and
// recorded drinks"), since one row per raw event would flood the feed: a single workout
// session alone can produce 15+ workout_logs rows in a few minutes.
export function groupActivity(events: ActivityEventRow[]): ActivityFeedItem[] {
  const groups = new Map<string, { type: ActivityEventRow['event_type']; clientId: string; detail: string | null; occurredAt: string; count: number }>();

  for (const e of events) {
    const key = `${e.client_id}|${e.event_type}|${e.occurred_at.slice(0, 10)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { type: e.event_type, clientId: e.client_id, detail: e.detail, occurredAt: e.occurred_at, count: 1 });
    }
  }

  // events arrives `order by occurred_at desc`, so each group's first-seen row is already its
  // latest -- no re-sort needed, Map preserves insertion order which already matches that.
  return Array.from(groups.values()).map((g) => ({
    clientId: g.clientId,
    type: g.type,
    summary: summarize(g.type, g.detail, g.count),
    occurredAt: g.occurredAt,
  }));
}

// Pure helpers for the coach inbox's conversation list (useCoachMessages): ordering, merging a fresh copy from the server into what the
// screen already shows, and choosing which conversations get a live connection.

export interface OverviewRowLike {
  client_id: string;
  last_message_at: string | null;
  unread_count: number;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

// Newest message first; conversations with no message last (stable for equal times).
export function sortOverview<T extends OverviewRowLike>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return time(b.last_message_at) - time(a.last_message_at);
  });
}

// Merges a fresh copy of the list from the server into the list on screen (the screen's copy has been moved on by live messages
// and by marking things read). New conversations appear, in particular a member's FIRST ever message, which has no live
// connection yet. Rules, per conversation:
//   * the server has no such conversation -> it is dropped;
//   * the screen has a NEWER message than the server's copy (a live message the fetch has not seen) -> the screen's row is kept;
//   * the conversation is open on screen -> unread stays 0 (the chat marks it read as it is viewed);
//   * the same message, but the screen already shows it read (the save is still in flight) -> unread stays 0;
//   * otherwise -> the server's row.
export function mergeOverview<T extends OverviewRowLike>(onScreen: T[], fresh: T[], openClientId: string | null): T[] {
  const byId = new Map(onScreen.map((row) => [row.client_id, row]));
  const merged = fresh.map((serverRow) => {
    const screenRow = byId.get(serverRow.client_id);
    const isOpen = serverRow.client_id === openClientId;
    if (!screenRow) return isOpen ? { ...serverRow, unread_count: 0 } : serverRow;
    const screenTime = time(screenRow.last_message_at);
    const serverTime = time(serverRow.last_message_at);
    if (screenTime > serverTime) return isOpen ? { ...screenRow, unread_count: 0 } : screenRow;
    if (isOpen) return { ...serverRow, unread_count: 0 };
    if (screenTime === serverTime && screenRow.unread_count === 0) return { ...serverRow, unread_count: 0 };
    return serverRow;
  });
  return sortOverview(merged);
}

// Which conversations get a live connection: the most recent ones that have a message, plus the open one. Supabase limits how many
// channels one connection can hold (about 100), so a coach with hundreds of conversations cannot have one for each; the list is
// refetched on a timer and on focus for the rest. Returned sorted, so the same set always gives the same list.
export function pickChannelClients<T extends OverviewRowLike>(rows: T[], openClientId: string | null, limit = 40): string[] {
  const recent = sortOverview(rows.filter((row) => row.last_message_at != null))
    .slice(0, limit)
    .map((row) => row.client_id);
  const ids = new Set(recent);
  if (openClientId) ids.add(openClientId);
  return [...ids].sort();
}

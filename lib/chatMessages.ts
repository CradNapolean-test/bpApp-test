import type { ChatMessage } from '@/lib/data/types';

// Chat paging and merging, as pure helpers (H5, M5). A thread used to be read whole, oldest first, so past about 1,000 messages the
// database stopped at its row cap and the newest ones were the ones missing. Now a thread opens on its latest page and older pages
// are asked for; what comes from the server, from the live connection and from this device's own sends is merged by id.

export const CHAT_PAGE = 50;
// The most a catch-up after a dropped connection fetches in one go.
export const CHAT_CATCH_UP_MAX = 200;

// A message the sender sees at once while it is still being saved ("sending"), or one that could not be saved ("failed").
export type LocalChatMessage = ChatMessage & { pending?: 'sending' | 'failed' };

// Rows asked for newest first (one more than the page, to learn whether there are older ones) -> the page oldest first.
export function pageOfNewestFirst<T>(rowsNewestFirst: T[], limit: number): { rows: T[]; hasMore: boolean } {
  const hasMore = rowsNewestFirst.length > limit;
  return { rows: rowsNewestFirst.slice(0, limit).reverse(), hasMore };
}

function byTime(a: ChatMessage, b: ChatMessage): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Oldest first, one entry per id. A message the sender has not had confirmed yet stays at the end, in the order it was sent. When the
// same message arrives twice (from the server and from the live connection) the one that already has a signed link keeps it.
export function mergeMessages(current: LocalChatMessage[], incoming: LocalChatMessage[]): LocalChatMessage[] {
  const byId = new Map<string, LocalChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(
      m.id,
      existing
        ? { ...existing, ...m, signedAudioUrl: m.signedAudioUrl ?? existing.signedAudioUrl, signedImageUrl: m.signedImageUrl ?? existing.signedImageUrl }
        : m
    );
  }
  const all = [...byId.values()];
  const saved = all.filter((m) => !m.pending).sort(byTime);
  const waiting = all.filter((m) => m.pending);
  return [...saved, ...waiting];
}

// A message arriving on the live connection. If it is one this person just sent, and the device is still showing it as "sending",
// it takes that message's place instead of appearing twice.
export function applyIncoming(current: LocalChatMessage[], row: LocalChatMessage): LocalChatMessage[] {
  if (current.some((m) => m.id === row.id)) return mergeMessages(current, [row]);
  if (row.text != null && !row.audio_path && !row.image_path) {
    const index = current.findIndex((m) => m.pending === 'sending' && m.sender_id === row.sender_id && m.text === row.text);
    if (index >= 0) {
      const without = current.filter((_, i) => i !== index);
      return mergeMessages(without, [row]);
    }
  }
  return mergeMessages(current, [row]);
}

// When the newest saved message was written: what a catch-up asks "anything after this?" from. Null for an empty thread.
export function lastSavedAt(messages: LocalChatMessage[]): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (m.pending) continue;
    if (latest === null || m.created_at > latest) latest = m.created_at;
  }
  return latest;
}

// The oldest saved message: where "Load earlier" starts from.
export function firstSavedAt(messages: LocalChatMessage[]): string | null {
  let first: string | null = null;
  for (const m of messages) {
    if (m.pending) continue;
    if (first === null || m.created_at < first) first = m.created_at;
  }
  return first;
}

// A page that came back full may have older messages behind it; the exact answer comes with the first "Load earlier".
export function mayHaveEarlier(loadedCount: number): boolean {
  return loadedCount >= CHAT_PAGE;
}

// A signed link lasts ten minutes; one older than this is made again before it is used.
export const SIGNED_LINK_FRESH_MS = 8 * 60 * 1000;
export function linkIsFresh(signedAtMs: number | null, nowMs: number): boolean {
  return signedAtMs != null && nowMs - signedAtMs < SIGNED_LINK_FRESH_MS;
}

import type { ChatMessageRow } from '../data/types';
import { isoDateInTz } from './dates';

// Limits the app applies before anything is sent. The database has no length limit on chat text and the chat
// buckets have no size or type limit, so these keep an honest client well inside sensible bounds.
export const CHAT_PAGE_SIZE = 30;
export const CHAT_TEXT_MAX = 4000;
export const CHAT_PHOTO_MAX_EDGE = 1600; // same as the web's shrinkImage
export const VOICE_NOTE_MIN_SECONDS = 1;
export const VOICE_NOTE_MAX_SECONDS = 300;
export const SIGNED_URL_SECONDS = 600; // same as the web

// What the app keeps per conversation: newest first, plus whether older messages may still exist.
export type ChatThread = { messages: ChatMessageRow[]; hasMore: boolean };

function stamp(m: ChatMessageRow): number {
  const t = Date.parse(m.created_at);
  return Number.isNaN(t) ? 0 : t;
}

export function newestFirst(a: ChatMessageRow, b: ChatMessageRow): number {
  return stamp(b) - stamp(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

// Union by id, newest first. Messages are immutable, so an id we already hold is never replaced.
export function mergeMessages(existing: ChatMessageRow[], incoming: ChatMessageRow[]): ChatMessageRow[] {
  const byId = new Map<string, ChatMessageRow>();
  for (const m of incoming) byId.set(m.id, m);
  for (const m of existing) byId.set(m.id, m);
  return [...byId.values()].sort(newestFirst);
}

// The newest page arrived (first open, or a refetch). Merging rather than replacing keeps older pages the member
// scrolled back through, and keeps messages that slid out of the newest 30 while the app was open.
export function applyLatest(prev: ChatThread | undefined, latest: ChatMessageRow[], pageSize = CHAT_PAGE_SIZE): ChatThread {
  if (!prev) return { messages: [...latest].sort(newestFirst), hasMore: latest.length >= pageSize };
  return { messages: mergeMessages(prev.messages, latest), hasMore: prev.hasMore };
}

// An older page arrived after "load earlier". A short page means we reached the start of the conversation.
export function applyOlder(prev: ChatThread, older: ChatMessageRow[], pageSize = CHAT_PAGE_SIZE): ChatThread {
  return { messages: mergeMessages(prev.messages, older), hasMore: older.length >= pageSize };
}

// A message arrived live (or our own send came back). Does nothing until the thread has been loaded once.
export function applyLive(prev: ChatThread | undefined, row: ChatMessageRow): ChatThread | undefined {
  if (!prev) return prev;
  if (prev.messages.some((m) => m.id === row.id)) return prev;
  return { ...prev, messages: mergeMessages(prev.messages, [row]) };
}

// The cursor for "load earlier": the stored timestamp string of the oldest message held, exactly as the server
// sent it (a Date would cut microseconds and could skip a row).
export function oldestCursor(thread: ChatThread): string | null {
  return thread.messages.length ? thread.messages[thread.messages.length - 1].created_at : null;
}

export type MessageKind = 'photo' | 'voice' | 'text';
export function messageKind(m: Pick<ChatMessageRow, 'image_path' | 'audio_path'>): MessageKind {
  if (m.image_path) return 'photo';
  if (m.audio_path) return 'voice';
  return 'text';
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayLabel(iso: string, now: Date, tz: string): string {
  const day = isoDateInTz(new Date(iso), tz);
  const today = isoDateInTz(now, tz);
  if (day === today) return 'Today';
  if (day === shiftIso(today, -1)) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
}

export function timeLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).replace(' ', '');
}

export type ChatListEntry = { message: ChatMessageRow; dayLabel: string | null };

// For a list drawn newest-at-the-bottom: a day heading goes above the first (oldest) message of each day.
export function withDayLabels(newestFirstMessages: ChatMessageRow[], now: Date, tz: string): ChatListEntry[] {
  return newestFirstMessages.map((message, i) => {
    const older = newestFirstMessages[i + 1];
    const day = isoDateInTz(new Date(message.created_at), tz);
    const showHeading = !older || isoDateInTz(new Date(older.created_at), tz) !== day;
    return { message, dayLabel: showHeading ? dayLabel(message.created_at, now, tz) : null };
  });
}

export type OutgoingText = { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long' };
export function normalizeOutgoingText(raw: string): OutgoingText {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > CHAT_TEXT_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, text };
}

// Stable pseudo-random bar heights per message, so a voice note always draws the same waveform (same as the web).
export function waveHeights(seed: string, bars = 24): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: bars }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return 5 + (h % 14);
  });
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds < 0) return '';
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The size to shrink a photo to: the longer edge becomes `max`, or null when it is already small enough.
export function shrinkTarget(width: number, height: number, max = CHAT_PHOTO_MAX_EDGE): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (!longest || longest <= max) return null;
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// A random id for file names and not-yet-sent messages (not for anything secret). `rng` is injectable for tests.
export function newLocalId(rng: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(rng() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

// Chat files live under the member's own folder, which is what the storage policies check (owns_client on folder 1).
export function chatStoragePath(clientId: string, id: string, ext: string): string {
  return `${clientId}/${id}.${ext}`;
}

export function voiceNoteFormat(isWeb: boolean): { ext: string; contentType: string } {
  return isWeb ? { ext: 'webm', contentType: 'audio/webm' } : { ext: 'm4a', contentType: 'audio/mp4' };
}

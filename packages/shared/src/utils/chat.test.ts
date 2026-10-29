import { describe, expect, it } from 'vitest';

import type { ChatMessageRow } from '../data/types';
import {
  CHAT_PAGE_SIZE,
  CHAT_TEXT_MAX,
  applyLatest,
  applyLive,
  applyOlder,
  chatStoragePath,
  dayLabel,
  formatDuration,
  mergeMessages,
  messageKind,
  newLocalId,
  normalizeOutgoingText,
  oldestCursor,
  shrinkTarget,
  timeLabel,
  voiceNoteFormat,
  waveHeights,
  withDayLabels,
} from './chat';

function msg(n: number, over: Partial<ChatMessageRow> = {}): ChatMessageRow {
  // n minutes after midnight UTC on 2026-10-10
  const at = new Date(Date.UTC(2026, 9, 10, 0, n)).toISOString();
  return { id: `m${String(n).padStart(4, '0')}`, client_id: 'c', sender_id: 's', text: `t${n}`, audio_path: null, audio_duration_seconds: null, image_path: null, created_at: at, ...over };
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

describe('mergeMessages', () => {
  it('unions by id and sorts newest first', () => {
    const merged = mergeMessages([msg(5), msg(3)], [msg(4), msg(3)]);
    expect(merged.map((m) => m.id)).toEqual(['m0005', 'm0004', 'm0003']);
  });

  it('keeps the copy we already hold (messages are immutable)', () => {
    const held = msg(2, { text: 'held' });
    expect(mergeMessages([held], [msg(2, { text: 'other' })])[0].text).toBe('held');
  });

  it('orders equal timestamps deterministically', () => {
    const a = msg(1, { id: 'a', created_at: '2026-10-10T00:00:00Z' });
    const b = msg(1, { id: 'b', created_at: '2026-10-10T00:00:00Z' });
    expect(mergeMessages([a], [b]).map((m) => m.id)).toEqual(['b', 'a']);
    expect(mergeMessages([b], [a]).map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('paging', () => {
  it('first load: a full page means older messages may exist', () => {
    const t = applyLatest(undefined, range(1, CHAT_PAGE_SIZE));
    expect(t.hasMore).toBe(true);
    expect(t.messages[0].id).toBe('m0030');
  });

  it('first load: a short page means that is everything', () => {
    expect(applyLatest(undefined, range(1, 5)).hasMore).toBe(false);
  });

  it('a refetch keeps older pages the member already loaded and does not lose messages that slid out of the newest page', () => {
    const first = applyLatest(undefined, range(21, 50));
    const withOlder = applyOlder(first, range(1, 20), 30);
    expect(withOlder.messages).toHaveLength(50);
    // two new messages arrive while the app is open, then the newest page is refetched (now 23..52)
    const refetched = applyLatest(withOlder, range(23, 52));
    expect(refetched.messages).toHaveLength(52);
    expect(refetched.messages.map((m) => m.id)).toContain('m0021');
    expect(refetched.messages.map((m) => m.id)).toContain('m0022');
    expect(refetched.hasMore).toBe(withOlder.hasMore);
  });

  it('loading earlier: a short page ends the history', () => {
    const t = applyLatest(undefined, range(21, 50));
    expect(applyOlder(t, range(1, 20)).hasMore).toBe(false);
    expect(applyOlder(t, range(-9, 20)).hasMore).toBe(true);
  });

  it('cursor is the oldest stored timestamp exactly as the server sent it', () => {
    const t = applyLatest(undefined, [msg(2, { created_at: '2026-10-10T00:02:00.123456+00:00' }), msg(9)]);
    expect(oldestCursor(t)).toBe('2026-10-10T00:02:00.123456+00:00');
    expect(oldestCursor({ messages: [], hasMore: false })).toBeNull();
  });
});

describe('applyLive', () => {
  it('ignores live messages until the thread was loaded once', () => {
    expect(applyLive(undefined, msg(1))).toBeUndefined();
  });

  it('adds a new message at the top, and the same message twice only once (own send echoed back)', () => {
    const t = applyLatest(undefined, range(1, 3));
    const once = applyLive(t, msg(4))!;
    expect(once.messages[0].id).toBe('m0004');
    const twice = applyLive(once, msg(4))!;
    expect(twice).toBe(once);
  });
});

describe('labels', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('says Today and Yesterday in the member timezone', () => {
    expect(dayLabel('2026-10-12T08:00:00Z', now, 'Europe/London')).toBe('Today');
    expect(dayLabel('2026-10-11T22:30:00Z', now, 'Europe/London')).toBe('Yesterday'); // 23:30 BST on the 11th
  });

  it('uses the member timezone, not UTC, to decide the day', () => {
    // 12:00 UTC on the 11th is still the 11th in London but already 01:00 on the 12th in Auckland (+13)
    expect(dayLabel('2026-10-11T12:00:00Z', now, 'Europe/London')).toBe('Yesterday');
    expect(dayLabel('2026-10-11T12:00:00Z', now, 'Pacific/Auckland')).toBe('Today');
    // and BST (+1) moves 23:30 UTC on the 11th into the 12th in London
    expect(dayLabel('2026-10-11T23:30:00Z', now, 'Europe/London')).toBe('Today');
  });

  it('writes older days as a full date', () => {
    expect(dayLabel('2026-10-08T12:00:00Z', now, 'Europe/London')).toBe('Thursday 8 October');
  });

  it('formats the time in the member timezone', () => {
    expect(timeLabel('2026-10-10T08:25:00Z', 'Europe/London')).toBe('9:25am');
    expect(timeLabel('2026-10-10T20:05:00Z', 'Europe/London')).toBe('9:05pm');
  });

  it('puts one heading above the first message of each day', () => {
    const a = msg(10); // 10 Oct
    const b = msg(20); // 10 Oct
    const c = { ...msg(30), created_at: '2026-10-11T09:00:00Z', id: 'next' };
    const entries = withDayLabels([c, b, a], now, 'Europe/London');
    expect(entries.map((e) => e.dayLabel)).toEqual(['Yesterday', null, 'Saturday 10 October']);
  });
});

describe('outgoing text', () => {
  it('trims, and refuses empty or over-long text', () => {
    expect(normalizeOutgoingText('  hi  ')).toEqual({ ok: true, text: 'hi' });
    expect(normalizeOutgoingText('   \n ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeOutgoingText('x'.repeat(CHAT_TEXT_MAX))).toEqual({ ok: true, text: 'x'.repeat(CHAT_TEXT_MAX) });
    expect(normalizeOutgoingText('x'.repeat(CHAT_TEXT_MAX + 1))).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('media helpers', () => {
  it('tells the three kinds of message apart', () => {
    expect(messageKind({ image_path: 'a', audio_path: null })).toBe('photo');
    expect(messageKind({ image_path: null, audio_path: 'a' })).toBe('voice');
    expect(messageKind({ image_path: null, audio_path: null })).toBe('text');
  });

  it('draws the same waveform for the same message every time', () => {
    expect(waveHeights('abc')).toEqual(waveHeights('abc'));
    expect(waveHeights('abc')).not.toEqual(waveHeights('abd'));
    expect(waveHeights('abc')).toHaveLength(24);
    for (const h of waveHeights('anything')) expect(h).toBeGreaterThanOrEqual(5);
  });

  it('formats voice note lengths', () => {
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(0)).toBe('');
  });

  it('shrinks big photos to 1600 on the longer edge and leaves small ones alone', () => {
    expect(shrinkTarget(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(shrinkTarget(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(shrinkTarget(1600, 900)).toBeNull();
    expect(shrinkTarget(0, 0)).toBeNull();
  });

  it('makes uuid-shaped ids and puts files under the member folder', () => {
    expect(newLocalId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newLocalId()).not.toBe(newLocalId());
    expect(chatStoragePath('client-1', 'abc', 'jpg')).toBe('client-1/abc.jpg');
  });

  it('records m4a on phones and webm in the browser', () => {
    expect(voiceNoteFormat(false)).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(voiceNoteFormat(true)).toEqual({ ext: 'webm', contentType: 'audio/webm' });
  });
});

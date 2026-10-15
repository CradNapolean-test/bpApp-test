import { describe, expect, it } from 'vitest';
import {
  CHAT_PAGE,
  applyIncoming,
  firstSavedAt,
  lastSavedAt,
  linkIsFresh,
  mayHaveEarlier,
  mergeMessages,
  pageOfNewestFirst,
  type LocalChatMessage,
} from './chatMessages';

const msg = (n: number, over: Partial<LocalChatMessage> = {}): LocalChatMessage => ({
  id: `m${String(n).padStart(5, '0')}`,
  client_id: 'c1',
  sender_id: 'coach',
  text: `message ${n}`,
  audio_path: null,
  audio_duration_seconds: null,
  image_path: null,
  created_at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
  signedAudioUrl: null,
  signedImageUrl: null,
  ...over,
});

describe('paging a long thread (H5)', () => {
  // The database returns the newest rows first when asked for them that way; a thread of 1,500 messages must open on the last 50.
  const thread = Array.from({ length: 1500 }, (_, i) => msg(i + 1));
  const newestFirst = [...thread].reverse();

  it('opens on the newest page, oldest first within it', () => {
    const { rows, hasMore } = pageOfNewestFirst(newestFirst.slice(0, CHAT_PAGE + 1), CHAT_PAGE);
    expect(rows).toHaveLength(CHAT_PAGE);
    expect(rows[0].text).toBe('message 1451');
    expect(rows.at(-1)?.text).toBe('message 1500');
    expect(hasMore).toBe(true);
  });

  it('pages older messages in until the start, without losing or repeating any', () => {
    let shown: LocalChatMessage[] = [];
    let cursor = 0;
    let more = true;
    let pages = 0;
    while (more) {
      const slice = newestFirst.slice(cursor, cursor + CHAT_PAGE + 1);
      const page = pageOfNewestFirst(slice, CHAT_PAGE);
      shown = mergeMessages(shown, page.rows);
      cursor += CHAT_PAGE;
      more = page.hasMore;
      pages++;
    }
    expect(pages).toBe(30);
    expect(shown).toHaveLength(1500);
    expect(shown[0].text).toBe('message 1');
    expect(shown.at(-1)?.text).toBe('message 1500');
    expect(new Set(shown.map((m) => m.id)).size).toBe(1500);
  });

  it('says there is nothing older when the page is not full', () => {
    expect(pageOfNewestFirst(newestFirst.slice(0, 10), CHAT_PAGE).hasMore).toBe(false);
    expect(pageOfNewestFirst(newestFirst.slice(0, CHAT_PAGE), CHAT_PAGE).hasMore).toBe(false);
  });

  it('offers "Load earlier" only for a full first page', () => {
    expect(mayHaveEarlier(CHAT_PAGE)).toBe(true);
    expect(mayHaveEarlier(CHAT_PAGE - 1)).toBe(false);
  });

  it('finds where to load earlier from, and where a catch-up starts', () => {
    const shown = [msg(5), msg(6), msg(7), msg(8, { pending: 'sending', id: 'pending-1' })];
    expect(firstSavedAt(shown)).toBe(msg(5).created_at);
    expect(lastSavedAt(shown)).toBe(msg(7).created_at);
    expect(lastSavedAt([])).toBeNull();
    expect(firstSavedAt([msg(1, { pending: 'failed', id: 'pending-2' })])).toBeNull();
  });
});

describe('merging what arrives (M5)', () => {
  it('keeps one entry per message and puts them in time order', () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3)]);
    expect(merged.map((m) => m.text)).toEqual(['message 1', 'message 2', 'message 3']);
  });

  it('keeps a signed link the earlier copy already had', () => {
    const merged = mergeMessages([msg(1, { image_path: 'a.jpg', signedImageUrl: 'https://signed' })], [msg(1, { image_path: 'a.jpg' })]);
    expect(merged[0].signedImageUrl).toBe('https://signed');
  });

  it('keeps unsent messages after everything saved, in the order they were sent', () => {
    const merged = mergeMessages(
      [msg(1), msg(10, { id: 'pending-a', pending: 'sending' }), msg(11, { id: 'pending-b', pending: 'failed' })],
      [msg(5), msg(6)]
    );
    expect(merged.map((m) => m.id)).toEqual([msg(1).id, msg(5).id, msg(6).id, 'pending-a', 'pending-b']);
  });

  it('the live copy of a message just sent replaces the "sending" one instead of showing twice', () => {
    const sending = msg(9, { id: 'pending-x', sender_id: 'me', text: 'hello', pending: 'sending' });
    const arrived = msg(9, { id: 'real-1', sender_id: 'me', text: 'hello' });
    const next = applyIncoming([msg(1), sending], arrived);
    expect(next.map((m) => m.id)).toEqual([msg(1).id, 'real-1']);
  });

  it('a live message from the other person never replaces a pending one', () => {
    const sending = msg(9, { id: 'pending-x', sender_id: 'me', text: 'hello', pending: 'sending' });
    const next = applyIncoming([sending], msg(10, { sender_id: 'coach', text: 'hello' }));
    expect(next).toHaveLength(2);
    expect(next.at(-1)?.id).toBe('pending-x');
  });

  it('ignores a live message that is already shown', () => {
    const next = applyIncoming([msg(1), msg(2)], msg(2));
    expect(next).toHaveLength(2);
  });
});

describe('signed links', () => {
  it('are used for eight minutes and made again after that', () => {
    const t0 = 1_000_000;
    expect(linkIsFresh(t0, t0 + 7 * 60_000)).toBe(true);
    expect(linkIsFresh(t0, t0 + 9 * 60_000)).toBe(false);
    expect(linkIsFresh(null, t0)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { mergeOverview, pickChannelClients, sortOverview } from './inboxOverview';

const row = (client_id: string, last_message_at: string | null, unread_count = 0, extra: Record<string, unknown> = {}) => ({
  client_id,
  last_message_at,
  unread_count,
  ...extra,
});

describe('sortOverview', () => {
  it('puts the newest message first and conversations with no message last', () => {
    const sorted = sortOverview([row('empty', null), row('old', '2026-10-01T10:00:00Z'), row('new', '2026-10-14T10:00:00Z')]);
    expect(sorted.map((r) => r.client_id)).toEqual(['new', 'old', 'empty']);
  });
  it('does not change the list it is given', () => {
    const input = [row('a', '2026-10-01T10:00:00Z'), row('b', '2026-10-02T10:00:00Z')];
    sortOverview(input);
    expect(input.map((r) => r.client_id)).toEqual(['a', 'b']);
  });
});

describe('mergeOverview (R29)', () => {
  it("adds a member's first ever message, which has no live connection yet", () => {
    const onScreen = [row('a', '2026-10-14T10:00:00Z', 1)];
    const fresh = [row('a', '2026-10-14T10:00:00Z', 1), row('newbie', '2026-10-14T11:00:00Z', 1)];
    expect(mergeOverview(onScreen, fresh, null).map((r) => r.client_id)).toEqual(['newbie', 'a']);
  });

  it('keeps a live message the fetch had not seen yet', () => {
    const onScreen = [row('a', '2026-10-14T12:00:00Z', 2, { last_message: 'live' })];
    const fresh = [row('a', '2026-10-14T10:00:00Z', 1, { last_message: 'older' })];
    const [merged] = mergeOverview(onScreen, fresh, null);
    expect(merged).toMatchObject({ last_message: 'live', unread_count: 2 });
  });

  it('takes the server row when it is newer', () => {
    const onScreen = [row('a', '2026-10-14T10:00:00Z', 0, { last_message: 'old' })];
    const fresh = [row('a', '2026-10-14T12:00:00Z', 3, { last_message: 'newer' })];
    expect(mergeOverview(onScreen, fresh, null)[0]).toMatchObject({ last_message: 'newer', unread_count: 3 });
  });

  it('never makes the open conversation unread', () => {
    const onScreen = [row('a', '2026-10-14T10:00:00Z', 0)];
    const fresh = [row('a', '2026-10-14T12:00:00Z', 4)];
    expect(mergeOverview(onScreen, fresh, 'a')[0].unread_count).toBe(0);
    expect(mergeOverview([], fresh, 'a')[0].unread_count).toBe(0);
  });

  it('keeps a conversation read that was just marked read here while the save is still in flight', () => {
    const onScreen = [row('a', '2026-10-14T10:00:00Z', 0)];
    const fresh = [row('a', '2026-10-14T10:00:00Z', 2)];
    expect(mergeOverview(onScreen, fresh, null)[0].unread_count).toBe(0);
  });

  it('keeps the unread count the server reports for an unopened conversation', () => {
    const onScreen = [row('a', '2026-10-14T10:00:00Z', 1)];
    const fresh = [row('a', '2026-10-14T10:00:00Z', 1)];
    expect(mergeOverview(onScreen, fresh, null)[0].unread_count).toBe(1);
  });

  it('drops a conversation the server no longer lists', () => {
    expect(mergeOverview([row('gone', '2026-10-14T10:00:00Z')], [], null)).toEqual([]);
  });
});

describe('pickChannelClients (R29)', () => {
  const many = Array.from({ length: 120 }, (_, i) => row(`c${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()));

  it('subscribes to the 40 most recent conversations at most', () => {
    const picked = pickChannelClients(many, null, 40);
    expect(picked).toHaveLength(40);
    expect(picked).toContain('c119');
    expect(picked).not.toContain('c000');
  });

  it('adds the open conversation even when it is old', () => {
    const picked = pickChannelClients(many, 'c000', 40);
    expect(picked).toHaveLength(41);
    expect(picked).toContain('c000');
  });

  it('ignores conversations with no message', () => {
    expect(pickChannelClients([row('a', null), row('b', '2026-10-14T10:00:00Z')], null)).toEqual(['b']);
  });

  it('gives the same list however the rows are ordered, so a reorder does not reconnect', () => {
    const rows = [row('a', '2026-10-01T10:00:00Z'), row('b', '2026-10-02T10:00:00Z'), row('c', '2026-10-03T10:00:00Z')];
    expect(pickChannelClients(rows, null)).toEqual(pickChannelClients([...rows].reverse(), null));
  });
});

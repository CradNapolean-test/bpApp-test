import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkinRowHint, isQueuedCheckin, nextQueuedCheckin, saveCheckinQueue, type QueuedCheckin } from './checkinQueue';

const item = (clientId: string, weekStart: string, name = clientId): QueuedCheckin => ({
  clientId,
  weekStart,
  name,
  hint: '',
  href: `/coach/clients/${clientId}?open=checkin&week=${weekStart}`,
});

describe('check-in row hint (UX4)', () => {
  it('says when a week of check-ins had no food', () => {
    expect(checkinRowHint({ weekStart: '2026-10-26', days: 7, foodDays: 0 })).toBe('Week of 26 Oct · 7 days logged · no food');
  });
  it('says on how many days there was food when it was some of them', () => {
    expect(checkinRowHint({ weekStart: '2026-10-26', days: 5, foodDays: 2 })).toBe('Week of 26 Oct · 5 days logged · food on 2');
  });
  it('adds nothing when every day had food, and says "day" for one', () => {
    expect(checkinRowHint({ weekStart: '2026-10-19', days: 1, foodDays: 1 })).toBe('Week of 19 Oct · 1 day logged');
  });
});

describe('check-in queue (UX6)', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives the next week on the list, in the order it was saved', () => {
    saveCheckinQueue([item('a', '2026-10-26'), item('b', '2026-10-26'), item('a', '2026-10-19')]);
    expect(nextQueuedCheckin('a', '2026-10-26')?.clientId).toBe('b');
    expect(nextQueuedCheckin('b', '2026-10-26')).toMatchObject({ clientId: 'a', weekStart: '2026-10-19' });
  });

  it('gives nothing after the last one, but knows it was on the list', () => {
    saveCheckinQueue([item('a', '2026-10-26'), item('b', '2026-10-26')]);
    expect(nextQueuedCheckin('b', '2026-10-26')).toBeNull();
    expect(isQueuedCheckin('b', '2026-10-26')).toBe(true);
  });

  it('gives nothing for a week that was not opened from the list', () => {
    saveCheckinQueue([item('a', '2026-10-26')]);
    expect(nextQueuedCheckin('c', '2026-10-26')).toBeNull();
    expect(isQueuedCheckin('c', '2026-10-26')).toBe(false);
  });

  it('copes with no storage or a damaged entry', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => saveCheckinQueue([item('a', '2026-10-26')])).not.toThrow();
    expect(nextQueuedCheckin('a', '2026-10-26')).toBeNull();
    expect(isQueuedCheckin('a', '2026-10-26')).toBe(false);

    vi.stubGlobal('sessionStorage', { getItem: () => '{not json', setItem: () => {} });
    expect(nextQueuedCheckin('a', '2026-10-26')).toBeNull();
  });
});

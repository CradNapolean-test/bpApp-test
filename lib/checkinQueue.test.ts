import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXT_CHECKIN_LOOKUPS, checkinRowHint, isQueuedCheckin, nextQueuedCheckin, nextUnreviewedCheckin, saveCheckinQueue, type QueuedCheckin } from './checkinQueue';

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

  describe('skipping weeks reviewed since the list was saved', () => {
    const reviewedBy = (weeks: Record<string, string[]>) => vi.fn(async (clientId: string) => weeks[clientId] ?? []);

    it('skips a week already reviewed and offers the next one that is not', async () => {
      saveCheckinQueue([item('a', '2026-10-26'), item('b', '2026-10-26'), item('c', '2026-10-26'), item('a', '2026-10-19')]);
      const lookup = reviewedBy({ b: ['2026-10-26'] });
      expect(await nextUnreviewedCheckin('a', '2026-10-26', lookup)).toMatchObject({ clientId: 'c' });
    });

    it("skips the same member's other week once that is reviewed too, looking each member up once", async () => {
      saveCheckinQueue([item('a', '2026-10-26'), item('b', '2026-10-26'), item('a', '2026-10-19'), item('b', '2026-10-19')]);
      const lookup = reviewedBy({ b: ['2026-10-26', '2026-10-19'], a: ['2026-10-26', '2026-10-19'] });
      expect(await nextUnreviewedCheckin('a', '2026-10-26', lookup)).toBeNull();
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('offers the next one as before when the lookup fails', async () => {
      saveCheckinQueue([item('a', '2026-10-26'), item('b', '2026-10-26')]);
      const failing = vi.fn(async () => {
        throw new Error('offline');
      });
      expect(await nextUnreviewedCheckin('a', '2026-10-26', failing)).toMatchObject({ clientId: 'b' });
    });

    it('stops looking after a few members and offers the next one unchecked', async () => {
      const many = Array.from({ length: NEXT_CHECKIN_LOOKUPS + 2 }, (_, i) => item(`m${i}`, '2026-10-26'));
      saveCheckinQueue([item('a', '2026-10-26'), ...many]);
      const allReviewed = vi.fn(async () => ['2026-10-26']);
      expect(await nextUnreviewedCheckin('a', '2026-10-26', allReviewed)).toMatchObject({ clientId: `m${NEXT_CHECKIN_LOOKUPS}` });
      expect(allReviewed).toHaveBeenCalledTimes(NEXT_CHECKIN_LOOKUPS);
    });

    it('gives nothing for a week not on the list', async () => {
      saveCheckinQueue([item('a', '2026-10-26')]);
      expect(await nextUnreviewedCheckin('z', '2026-10-26', reviewedBy({}))).toBeNull();
    });
  });
});

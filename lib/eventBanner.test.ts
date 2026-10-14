import { describe, expect, it } from 'vitest';
import { bannerEvent } from './eventBanner';
import type { EventWithSignup } from '@/lib/data/types';

const ev = (id: string, starts_at: string) => ({ id, starts_at, title: id }) as EventWithSignup;
const now = new Date('2026-10-14T09:00:00Z');

describe('bannerEvent', () => {
  it('picks the soonest upcoming event inside the window', () => {
    expect(bannerEvent([ev('b', '2026-10-20T09:00:00Z'), ev('a', '2026-10-16T09:00:00Z')], now)?.id).toBe('a');
  });
  it('skips events that already started or are too far away', () => {
    expect(bannerEvent([ev('past', '2026-10-14T08:00:00Z'), ev('far', '2026-12-01T09:00:00Z')], now)).toBeNull();
  });
});

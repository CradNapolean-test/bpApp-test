import { describe, expect, it } from 'vitest';
import { volumeHeadline } from './strengthVolume';

const wk = (weekStart: string, volume: number, sets = volume > 0 ? 3 : 0) => ({ weekStart, volume, sets });

describe('volumeHeadline (TR12: open on what has data)', () => {
  it('is this week when this week has volume, with last week beside it', () => {
    const h = volumeHeadline([wk('2026-11-09', 0), wk('2026-11-16', 2400), wk('2026-11-23', 3000)]);
    expect(h).toEqual({ week: wk('2026-11-23', 3000), isThisWeek: true, previous: wk('2026-11-16', 2400) });
  });

  it('is the newest week with volume when nothing is logged this week yet', () => {
    const h = volumeHeadline([wk('2026-11-09', 1800), wk('2026-11-16', 2400), wk('2026-11-23', 0)]);
    expect(h).toEqual({ week: wk('2026-11-16', 2400), isThisWeek: false, previous: wk('2026-11-09', 1800) });
  });

  it('has nothing to compare with when the week before had no volume', () => {
    expect(volumeHeadline([wk('2026-11-16', 0), wk('2026-11-23', 500)])?.previous).toBeNull();
    expect(volumeHeadline([wk('2026-11-23', 500)])?.previous).toBeNull();
  });

  it('is null when no week has any volume, so the card and its empty chart are left out', () => {
    expect(volumeHeadline([wk('2026-11-16', 0), wk('2026-11-23', 0, 4)])).toBeNull();
    expect(volumeHeadline([])).toBeNull();
  });
});

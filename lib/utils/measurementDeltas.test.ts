import { describe, expect, it } from 'vitest';
import { formatDelta, measurementDelta, siteReadings } from './measurementDeltas';
import type { MeasurementLogRow } from '@/lib/data/types';

const log = (log_date: string, over: Partial<MeasurementLogRow> = {}): MeasurementLogRow => ({
  id: log_date, client_id: 'c1', log_date, arm: null, chest: null, waist: null, hips: null, quad: null, created_at: `${log_date}T09:00:00Z`, ...over,
});

describe('siteReadings (PT1)', () => {
  // Newest first, as getMeasurementLogs returns them: the newest entry only has a waist.
  const logs = [
    log('2026-10-14', { waist: 80 }),
    log('2026-10-07', { waist: 82, arm: 33, chest: 96 }),
    log('2026-09-30', { waist: 84, arm: 32 }),
  ];

  it('"Now" is the latest value for that site, not whatever the newest entry holds', () => {
    expect(siteReadings(logs, 'arm')).toEqual({ now: 33, last: 32, start: 32 });
    expect(siteReadings(logs, 'chest')).toEqual({ now: 96, last: null, start: 96 });
  });

  it('works for a site logged every time', () => {
    expect(siteReadings(logs, 'waist')).toEqual({ now: 80, last: 82, start: 84 });
  });

  it('is all null for a site never measured', () => {
    expect(siteReadings(logs, 'quad')).toEqual({ now: null, last: null, start: null });
    expect(siteReadings([], 'waist')).toEqual({ now: null, last: null, start: null });
  });
});

describe('measurementDelta', () => {
  it('compares the latest reading for the site with the one before it', () => {
    const logs = [log('2026-10-14', { waist: 80 }), log('2026-10-07', { arm: 33 }), log('2026-09-30', { arm: 32, waist: 84 })];
    expect(measurementDelta(logs, null, 'arm')).toEqual({ vsStart: null, vsPrevious: 1 });
    expect(measurementDelta(logs, null, 'waist')).toEqual({ vsStart: null, vsPrevious: -4 });
  });
});

describe('formatDelta', () => {
  it('shows a sign, and ±0 for no change', () => {
    expect(formatDelta(1.25)).toBe('+1.3');
    expect(formatDelta(-4)).toBe('-4.0');
    expect(formatDelta(0.01)).toBe('±0');
    expect(formatDelta(null)).toBeNull();
  });
});

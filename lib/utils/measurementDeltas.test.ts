import { describe, expect, it } from 'vitest';
import { NOTHING_TO_COMPARE, anythingToCompare, formatDelta, measurementDelta, siteChangeText, siteReadings, siteSummary } from './measurementDeltas';
import type { MeasurementLogRow } from '../data/types';

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

describe('the Measurements card (MX14)', () => {
  it('one entry: the real figures, no change worked out, and nothing to compare yet instead of ±0', () => {
    const logs = [log('2026-11-01', { waist: 80, arm: 33 })];
    const waist = siteSummary(logs, 'waist');
    expect(waist).toEqual({ now: 80, last: null, start: 80, readings: 1, vsStart: null, vsLast: null });
    expect(siteChangeText(waist)).toBe('Measured once: nothing to compare yet');
    expect(anythingToCompare([waist, siteSummary(logs, 'arm'), siteSummary(logs, 'quad')])).toBe(false);
    expect(NOTHING_TO_COMPARE).not.toContain('±0');
  });

  it('two entries: Last is the real reading before now, and the change is said once', () => {
    const logs = [log('2026-11-08', { waist: 78 }), log('2026-11-01', { waist: 80 })];
    const waist = siteSummary(logs, 'waist');
    expect(waist).toMatchObject({ now: 78, last: 80, start: 80, readings: 2, vsStart: -2, vsLast: -2 });
    expect(siteChangeText(waist)).toBe('-2.0cm since your first measurement');
    expect(anythingToCompare([waist])).toBe(true);
  });

  it('three or more entries: the change since the first and since last time', () => {
    const logs = [log('2026-11-15', { waist: 77.5 }), log('2026-11-08', { waist: 78 }), log('2026-11-01', { waist: 80 })];
    const waist = siteSummary(logs, 'waist');
    expect(waist).toMatchObject({ now: 77.5, last: 78, start: 80, readings: 3, vsStart: -2.5, vsLast: -0.5 });
    expect(siteChangeText(waist)).toBe('-2.5cm since your first measurement · -0.5cm since last time');
  });

  it('a real change of nothing says so in words', () => {
    const logs = [log('2026-11-15', { arm: 33 }), log('2026-11-08', { arm: 34 }), log('2026-11-01', { arm: 33 })];
    expect(siteChangeText(siteSummary(logs, 'arm'))).toBe('No change since your first measurement · -1.0cm since last time');
  });

  it('each site counts its own readings: a site measured once beside one measured twice', () => {
    const logs = [log('2026-11-08', { waist: 78 }), log('2026-11-01', { waist: 80, arm: 33 })];
    const arm = siteSummary(logs, 'arm');
    expect(arm).toMatchObject({ now: 33, last: null, readings: 1, vsStart: null });
    expect(siteChangeText(arm)).toBe('Measured once: nothing to compare yet');
    expect(anythingToCompare([arm, siteSummary(logs, 'waist')])).toBe(true);
  });

  it('a site never measured has no line', () => {
    const quad = siteSummary([log('2026-11-01', { waist: 80 })], 'quad');
    expect(quad).toEqual({ now: null, last: null, start: null, readings: 0, vsStart: null, vsLast: null });
    expect(siteChangeText(quad)).toBeNull();
  });
});

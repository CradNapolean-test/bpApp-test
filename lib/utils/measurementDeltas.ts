import type { ClientProfileRow, MeasurementLogRow } from '../data/types';

// Kept the same in two places: lib/utils/measurementDeltas.ts (web) and packages/shared/src/utils/measurementDeltas.ts (phone).
// lib/utils/measurementDeltasTwin.test.ts checks.

type MeasurementField = 'arm' | 'chest' | 'waist' | 'hips' | 'quad';

const START_KEY: Record<MeasurementField, keyof ClientProfileRow> = {
  arm: 'meas_arm_start',
  chest: 'meas_chest_start',
  waist: 'meas_waist_start',
  hips: 'meas_hips_start',
  quad: 'meas_quad_start',
};

export interface MeasurementDelta {
  vsStart: number | null;
  vsPrevious: number | null;
}

// A body site's readings from the log, newest first (getMeasurementLogs already returns them that way). "Now" is the latest value
// logged FOR THAT SITE, not whatever the newest entry happens to hold: logging only a waist left every other site showing a dash in the
// Now column even though they had been measured last week (PT1). "Last" is the value before that, "Start" the first ever.
export interface SiteReadings {
  now: number | null;
  last: number | null;
  start: number | null;
}

export function siteReadings(logs: MeasurementLogRow[], field: MeasurementField): SiteReadings {
  const values = logs.map((l) => l[field]).filter((v): v is number => v != null);
  return { now: values[0] ?? null, last: values[1] ?? null, start: values.length > 0 ? values[values.length - 1] : null };
}

// vsStart compares the latest reading to client_profiles' meas_<field>_start; vsPrevious compares it to the reading before it.
export function measurementDelta(
  logs: MeasurementLogRow[],
  profile: ClientProfileRow | null,
  field: MeasurementField
): MeasurementDelta {
  const { now, last } = siteReadings(logs, field);
  if (now == null) return { vsStart: null, vsPrevious: null };

  const startValue = profile?.[START_KEY[field]] as number | null | undefined;
  const vsStart = startValue != null ? now - startValue : null;
  const vsPrevious = last != null ? now - last : null;

  return { vsStart, vsPrevious };
}

export function formatDelta(delta: number | null): string | null {
  if (delta == null) return null;
  if (Math.abs(delta) < 0.05) return '±0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
}

// ---- the Measurements card (MX14) ----
// With one entry the card showed an empty Last column and "±0cm since your first measurement" on every row. A change is only worked
// out once a site has two readings; until then there is nothing to compare.

export interface SiteSummary extends SiteReadings {
  // How many entries have a figure for this site.
  readings: number;
  // The latest reading against the first ever, and against the one before it. Null with fewer than two readings.
  vsStart: number | null;
  vsLast: number | null;
}

export function siteSummary(logs: MeasurementLogRow[], field: MeasurementField): SiteSummary {
  const r = siteReadings(logs, field);
  const readings = logs.filter((l) => l[field] != null).length;
  const now = readings >= 2 ? r.now : null;
  return {
    ...r,
    readings,
    vsStart: now != null && r.start != null ? now - r.start : null,
    vsLast: now != null && r.last != null ? now - r.last : null,
  };
}

// Whether any site has two readings, so the card has a change to show at all.
export function anythingToCompare(sites: SiteSummary[]): boolean {
  return sites.some((s) => s.readings >= 2);
}

export const NOTHING_TO_COMPARE = 'Nothing to compare yet: your next measurement shows the change.';

// The line under a site's figures: "-4.0cm since your first measurement · -2.0cm since last time", "No change since your first
// measurement", or for a site measured only once, that there is nothing to compare yet. With exactly two readings the one before now IS
// the first, so the change is said once.
export function siteChangeText(s: SiteSummary): string | null {
  if (s.readings === 0) return null;
  if (s.readings === 1) return 'Measured once: nothing to compare yet';
  const first = changeWords(s.vsStart, 'since your first measurement');
  const sinceLast = s.readings >= 3 ? changeWords(s.vsLast, 'since last time') : null;
  return [first, sinceLast].filter((t): t is string => t != null).join(' · ') || null;
}

function changeWords(delta: number | null, since: string): string | null {
  const d = formatDelta(delta);
  if (d == null) return null;
  return d === '±0' ? `No change ${since}` : `${d}cm ${since}`;
}

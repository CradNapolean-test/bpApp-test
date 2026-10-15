import type { ClientProfileRow, MeasurementLogRow } from '@/lib/data/types';

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

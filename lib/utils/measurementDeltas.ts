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

// `logs` must be ordered newest-first (getMeasurementLogs already returns them that way).
// vsStart compares the latest entry to client_profiles' meas_<field>_start; vsPrevious
// compares it to the immediately-preceding logged entry.
export function measurementDelta(
  logs: MeasurementLogRow[],
  profile: ClientProfileRow | null,
  field: MeasurementField
): MeasurementDelta {
  const latest = logs[0]?.[field] ?? null;
  if (latest == null) return { vsStart: null, vsPrevious: null };

  const startValue = profile?.[START_KEY[field]] as number | null | undefined;
  const vsStart = startValue != null ? latest - startValue : null;

  const previous = logs[1]?.[field] ?? null;
  const vsPrevious = previous != null ? latest - previous : null;

  return { vsStart, vsPrevious };
}

export function formatDelta(delta: number | null): string | null {
  if (delta == null) return null;
  if (Math.abs(delta) < 0.05) return '±0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
}

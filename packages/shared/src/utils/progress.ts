import type { BodyScanRow, ClientProfileRow, MeasurementLogRow, ProgressPhotoRow } from '../data/types';
import { formatDelta, siteReadings } from './measurementDeltas';

// ---- dates (plain calendar dates, no timezone: the app already resolved "today" in the member's timezone) ----

export function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// A real calendar date written YYYY-MM-DD (rejects 2026-02-31, which a plain pattern would let through).
export function isRealIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ---- measurements ----

export type MeasurementKey = 'arm' | 'chest' | 'waist' | 'hips' | 'quad';
export const MEASUREMENT_FIELDS: { key: MeasurementKey; label: string }[] = [
  { key: 'arm', label: 'Arm' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'quad', label: 'Quad' },
];
export const MEASUREMENT_MIN_CM = 10;
export const MEASUREMENT_MAX_CM = 300;

export interface MeasurementRow {
  key: MeasurementKey;
  label: string;
  start: number | null; // the first measurement ever logged for this body part
  last: number | null; // the one before the newest log
  latest: number | null;
  vsStart: number | null;
  vsPrevious: number | null;
  readings: number; // how many logs have a figure for this body part
  towardsGoal: boolean | null; // waist and hips going down is the usual aim; for the rest, up is
}

// `logs` newest first (the order the app fetches them in). Same arithmetic as the web Progress tab.
export function measurementRows(logs: MeasurementLogRow[]): MeasurementRow[] {
  return MEASUREMENT_FIELDS.map(({ key, label }) => {
    // "Now" is the latest value logged FOR THAT SITE, not whatever the newest entry happens to hold: logging only a waist used to leave every
    // other site showing a dash in the Now column even though it was measured last week (PT1).
    const { now: latest, last, start } = siteReadings(logs, key);
    const vsStart = latest != null && start != null ? latest - start : null;
    const vsPrevious = latest != null && last != null ? latest - last : null;
    const towardsGoal = vsStart != null && Math.abs(vsStart) >= 0.05 ? (key === 'waist' || key === 'hips' ? vsStart < 0 : vsStart > 0) : null;
    return { key, label, start, last, latest, vsStart, vsPrevious, readings: logs.filter((m) => m[key] != null).length, towardsGoal };
  });
}

// "+1.5cm since your first measurement · -0.5cm since last time", or null when there is nothing to compare yet.
export function measurementChangeText(row: MeasurementRow): string | null {
  if (row.readings < 2) return null;
  const first = formatDelta(row.vsStart);
  if (!first) return null;
  const previous = formatDelta(row.vsPrevious);
  return `${first}cm since your first measurement${previous ? ` · ${previous}cm since last time` : ''}`;
}

export type ParsedMeasurements = { ok: true; fields: Partial<Record<MeasurementKey, number>> } | { ok: false; error: string };

export function parseMeasurements(raw: Partial<Record<MeasurementKey, string>>): ParsedMeasurements {
  const fields: Partial<Record<MeasurementKey, number>> = {};
  for (const { key, label } of MEASUREMENT_FIELDS) {
    const text = (raw[key] ?? '').trim().replace(',', '.');
    if (text === '') continue;
    const n = Number(text);
    if (!Number.isFinite(n)) return { ok: false, error: `Please check the ${label.toLowerCase()} figure.` };
    if (n < MEASUREMENT_MIN_CM || n > MEASUREMENT_MAX_CM) {
      return { ok: false, error: `${label} should be between ${MEASUREMENT_MIN_CM} and ${MEASUREMENT_MAX_CM} cm.` };
    }
    fields[key] = Math.round(n * 10) / 10;
  }
  if (Object.keys(fields).length === 0) return { ok: false, error: 'Enter at least one measurement.' };
  return { ok: true, fields };
}

// The first time a body part is measured it becomes the member's Start figure on the profile; one that is already set
// (by them, or by a coach) is never overwritten.
export function startsToSet(profile: Partial<ClientProfileRow> | null, fields: Partial<Record<MeasurementKey, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!profile) return out;
  for (const [key, value] of Object.entries(fields)) {
    const column = `meas_${key}_start`;
    if (typeof value === 'number' && column in profile && (profile as Record<string, unknown>)[column] == null) out[column] = value;
  }
  return out;
}

// ---- body scans ----

export type ScanKey = 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct' | 'body_fat_kg' | 'visceral_fat_level' | 'bmr_kcal' | 'inbody_score';

export const SCAN_CHART_METRICS: { key: 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct'; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'skeletal_muscle_kg', label: 'Muscle', unit: 'kg' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
];

// good: which direction is an improvement (null = neutral, e.g. bodyweight on its own).
export const SCAN_STATS: { key: ScanKey; label: string; unit: string; good: 'up' | 'down' | null; digits: number }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', good: null, digits: 1 },
  { key: 'skeletal_muscle_kg', label: 'Skeletal muscle', unit: 'kg', good: 'up', digits: 1 },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', good: 'down', digits: 1 },
  { key: 'body_fat_kg', label: 'Body fat mass', unit: 'kg', good: 'down', digits: 1 },
  { key: 'visceral_fat_level', label: 'Visceral fat', unit: 'level', good: 'down', digits: 0 },
  { key: 'bmr_kcal', label: 'BMR', unit: 'kcal', good: null, digits: 0 },
  { key: 'inbody_score', label: 'InBody score', unit: '', good: 'up', digits: 0 },
];

export interface BodyScanInput {
  scanDate: string;
  weightKg: number | null;
  skeletalMuscleKg: number | null;
  bodyFatPct: number | null;
  bodyFatKg: number | null;
  visceralFatLevel: number | null;
  bmrKcal: number | null;
  inbodyScore: number | null;
  notes: string;
}

const SCAN_RANGES: [keyof BodyScanInput, string, number, number][] = [
  ['weightKg', 'weight', 20, 400],
  ['skeletalMuscleKg', 'skeletal muscle mass', 5, 100],
  ['bodyFatPct', 'body fat %', 2, 70],
  ['bodyFatKg', 'body fat mass', 1, 250],
  ['visceralFatLevel', 'visceral fat level', 1, 30],
  ['bmrKcal', 'BMR', 500, 5000],
  ['inbodyScore', 'InBody score', 20, 100],
];

// "" means not entered (null); anything that is not a number comes back as NaN so validation can name the field.
export function parseScanNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  return t === '' ? null : Number(t);
}

// The web's rules (same ranges and wording), plus two the browser's date picker made unnecessary: the date must be a
// real one and cannot be in the future. Returns the message to show, or null when the scan can be saved.
export function validateBodyScan(input: BodyScanInput, hasPrintout: boolean, todayIso: string): string | null {
  if (!isRealIsoDate(input.scanDate)) return 'Please enter the scan date as YYYY-MM-DD';
  if (input.scanDate > todayIso) return 'The scan date cannot be in the future';
  for (const [key, label, min, max] of SCAN_RANGES) {
    const v = input[key] as number | null;
    if (v != null && !(v >= min && v <= max)) return `Please check the ${label}`;
  }
  const hasAnyResult = SCAN_RANGES.some(([key]) => input[key] != null);
  if (!hasAnyResult && !hasPrintout) return 'Add at least one result, or add a photo of the printout';
  return null;
}

export interface ScanStat {
  key: ScanKey;
  label: string;
  unit: string;
  value: string;
  delta: string | null; // "+0.5" / "-1.2" since the last scan, when it is big enough to show
  favourable: boolean | null;
}

export function scanStatRows(latest: BodyScanRow | null, previous: BodyScanRow | null): ScanStat[] {
  if (!latest) return [];
  return SCAN_STATS.filter((s) => latest[s.key] != null).map((s) => {
    const value = Number(latest[s.key]);
    const prev = previous?.[s.key] != null ? Number(previous[s.key]) : null;
    const delta = prev != null ? value - prev : null;
    const shown = delta != null && Math.abs(delta) >= Math.pow(10, -s.digits) / 2;
    const favourable = s.good == null || delta == null ? null : s.good === 'up' ? delta > 0 : delta < 0;
    return {
      key: s.key,
      label: s.label,
      unit: s.unit,
      value: value.toFixed(s.digits),
      delta: shown ? `${delta! > 0 ? '+' : ''}${delta!.toFixed(s.digits)}` : null,
      favourable: shown ? favourable : null,
    };
  });
}

// One line for the history list: "82.4kg · 34.1kg muscle · 24.5% fat", or "Printout only".
export function scanSummary(s: BodyScanRow): string {
  return (
    [s.weight_kg != null && `${s.weight_kg}kg`, s.skeletal_muscle_kg != null && `${s.skeletal_muscle_kg}kg muscle`, s.body_fat_pct != null && `${s.body_fat_pct}% fat`]
      .filter(Boolean)
      .join(' · ') || 'Printout only'
  );
}

// `scans` newest first. Oldest first for the chart, skipping scans that do not carry that figure.
export function scanSeries(scans: BodyScanRow[], key: 'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct') {
  const rows = [...scans].reverse().filter((s) => s[key] != null);
  return { values: rows.map((s) => Number(s[key])), labels: rows.map((s) => shortDate(s.scan_date)) };
}

export const BODY_FAT_REVIEW_NOTE = 'Body fat updated from an InBody scan: check their targets';

// If the new scan is the newest one with a measured body fat, a measured figure replaces a missing or estimated body fat
// on the profile (so the calorie targets use the real number) and the coach is flagged to check them.
export function bodyFatProfilePatch(
  profile: Pick<ClientProfileRow, 'body_fat_pct' | 'body_fat_estimated' | 'review_reasons'> | null,
  bodyFatPct: number | null,
  hasNewerScanWithBodyFat: boolean,
): Record<string, unknown> | null {
  if (bodyFatPct == null || hasNewerScanWithBodyFat || !profile) return null;
  if (!(profile.body_fat_pct == null || profile.body_fat_estimated === true)) return null;
  const reasons: string[] = profile.review_reasons ?? [];
  return {
    body_fat_pct: bodyFatPct,
    body_fat_estimated: false,
    needs_coach_review: true,
    review_reasons: reasons.includes(BODY_FAT_REVIEW_NOTE) ? reasons : [...reasons, BODY_FAT_REVIEW_NOTE],
  };
}

export function isPdfPath(path: string | null | undefined): boolean {
  return !!path && path.toLowerCase().endsWith('.pdf');
}

// ---- progress photos ----

// {client}/{date}-{id}.{ext}: the member's own folder (what the storage policies check), as the web names them.
export function progressPhotoPath(clientId: string, date: string, id: string, ext = 'jpg'): string {
  return `${clientId}/${date}-${id}.${ext}`;
}

export interface PhotoCompare {
  before: ProgressPhotoRow;
  after: ProgressPhotoRow;
  days: number;
  caption: string;
}

// `photos` newest first. Defaults to the oldest photo against the newest; either can be chosen by id.
export function comparePhotos(photos: ProgressPhotoRow[], beforeId?: string | null, afterId?: string | null): PhotoCompare | null {
  if (photos.length < 2) return null;
  const before = photos.find((p) => p.id === beforeId) ?? photos[photos.length - 1];
  const after = photos.find((p) => p.id === afterId) ?? photos[0];
  const days = Math.round((Date.parse(after.photo_date) - Date.parse(before.photo_date)) / 86400000);
  const caption = days === 0 ? 'Same day' : days > 0 ? `${days} days between photos` : 'Before photo is later than the after photo';
  return { before, after, days, caption };
}

import { describe, expect, it } from 'vitest';

import type { BodyScanRow, MeasurementLogRow, ProgressPhotoRow } from '../data/types';
import {
  BODY_FAT_REVIEW_NOTE,
  bodyFatProfilePatch,
  comparePhotos,
  isPdfPath,
  isRealIsoDate,
  longDate,
  measurementChangeText,
  measurementRows,
  parseMeasurements,
  parseScanNumber,
  progressPhotoPath,
  scanSeries,
  scanStatRows,
  scanSummary,
  shortDate,
  startsToSet,
  validateBodyScan,
  type BodyScanInput,
} from './progress';

const log = (date: string, v: Partial<MeasurementLogRow> = {}): MeasurementLogRow => ({
  id: date, client_id: 'c', log_date: date, arm: null, chest: null, waist: null, hips: null, quad: null, created_at: date, ...v,
});
const scan = (date: string, v: Partial<BodyScanRow> = {}): BodyScanRow => ({
  id: date, client_id: 'c', scan_date: date, weight_kg: null, skeletal_muscle_kg: null, body_fat_pct: null, body_fat_kg: null,
  visceral_fat_level: null, bmr_kcal: null, inbody_score: null, notes: null, printout_path: null, created_at: date, ...v,
});
const photo = (id: string, date: string): ProgressPhotoRow => ({ id, client_id: 'c', photo_date: date, storage_path: `c/${id}.jpg`, created_at: date });

describe('dates', () => {
  it('formats plain calendar dates without shifting them', () => {
    expect(longDate('2026-10-08')).toBe('8 Oct 2026');
    expect(shortDate('2026-01-01')).toBe('1 Jan');
  });

  it('accepts only real calendar dates', () => {
    expect(isRealIsoDate('2026-10-12')).toBe(true);
    expect(isRealIsoDate('2024-02-29')).toBe(true);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
    expect(isRealIsoDate('2026-02-31')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('12/10/2026')).toBe(false);
    expect(isRealIsoDate('')).toBe(false);
  });
});

describe('measurementRows', () => {
  const logs = [
    log('2026-10-01', { waist: 80, arm: 33 }),
    log('2026-09-15', { waist: 82, arm: 32.5, hips: 100 }),
    log('2026-09-01', { waist: 85, arm: 32 }),
  ];
  const rows = Object.fromEntries(measurementRows(logs).map((r) => [r.key, r]));

  it('Start is the first measurement ever logged for that body part, Last the log before the newest, Now the newest', () => {
    expect(rows.waist).toMatchObject({ start: 85, last: 82, latest: 80, vsStart: -5, vsPrevious: -2, readings: 3 });
  });

  it('Now is the latest value logged for THAT body part, even when the newest log did not measure it (PT1)', () => {
    // hips were measured once, on 15 September; the newest log (1 October) only has waist and arm
    expect(rows.hips).toMatchObject({ start: 100, latest: 100, last: null, vsStart: 0, vsPrevious: null, readings: 1 });
    expect(rows.arm).toMatchObject({ latest: 33, last: 32.5, start: 32 });
  });

  it('a body part never measured has nothing at all', () => {
    expect(rows.chest).toMatchObject({ start: null, latest: null, readings: 0 });
  });

  it('waist and hips going down is towards the goal; for the rest, up is', () => {
    expect(rows.waist.towardsGoal).toBe(true);
    expect(rows.arm.towardsGoal).toBe(true);
    const worse = Object.fromEntries(measurementRows([log('2026-10-01', { waist: 90, arm: 30 }), log('2026-09-01', { waist: 85, arm: 32 })]).map((r) => [r.key, r]));
    expect(worse.waist.towardsGoal).toBe(false);
    expect(worse.arm.towardsGoal).toBe(false);
  });

  it('a change under 0.05 cm is neutral', () => {
    const r = measurementRows([log('2026-10-01', { waist: 80.02 }), log('2026-09-01', { waist: 80 })]).find((x) => x.key === 'waist')!;
    expect(r.towardsGoal).toBeNull();
  });

  it('writes the change in words only when there are two readings', () => {
    expect(measurementChangeText(rows.waist)).toBe('-5.0cm since your first measurement · -2.0cm since last time');
    expect(measurementChangeText(rows.hips)).toBeNull();
    expect(measurementChangeText(rows.chest)).toBeNull();
    const first = measurementRows([log('2026-10-01', { waist: 80 })]).find((x) => x.key === 'waist')!;
    expect(measurementChangeText(first)).toBeNull();
  });

  it('copes with no logs at all', () => {
    expect(measurementRows([]).every((r) => r.latest === null && r.start === null)).toBe(true);
  });
});

describe('parseMeasurements', () => {
  it('reads the filled boxes, accepts a decimal comma and rounds to 0.1', () => {
    expect(parseMeasurements({ waist: '80,55', arm: ' 33 ', chest: '' })).toEqual({ ok: true, fields: { waist: 80.6, arm: 33 } });
  });

  it('needs at least one figure', () => {
    expect(parseMeasurements({})).toEqual({ ok: false, error: 'Enter at least one measurement.' });
    expect(parseMeasurements({ arm: '   ' })).toEqual({ ok: false, error: 'Enter at least one measurement.' });
  });

  it('names the box when a figure is not a number or is out of range', () => {
    expect(parseMeasurements({ hips: 'abc' })).toEqual({ ok: false, error: 'Please check the hips figure.' });
    expect(parseMeasurements({ waist: '8' })).toEqual({ ok: false, error: 'Waist should be between 10 and 300 cm.' });
    expect(parseMeasurements({ quad: '900' })).toEqual({ ok: false, error: 'Quad should be between 10 and 300 cm.' });
  });
});

describe('startsToSet', () => {
  it('fills only the Start figures that are empty on the profile', () => {
    const profile = { meas_arm_start: 31, meas_waist_start: null, meas_hips_start: null } as never;
    expect(startsToSet(profile, { arm: 33, waist: 80 })).toEqual({ meas_waist_start: 80 });
  });

  it('does nothing without a profile', () => {
    expect(startsToSet(null, { arm: 33 })).toEqual({});
  });
});

describe('validateBodyScan', () => {
  const base: BodyScanInput = { scanDate: '2026-10-10', weightKg: 82.4, skeletalMuscleKg: null, bodyFatPct: 24.5, bodyFatKg: null, visceralFatLevel: null, bmrKcal: null, inbodyScore: null, notes: '' };
  const today = '2026-10-12';

  it('accepts a scan with results', () => {
    expect(validateBodyScan(base, false, today)).toBeNull();
  });

  it('needs a real date that is not in the future', () => {
    expect(validateBodyScan({ ...base, scanDate: '10/10/2026' }, false, today)).toBe('Please enter the scan date as YYYY-MM-DD');
    expect(validateBodyScan({ ...base, scanDate: '2026-02-31' }, false, today)).toBe('Please enter the scan date as YYYY-MM-DD');
    expect(validateBodyScan({ ...base, scanDate: '2062-10-10' }, false, today)).toBe('The scan date cannot be in the future');
    expect(validateBodyScan({ ...base, scanDate: today }, false, today)).toBeNull();
  });

  it('names the field that is out of range, with the web wording', () => {
    expect(validateBodyScan({ ...base, bodyFatPct: 90 }, false, today)).toBe('Please check the body fat %');
    expect(validateBodyScan({ ...base, weightKg: 10 }, false, today)).toBe('Please check the weight');
    expect(validateBodyScan({ ...base, bmrKcal: Number.NaN }, false, today)).toBe('Please check the BMR');
    expect(validateBodyScan({ ...base, visceralFatLevel: 31 }, false, today)).toBe('Please check the visceral fat level');
  });

  it('needs a result or a printout', () => {
    const empty = { ...base, weightKg: null, bodyFatPct: null };
    expect(validateBodyScan(empty, false, today)).toBe('Add at least one result, or add a photo of the printout');
    expect(validateBodyScan(empty, true, today)).toBeNull();
  });

  it('parses entered text, keeping garbage as NaN so the field can be named', () => {
    expect(parseScanNumber('')).toBeNull();
    expect(parseScanNumber('  ')).toBeNull();
    expect(parseScanNumber('24,5')).toBe(24.5);
    expect(Number.isNaN(parseScanNumber('abc'))).toBe(true);
  });
});

describe('scan stats', () => {
  const latest = scan('2026-10-10', { weight_kg: 82.4, skeletal_muscle_kg: 34.1, body_fat_pct: 24.5, visceral_fat_level: 8 });
  const previous = scan('2026-09-10', { weight_kg: 83, skeletal_muscle_kg: 33.8, body_fat_pct: 25.9, visceral_fat_level: 8 });
  const rows = Object.fromEntries(scanStatRows(latest, previous).map((r) => [r.key, r]));

  it('shows only figures the latest scan has', () => {
    expect(Object.keys(rows)).toEqual(['weight_kg', 'skeletal_muscle_kg', 'body_fat_pct', 'visceral_fat_level']);
  });

  it('shows the change since the last scan, coloured by whether it is an improvement', () => {
    expect(rows.skeletal_muscle_kg).toMatchObject({ value: '34.1', delta: '+0.3', favourable: true });
    expect(rows.body_fat_pct).toMatchObject({ delta: '-1.4', favourable: true });
    expect(rows.weight_kg).toMatchObject({ delta: '-0.6', favourable: null }); // weight on its own is neutral
  });

  it('hides a change too small to show at that precision', () => {
    expect(rows.visceral_fat_level).toMatchObject({ value: '8', delta: null, favourable: null });
  });

  it('a worse change is not favourable', () => {
    const worse = scanStatRows(scan('2026-10-10', { body_fat_pct: 27 }), scan('2026-09-10', { body_fat_pct: 25 }));
    expect(worse[0]).toMatchObject({ delta: '+2.0', favourable: false });
  });

  it('has nothing to show without a scan, and no change with only one', () => {
    expect(scanStatRows(null, null)).toEqual([]);
    expect(scanStatRows(latest, null).every((r) => r.delta === null)).toBe(true);
  });

  it('summarises a scan in one line, or says printout only', () => {
    expect(scanSummary(latest)).toBe('82.4kg · 34.1kg muscle · 24.5% fat');
    expect(scanSummary(scan('2026-10-10', { printout_path: 'c/x.jpg' }))).toBe('Printout only');
  });

  it('builds a chart oldest first and skips scans without that figure', () => {
    const series = scanSeries([latest, scan('2026-09-20', { weight_kg: 83.5 }), previous], 'skeletal_muscle_kg');
    expect(series.values).toEqual([33.8, 34.1]);
    expect(series.labels).toEqual([shortDate('2026-09-10'), shortDate('2026-10-10')]);
    expect(scanSeries([latest, scan('2026-09-20', { weight_kg: 83.5 }), previous], 'weight_kg').values).toEqual([83, 83.5, 82.4]);
  });
});

describe('bodyFatProfilePatch', () => {
  const estimated = { body_fat_pct: 28, body_fat_estimated: true, review_reasons: ['Other note'] };

  it('a measured figure replaces an estimated one and flags the coach', () => {
    expect(bodyFatProfilePatch(estimated, 24.5, false)).toEqual({
      body_fat_pct: 24.5,
      body_fat_estimated: false,
      needs_coach_review: true,
      review_reasons: ['Other note', BODY_FAT_REVIEW_NOTE],
    });
  });

  it('fills a missing body fat', () => {
    expect(bodyFatProfilePatch({ body_fat_pct: null, body_fat_estimated: false, review_reasons: undefined }, 24.5, false)).toMatchObject({ body_fat_pct: 24.5 });
  });

  it('does not add the same note twice', () => {
    const p = bodyFatProfilePatch({ ...estimated, review_reasons: [BODY_FAT_REVIEW_NOTE] }, 24.5, false)!;
    expect(p.review_reasons).toEqual([BODY_FAT_REVIEW_NOTE]);
  });

  it('leaves alone a body fat that was already measured, or a scan that is not the newest, or no figure', () => {
    expect(bodyFatProfilePatch({ body_fat_pct: 25, body_fat_estimated: false, review_reasons: [] }, 24.5, false)).toBeNull();
    expect(bodyFatProfilePatch(estimated, 24.5, true)).toBeNull();
    expect(bodyFatProfilePatch(estimated, null, false)).toBeNull();
    expect(bodyFatProfilePatch(null, 24.5, false)).toBeNull();
  });
});

describe('photos', () => {
  const photos = [photo('c', '2026-10-01'), photo('b', '2026-09-01'), photo('a', '2026-08-01')];

  it('names files in the member folder like the web does', () => {
    expect(progressPhotoPath('client-1', '2026-10-12', 'abc')).toBe('client-1/2026-10-12-abc.jpg');
  });

  it('compares the oldest photo with the newest by default', () => {
    const c = comparePhotos(photos)!;
    expect([c.before.id, c.after.id, c.days]).toEqual(['a', 'c', 61]);
    expect(c.caption).toBe('61 days between photos');
  });

  it('lets either side be chosen, and says so when the order is wrong or the day is the same', () => {
    expect(comparePhotos(photos, 'b', 'c')!.days).toBe(30);
    expect(comparePhotos(photos, 'c', 'a')!.caption).toBe('Before photo is later than the after photo');
    expect(comparePhotos(photos, 'b', 'b')!.caption).toBe('Same day');
  });

  it('needs two photos, and ignores an id that is no longer there', () => {
    expect(comparePhotos([photos[0]])).toBeNull();
    expect(comparePhotos([])).toBeNull();
    expect(comparePhotos(photos, 'gone', 'gone2')!.before.id).toBe('a');
  });

  it('spots a PDF printout by its name', () => {
    expect(isPdfPath('c/x.PDF')).toBe(true);
    expect(isPdfPath('c/x.jpg')).toBe(false);
    expect(isPdfPath(null)).toBe(false);
  });
});

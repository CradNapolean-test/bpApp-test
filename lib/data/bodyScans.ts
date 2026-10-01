'use server';

import { raise } from './errors';
import { fail, ok } from './result';
import type { ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { BodyScan, BodyScanRow } from './types';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

// Newest first. A scan with no row table yet (migration 0084 not applied) just reads as "none".
export async function getBodyScans(clientId: string): Promise<BodyScan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('body_scans')
    .select('*')
    .eq('client_id', clientId)
    .order('scan_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    raise(error);
  }
  return Promise.all(
    ((data ?? []) as BodyScanRow[]).map(async (row) => {
      if (!row.printout_path) return { ...row, signedPrintoutUrl: null };
      const { data: signed } = await supabase.storage
        .from('inbody-scans')
        .createSignedUrl(row.printout_path, SIGNED_URL_TTL_SECONDS);
      return { ...row, signedPrintoutUrl: signed?.signedUrl ?? null };
    })
  );
}

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

const RANGES: [keyof BodyScanInput, string, number, number][] = [
  ['weightKg', 'weight', 20, 400],
  ['skeletalMuscleKg', 'skeletal muscle mass', 5, 100],
  ['bodyFatPct', 'body fat %', 2, 70],
  ['bodyFatKg', 'body fat mass', 1, 250],
  ['visceralFatLevel', 'visceral fat level', 1, 30],
  ['bmrKcal', 'BMR', 500, 5000],
  ['inbodyScore', 'InBody score', 20, 100],
];

// Adds a scan (the member or their coach; RLS allows both). If it is the newest scan and carries a
// measured body fat %, it replaces an estimated (or missing) body fat on the profile so the calorie
// targets use the real number, and the coach is flagged to check them.
export async function addBodyScan(
  clientId: string,
  input: BodyScanInput,
  printoutPath: string | null
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scanDate)) return fail(null, 'Please pick the scan date');
  for (const [key, label, min, max] of RANGES) {
    const v = input[key] as number | null;
    if (v != null && !(v >= min && v <= max)) return fail(null, `Please check the ${label}`);
  }
  const hasAnyResult = RANGES.some(([key]) => input[key] != null);
  if (!hasAnyResult && !printoutPath) return fail(null, 'Add at least one result, or upload the printout');

  const supabase = await createClient();
  const { error } = await supabase.from('body_scans').insert({
    client_id: clientId,
    scan_date: input.scanDate,
    weight_kg: input.weightKg,
    skeletal_muscle_kg: input.skeletalMuscleKg,
    body_fat_pct: input.bodyFatPct,
    body_fat_kg: input.bodyFatKg,
    visceral_fat_level: input.visceralFatLevel,
    bmr_kcal: input.bmrKcal,
    inbody_score: input.inbodyScore,
    notes: input.notes.trim() || null,
    printout_path: printoutPath,
  });
  if (error) return fail(error, 'Could not save the scan');

  if (input.bodyFatPct != null) {
    const { data: newer } = await supabase
      .from('body_scans')
      .select('id')
      .eq('client_id', clientId)
      .not('body_fat_pct', 'is', null)
      .gt('scan_date', input.scanDate)
      .limit(1);
    if (!newer?.length) {
      const { data: profile } = await supabase
        .from('client_profiles')
        .select('body_fat_pct, body_fat_estimated, review_reasons')
        .eq('client_id', clientId)
        .maybeSingle();
      if (profile && (profile.body_fat_pct == null || profile.body_fat_estimated === true)) {
        const reasons: string[] = profile.review_reasons ?? [];
        const note = 'Body fat updated from an InBody scan: check their targets';
        await supabase
          .from('client_profiles')
          .update({
            body_fat_pct: input.bodyFatPct,
            body_fat_estimated: false,
            needs_coach_review: true,
            review_reasons: reasons.includes(note) ? reasons : [...reasons, note],
          })
          .eq('client_id', clientId);
      }
    }
  }
  return ok();
}

export async function deleteBodyScan(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: scan } = await supabase.from('body_scans').select('printout_path').eq('id', id).maybeSingle();
  const { error } = await supabase.from('body_scans').delete().eq('id', id);
  if (error) return fail(error, 'Could not delete the scan');
  if (scan?.printout_path) await supabase.storage.from('inbody-scans').remove([scan.printout_path]);
  return ok();
}

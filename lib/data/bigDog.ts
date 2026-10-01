'use server';

import { raise } from './errors';
import { fail, ok } from './result';
import type { ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import { EXERCISES, EXERCISE_KEYS, formatResult, genderFromProfile, levelForResult } from '@/lib/bigDog';
import type { BigDogLevel } from '@/lib/bigDog';
import type { BigDogResultRow } from './types';

export async function getBigDogResults(clientId: string): Promise<BigDogResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('big_dog_results')
    .select('*')
    .eq('client_id', clientId)
    .order('tested_date', { ascending: false })
    .order('created_at', { ascending: false });
  // Table missing = migration 0063 not applied to this database yet. Show an empty state
  // rather than taking the whole dashboard down (this loads on every dashboard render).
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [];
  if (error) raise(error);
  return (data ?? []) as BigDogResultRow[];
}

// Coach-only (RLS: is_coach_of). Appends a row; the current level is derived from the latest.
export async function recordBigDogResult(
  clientId: string,
  exerciseKey: string,
  level: BigDogLevel,
  resultText: string | null
): Promise<void> {
  if (!EXERCISE_KEYS.has(exerciseKey)) throw new Error('Unknown exercise');
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').insert({
    client_id: clientId,
    exercise_key: exerciseKey,
    level,
    result_text: resultText?.trim() || null,
  });
  if (error) raise(error);
}

// The level is always recomputed here from the number and the client's sex, never taken from the
// browser, so a self-logged score can't claim a level it didn't earn.
async function levelFor(clientId: string, exerciseKey: string, value: number) {
  const exercise = EXERCISES.find((e) => e.key === exerciseKey);
  if (!exercise) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('client_profiles').select('gender').eq('client_id', clientId).maybeSingle();
  return { exercise, level: levelForResult(exercise, genderFromProfile(data?.gender), value) };
}

async function insertScore(clientId: string, exerciseKey: string, value: number, selfReported: boolean): Promise<ActionResult> {
  if (!Number.isFinite(value) || value < 0 || value > 100000) return fail(null, 'That result is not valid');
  const scored = await levelFor(clientId, exerciseKey, value);
  if (!scored) return fail(null, 'Unknown exercise');
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').insert({
    client_id: clientId,
    exercise_key: exerciseKey,
    level: scored.level,
    result_value: value,
    result_text: formatResult(scored.exercise.kind, value),
    self_reported: selfReported,
  });
  return error ? fail(error, 'Could not save that score') : ok();
}

// A member logging their own score (RLS lets them insert self-reported rows for themselves only).
export async function logMyBigDogScore(clientId: string, exerciseKey: string, value: number): Promise<ActionResult> {
  return insertScore(clientId, exerciseKey, value, true);
}

// A coach confirming a score: records a verified row (counts towards the T-shirt tier).
export async function verifyBigDogScore(clientId: string, exerciseKey: string, value: number): Promise<ActionResult> {
  return insertScore(clientId, exerciseKey, value, false);
}

// Removes one of the member's own self-reported scores (RLS refuses anything else).
export async function deleteMyBigDogScore(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('big_dog_results').delete().eq('id', id).eq('self_reported', true);
  return error ? fail(error, 'Could not delete that score') : ok();
}

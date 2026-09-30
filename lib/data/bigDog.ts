'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { EXERCISE_KEYS } from '@/lib/bigDog';
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

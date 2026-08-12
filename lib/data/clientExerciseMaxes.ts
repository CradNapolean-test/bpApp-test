'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ClientExerciseMaxRow } from './types';

export async function getClientExerciseMaxes(clientId: string): Promise<ClientExerciseMaxRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_exercise_maxes')
    .select('*')
    .eq('client_id', clientId)
    .order('tested_date', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

export async function recordExerciseMax(
  clientId: string,
  exerciseLibraryId: string,
  testedMax: number,
  isEstimated: boolean,
  reps: number = 1
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('client_exercise_maxes').insert({
    client_id: clientId,
    exercise_library_id: exerciseLibraryId,
    tested_max: testedMax,
    is_estimated: isEstimated,
    reps,
  });
  if (error) raise(error);
}

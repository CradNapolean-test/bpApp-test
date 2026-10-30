'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { WorkoutBlockResultRow } from './types';

// Every block result a member has saved. Empty (rather than an error) if the table is not there yet.
export async function getBlockResults(clientId: string): Promise<WorkoutBlockResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('workout_block_results').select('*').eq('client_id', clientId);
  if (error) return [];
  return (data ?? []) as WorkoutBlockResultRow[];
}

// The signed-in member saves (or changes) what they scored on one block of a workout.
export async function saveBlockResult(
  programDayId: string,
  blockKey: string,
  fields: {
    format: string | null;
    scoring: WorkoutBlockResultRow['scoring'];
    rounds: number | null;
    reps: number | null;
    seconds: number | null;
    score: number | null;
    done: boolean | null;
  }
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');

  const { error } = await supabase
    .from('workout_block_results')
    .upsert(
      { client_id: user.id, program_day_id: programDayId, block_key: blockKey, ...fields, logged_at: new Date().toISOString() },
      { onConflict: 'client_id,program_day_id,block_key' }
    );
  if (error) return fail(error, 'Could not save that result');
  return ok();
}

export async function deleteBlockResult(programDayId: string, blockKey: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');

  const { error } = await supabase
    .from('workout_block_results')
    .delete()
    .eq('client_id', user.id)
    .eq('program_day_id', programDayId)
    .eq('block_key', blockKey);
  if (error) return fail(error, 'Could not remove that result');
  return ok();
}

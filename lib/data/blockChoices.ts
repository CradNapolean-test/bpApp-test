'use server';

import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { WorkoutBlockChoiceRow } from './types';

// Every block choice a member has made. Empty (rather than an error) if the table is not there yet.
export async function getBlockChoices(clientId: string): Promise<WorkoutBlockChoiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('workout_block_choices').select('*').eq('client_id', clientId);
  if (error) return [];
  return (data ?? []) as WorkoutBlockChoiceRow[];
}

// The signed-in member picks (or changes) what they did in slot 1 or 2 of a workout. A single
// 20-minute conditioning block covers both slots, so choosing it clears any slot 2 pick.
export async function chooseBlock(programDayId: string, slot: 1 | 2, blockKey: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');

  const { error } = await supabase
    .from('workout_block_choices')
    .upsert(
      { client_id: user.id, program_day_id: programDayId, slot, block_key: blockKey, chosen_at: new Date().toISOString() },
      { onConflict: 'client_id,program_day_id,slot' }
    );
  if (error) return fail(error, 'Could not save that choice');

  if (slot === 1 && blockKey === 'conditioning:0') {
    await supabase.from('workout_block_choices').delete().eq('client_id', user.id).eq('program_day_id', programDayId).eq('slot', 2);
  }
  return ok();
}

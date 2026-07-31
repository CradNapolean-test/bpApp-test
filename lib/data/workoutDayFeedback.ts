'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { WorkoutDayFeedbackRow } from './types';

export async function getWorkoutDayFeedback(clientId: string): Promise<WorkoutDayFeedbackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workout_day_feedback')
    .select('*')
    .eq('client_id', clientId);
  if (error) raise(error);
  return data ?? [];
}

// Upserted on (client_id, program_day_id) -- resubmitting today updates the same row rather
// than creating a duplicate, mirroring dashboardBundle's getOrCreateDailyLog idiom.
export async function submitDayFeedback(
  clientId: string,
  programDayId: string,
  sessionRpe: number | null,
  notes: string | null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_day_feedback')
    .upsert(
      { client_id: clientId, program_day_id: programDayId, session_rpe: sessionRpe, notes },
      { onConflict: 'client_id,program_day_id' }
    );
  if (error) raise(error);
}

'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { SetType, WorkoutExerciseRow, WorkoutLogRow, WorkoutProgramDayRow, WorkoutProgramRow } from './types';

export async function getPrograms(clientId: string): Promise<WorkoutProgramRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workout_programs')
    .select('*, workout_program_days(*, workout_exercises(*))')
    .eq('client_id', clientId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []) as unknown as WorkoutProgramRow[];
}

export async function createProgram(clientId: string, name: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').insert({ client_id: clientId, name });
  if (error) raise(error);
}

export async function deleteProgram(programId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').delete().eq('id', programId);
  if (error) raise(error);
}

export async function addProgramDay(programId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_program_days')
    .insert({ program_id: programId, week_num: weekNum, day_label: dayLabel });
  if (error) raise(error);
}

export async function deleteProgramDay(dayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_program_days').delete().eq('id', dayId);
  if (error) raise(error);
}

export async function addExercise(
  programDayId: string,
  fields: Omit<WorkoutExerciseRow, 'id' | 'program_day_id'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_exercises')
    .insert({ program_day_id: programDayId, ...fields });
  if (error) raise(error);
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_exercises').delete().eq('id', exerciseId);
  if (error) raise(error);
}

// Persists a full drag-and-drop reorder: one update per row rather than a dedicated RPC,
// since there's no invariant here RLS can't already enforce and day-sized lists are small.
export async function reorderExercises(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('workout_exercises').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function updateExercise(
  exerciseId: string,
  fields: Partial<Omit<WorkoutExerciseRow, 'id' | 'program_day_id'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_exercises').update(fields).eq('id', exerciseId);
  if (error) raise(error);
}

export async function updateProgramDay(
  dayId: string,
  fields: Partial<Pick<WorkoutProgramDayRow, 'week_num' | 'day_label' | 'phase_label'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_program_days').update(fields).eq('id', dayId);
  if (error) raise(error);
}

// Bulk-applies the same field values across every exercise in a day in one round trip --
// used by the "apply to all exercises in this day" batch control, rather than looping N
// individual updateExercise calls from the client.
export async function applyFieldsToDay(
  dayId: string,
  fields: Partial<Pick<WorkoutExerciseRow, 'rest_seconds' | 'rpe'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_exercises').update(fields).eq('program_day_id', dayId);
  if (error) raise(error);
}

export async function getWorkoutLogs(clientId: string): Promise<WorkoutLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('logged_at', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

export async function logSet(
  clientId: string,
  exerciseId: string,
  fields: {
    set_number: number;
    actual_reps: number | null;
    actual_load: number | null;
    actual_rpe: number | null;
    set_type: SetType;
  }
): Promise<void> {
  const supabase = await createClient();
  // Denormalizes exercise_library_id onto the log row at write time (rather than resolving
  // it via a join through workout_exercises later) so cross-program exercise history
  // survives a coach subsequently deleting or restructuring the exercise/program.
  const { data: exercise, error: exerciseError } = await supabase
    .from('workout_exercises')
    .select('exercise_library_id')
    .eq('id', exerciseId)
    .maybeSingle();
  if (exerciseError) raise(exerciseError);

  const { error } = await supabase.from('workout_logs').insert({
    client_id: clientId,
    exercise_id: exerciseId,
    exercise_library_id: exercise?.exercise_library_id ?? null,
    ...fields,
  });
  if (error) raise(error);
}

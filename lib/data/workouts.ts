'use server';

import { createClient } from '@/lib/supabase/server';
import type { WorkoutExerciseRow, WorkoutLogRow, WorkoutProgramRow } from './types';

export async function getPrograms(clientId: string): Promise<WorkoutProgramRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workout_programs')
    .select('*, workout_program_days(*, workout_exercises(*))')
    .eq('client_id', clientId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as unknown as WorkoutProgramRow[];
}

export async function createProgram(clientId: string, name: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').insert({ client_id: clientId, name });
  if (error) throw error;
}

export async function deleteProgram(programId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').delete().eq('id', programId);
  if (error) throw error;
}

export async function addProgramDay(programId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_program_days')
    .insert({ program_id: programId, week_num: weekNum, day_label: dayLabel });
  if (error) throw error;
}

export async function deleteProgramDay(dayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_program_days').delete().eq('id', dayId);
  if (error) throw error;
}

export async function addExercise(
  programDayId: string,
  fields: Omit<WorkoutExerciseRow, 'id' | 'program_day_id'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_exercises')
    .insert({ program_day_id: programDayId, ...fields });
  if (error) throw error;
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_exercises').delete().eq('id', exerciseId);
  if (error) throw error;
}

export async function getWorkoutLogs(clientId: string): Promise<WorkoutLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function logSet(
  clientId: string,
  exerciseId: string,
  fields: { set_number: number; actual_reps: number | null; actual_load: number | null; actual_rpe: number | null }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_logs')
    .insert({ client_id: clientId, exercise_id: exerciseId, ...fields });
  if (error) throw error;
}

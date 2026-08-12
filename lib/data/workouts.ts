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

export async function updateProgram(
  programId: string,
  fields: Partial<Pick<WorkoutProgramRow, 'name' | 'start_date'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').update(fields).eq('id', programId);
  if (error) raise(error);
}

export async function deleteProgram(programId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_programs').delete().eq('id', programId);
  if (error) raise(error);
}

export async function addProgramDay(
  programId: string,
  weekNum: number,
  dayLabel: string,
  dayPosition: number | null = null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('workout_program_days')
    .insert({ program_id: programId, week_num: weekNum, day_label: dayLabel, day_position: dayPosition });
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
  fields: Partial<Pick<WorkoutProgramDayRow, 'week_num' | 'day_label' | 'phase_label' | 'notes' | 'day_position'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('workout_program_days').update(fields).eq('id', dayId);
  if (error) raise(error);
}

// Copies a day (and every one of its exercises, supersets intact) into a new day at the given
// week/label -- "Copy Workout" from the day menu. Plain sequential inserts rather than an RPC,
// matching reorderExercises' existing non-RPC style: no cross-row invariant here that RLS
// doesn't already enforce, and day-sized exercise lists are small.
export async function duplicateProgramDay(dayId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { data: sourceDay, error: dayError } = await supabase
    .from('workout_program_days')
    .select('program_id, phase_label, notes, day_position')
    .eq('id', dayId)
    .single();
  if (dayError) raise(dayError);

  const { data: exercises, error: exercisesError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('program_day_id', dayId);
  if (exercisesError) raise(exercisesError);

  const { data: newDay, error: insertDayError } = await supabase
    .from('workout_program_days')
    .insert({
      program_id: sourceDay.program_id,
      week_num: weekNum,
      day_label: dayLabel,
      phase_label: sourceDay.phase_label,
      notes: sourceDay.notes,
      day_position: sourceDay.day_position,
    })
    .select('id')
    .single();
  if (insertDayError) raise(insertDayError);

  if (exercises && exercises.length > 0) {
    const copies = exercises.map((ex) => ({
      program_day_id: newDay.id,
      exercise_library_id: ex.exercise_library_id,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      load: ex.load,
      rpe: ex.rpe,
      notes: ex.notes,
      video_url: ex.video_url,
      superset_group: ex.superset_group,
      rest_seconds: ex.rest_seconds,
      sort_order: ex.sort_order,
      block_type: ex.block_type,
      prescription_type: ex.prescription_type,
      percent_1rm: ex.percent_1rm,
    }));
    const { error: insertExercisesError } = await supabase.from('workout_exercises').insert(copies);
    if (insertExercisesError) raise(insertExercisesError);
  }
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

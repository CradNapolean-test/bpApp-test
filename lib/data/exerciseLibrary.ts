'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ExerciseLibraryRow } from './types';

export async function getExerciseLibrary(): Promise<ExerciseLibraryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('exercise_library').select('*').order('name');
  if (error) raise(error);
  return data ?? [];
}

export async function createLibraryExercise(
  fields: Omit<ExerciseLibraryRow, 'id' | 'created_by' | 'created_at'>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('exercise_library').insert({ ...fields, created_by: user.id });
  if (error) raise(error);
}

// Bulk-inserts an imported CSV in one round trip rather than looping createLibraryExercise --
// same shape, just N rows at once. Returns the count actually inserted so the importing UI can
// report it without a second read.
export async function bulkCreateLibraryExercises(
  rows: Omit<ExerciseLibraryRow, 'id' | 'created_by' | 'created_at'>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('exercise_library')
    .insert(rows.map((fields) => ({ ...fields, created_by: user.id })));
  if (error) raise(error);
  return rows.length;
}

export async function updateLibraryExercise(
  id: string,
  fields: Partial<Omit<ExerciseLibraryRow, 'id' | 'created_by' | 'created_at'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('exercise_library').update(fields).eq('id', id);
  if (error) raise(error);
}

export async function deleteLibraryExercise(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('exercise_library').delete().eq('id', id);
  if (error) raise(error);
}

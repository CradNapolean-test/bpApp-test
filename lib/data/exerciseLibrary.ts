'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { ExerciseLibraryRow } from './types';

export async function getExerciseLibrary(): Promise<ExerciseLibraryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('exercise_library').select('*').order('name');
  if (error) raise(error);
  return data ?? [];
}

// How many programme templates use each library exercise (by exercise id). Counts distinct templates, not
// rows: a 12-week template that repeats an exercise every week still counts once. Empty if it can't be read.
export async function getExerciseUsage(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const templatesByExercise = new Map<string, Set<string>>();
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabase
      .from('program_template_exercises')
      .select('exercise_library_id, program_template_days(template_id)')
      .not('exercise_library_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      const day = Array.isArray(row.program_template_days) ? row.program_template_days[0] : row.program_template_days;
      if (!row.exercise_library_id || !day?.template_id) continue;
      const set = templatesByExercise.get(row.exercise_library_id) ?? new Set<string>();
      set.add(day.template_id);
      templatesByExercise.set(row.exercise_library_id, set);
    }
    if (data.length < PAGE) break;
  }
  return Object.fromEntries(Array.from(templatesByExercise.entries()).map(([id, set]) => [id, set.size]));
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

// An exercise a programme or a member's workout uses cannot be deleted (the database refuses): retire it instead (is_active = false).
// Returns rather than throws so that reason reaches the screen.
export async function deleteLibraryExercise(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('exercise_library').delete().eq('id', id);
  if (error?.code === '23503') return fail({ message: "That exercise is used in a programme, so it can't be deleted. Retire it instead." });
  return error ? fail(error, 'Could not delete that exercise') : ok();
}

// Retires an exercise (hides it from pickers, keeps it in programmes that use it) or brings it back.
export async function setExerciseActive(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('exercise_library').update({ is_active: active }).eq('id', id);
  return error ? fail(error, 'Could not update that exercise') : ok();
}

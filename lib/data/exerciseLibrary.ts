'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { ExerciseLibraryRow } from './types';
import {
  LIBRARY_ADD_REFUSED,
  canAddToLibrary,
  cleanExerciseName,
  existingLibraryEntry,
  libraryNamePattern,
  libraryNameProblem,
  newLibraryEntry,
} from '@/lib/libraryCreate';

export async function getExerciseLibrary(): Promise<ExerciseLibraryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('exercise_library').select('*').order('name');
  if (error) raise(error);
  return data ?? [];
}

// Only the library entries a member's programmes use (R13/M1): the whole library was 190 KB of every member page, for a few dozen entries
// the member could actually see. The coach's view of a member still carries the whole library for building programmes.
export async function getExerciseLibraryByIds(ids: string[]): Promise<ExerciseLibraryRow[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from('exercise_library').select('*').in('id', unique).order('name');
  if (error) raise(error);
  return data ?? [];
}

// Just the id and name of every entry: the list in "Record a tested max", fetched when that form opens instead of riding on every page.
export async function getExerciseOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('exercise_library').select('id, name').order('name');
  if (error) raise(error);
  return (data ?? []) as { id: string; name: string }[];
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

// Whether the signed-in person may add to the library: the workout builder's picker offers "Create '<name>'" only then (item 5).
export async function canAddLibraryExercises(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('role, gym_id').eq('id', user.id).maybeSingle();
  return canAddToLibrary(data);
}

export type CreatedLibraryExercise = { ok: true; entry: ExerciseLibraryRow } | { ok: false; error: string };

// "Create '<name>'" in the workout builder: adds a typed name to the library (tracking type read from the name) and hands the row back
// for the picker to add to the workout, linked to it. A name the library already has once is handed back instead of being added again.
export async function createLibraryExerciseByName(name: string): Promise<CreatedLibraryExercise> {
  const refuse = (error: { message?: string } | null, fallback: string) => fail(error, fallback) as { ok: false; error: string };
  const problem = libraryNameProblem(name);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role, gym_id').eq('id', user.id).maybeSingle();
  if (profileError) return refuse(profileError, 'Could not check who you are');
  if (!canAddToLibrary(profile)) return { ok: false, error: LIBRARY_ADD_REFUSED };

  const { data: candidates, error: findError } = await supabase
    .from('exercise_library')
    .select('*')
    .ilike('name', libraryNamePattern(name))
    .limit(500);
  if (findError) return refuse(findError, 'Could not check the library');
  const existing = existingLibraryEntry((candidates ?? []) as ExerciseLibraryRow[], name);
  if (existing.kind === 'one') return { ok: true, entry: existing.entry };
  if (existing.kind === 'many') return { ok: false, error: `“${cleanExerciseName(name)}” is already in the library: pick it from the list.` };

  const { data, error } = await supabase
    .from('exercise_library')
    .insert({ ...newLibraryEntry(name), created_by: user.id })
    .select('*')
    .single();
  if (error || !data) return refuse(error, 'Could not add that exercise to the library');
  return { ok: true, entry: data as ExerciseLibraryRow };
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

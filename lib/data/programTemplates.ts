'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingCoachId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { ProgramTemplateDayRow, ProgramTemplateExerciseRow, ProgramTemplateRow, ProgramTemplateWithDays } from './types';

export async function getProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);
  const { data, error } = await supabase
    .from('program_templates')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at');
  if (error) raise(error);
  return data ?? [];
}

export async function getProgramTemplatesWithDays(): Promise<ProgramTemplateWithDays[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);
  const { data, error } = await supabase
    .from('program_templates')
    .select('*, program_template_days(*, program_template_exercises(*))')
    .eq('coach_id', coachId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []) as unknown as ProgramTemplateWithDays[];
}

export async function getProgramTemplateWithDays(templateId: string): Promise<ProgramTemplateWithDays | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('program_templates')
    .select('*, program_template_days(*, program_template_exercises(*))')
    .eq('id', templateId)
    .maybeSingle();
  if (error) raise(error);
  return data as unknown as ProgramTemplateWithDays | null;
}

export async function createProgramTemplate(name: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('program_templates').insert({ coach_id: user.id, name });
  if (error) raise(error);
}

export async function deleteProgramTemplate(templateId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_templates').delete().eq('id', templateId);
  if (error) raise(error);
}

export async function addTemplateDay(
  templateId: string,
  weekNum: number,
  dayLabel: string,
  dayPosition: number | null = null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_days')
    .insert({ template_id: templateId, week_num: weekNum, day_label: dayLabel, day_position: dayPosition });
  if (error) raise(error);
}

export async function deleteTemplateDay(dayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_days').delete().eq('id', dayId);
  if (error) raise(error);
}

export async function addTemplateExercise(
  templateDayId: string,
  fields: Omit<ProgramTemplateExerciseRow, 'id' | 'template_day_id'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_exercises')
    .insert({ template_day_id: templateDayId, ...fields });
  if (error) raise(error);
}

export async function deleteTemplateExercise(exerciseId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').delete().eq('id', exerciseId);
  if (error) raise(error);
}

// Persists a full drag-and-drop reorder: one update per row rather than a dedicated RPC,
// since there's no invariant here RLS can't already enforce and day-sized lists are small.
export async function reorderTemplateExercises(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('program_template_exercises').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function updateTemplateExercise(
  exerciseId: string,
  fields: Partial<Omit<ProgramTemplateExerciseRow, 'id' | 'template_day_id'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').update(fields).eq('id', exerciseId);
  if (error) raise(error);
}

export async function updateTemplateDay(
  dayId: string,
  fields: Partial<Pick<ProgramTemplateDayRow, 'week_num' | 'day_label' | 'phase_label' | 'notes' | 'day_position'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_days').update(fields).eq('id', dayId);
  if (error) raise(error);
}

// Copies a template day (and every one of its exercises) into a new day at the given
// week/label -- "Copy Workout" from the day menu, mirroring workouts.ts's duplicateProgramDay.
export async function duplicateTemplateDay(dayId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { data: sourceDay, error: dayError } = await supabase
    .from('program_template_days')
    .select('template_id, phase_label, notes, day_position')
    .eq('id', dayId)
    .single();
  if (dayError) raise(dayError);

  const { data: exercises, error: exercisesError } = await supabase
    .from('program_template_exercises')
    .select('*')
    .eq('template_day_id', dayId);
  if (exercisesError) raise(exercisesError);

  const { data: newDay, error: insertDayError } = await supabase
    .from('program_template_days')
    .insert({
      template_id: sourceDay.template_id,
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
      template_day_id: newDay.id,
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
      progression_load_increment: ex.progression_load_increment,
      progression_every_weeks: ex.progression_every_weeks,
    }));
    const { error: insertExercisesError } = await supabase.from('program_template_exercises').insert(copies);
    if (insertExercisesError) raise(insertExercisesError);
  }
}

// Bulk-applies the same field values across every exercise in a template day in one round
// trip, mirroring workouts.ts's applyFieldsToDay.
export async function applyFieldsToTemplateDay(
  dayId: string,
  fields: Partial<Pick<ProgramTemplateExerciseRow, 'rest_seconds' | 'rpe'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').update(fields).eq('template_day_id', dayId);
  if (error) raise(error);
}

// Copies a template (name, days, exercises) into a brand new template for the same coach --
// not a client, so an edit afterward never touches anything already assigned to clients.
export async function duplicateProgramTemplate(templateId: string, newName: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('duplicate_program_template', {
    p_template_id: templateId,
    p_new_name: newName,
  });
  return error ? fail(error, 'Could not duplicate that template') : ok();
}

// Copies the template into a real program for this client (snapshot, not a live reference --
// see 0013_exercise_library_and_program_templates.sql). Returns rather than throws since this
// is a user-facing domain error path ("Programme template not found") that Next.js would
// otherwise redact in production -- see result.ts.
export async function instantiateProgramTemplate(
  templateId: string,
  clientId: string,
  programName: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('instantiate_program_template', {
    p_template_id: templateId,
    p_client_id: clientId,
    p_program_name: programName,
  });
  return error ? fail(error, 'Could not start that programme') : ok();
}

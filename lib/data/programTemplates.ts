'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingCoachId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { ProgramTemplateExerciseRow, ProgramTemplateRow, ProgramTemplateWithDays } from './types';

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

export async function addTemplateDay(templateId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_days')
    .insert({ template_id: templateId, week_num: weekNum, day_label: dayLabel });
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

export async function swapTemplateExerciseOrder(
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number }
): Promise<void> {
  const supabase = await createClient();
  const { error: err1 } = await supabase
    .from('program_template_exercises')
    .update({ sort_order: b.sort_order })
    .eq('id', a.id);
  if (err1) raise(err1);
  const { error: err2 } = await supabase
    .from('program_template_exercises')
    .update({ sort_order: a.sort_order })
    .eq('id', b.id);
  if (err2) raise(err2);
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

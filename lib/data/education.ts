'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingCoachId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { EducationAssignmentWithContent, EducationContentRow } from './types';

export async function getEducationContent(): Promise<EducationContentRow[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);
  const { data, error } = await supabase
    .from('education_content')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at');
  if (error) raise(error);
  return data ?? [];
}

export async function createEducationContent(
  fields: Omit<EducationContentRow, 'id' | 'coach_id' | 'created_at'>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('education_content').insert({ ...fields, coach_id: user.id });
  if (error) raise(error);
}

export async function deleteEducationContent(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_content').delete().eq('id', id);
  if (error) raise(error);
}

export async function getClientEducationAssignments(clientId: string): Promise<EducationAssignmentWithContent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('education_assignments')
    .select('*, content:education_content(*)')
    .eq('client_id', clientId)
    .order('assigned_at', { ascending: false });
  if (error) raise(error);
  return (data ?? []) as unknown as EducationAssignmentWithContent[];
}

// Returns rather than throws -- assign_education_content raises user-facing domain errors
// that Next.js would redact out of a thrown error in production. See result.ts.
export async function assignEducationContent(contentId: string, clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_education_content', {
    p_content_id: contentId,
    p_client_id: clientId,
  });
  return error ? fail(error, 'Could not assign that content') : ok();
}

export async function markEducationComplete(assignmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_education_complete', { p_assignment_id: assignmentId });
  return error ? fail(error, 'Could not mark that as complete') : ok();
}

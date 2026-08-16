'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { FormAssignmentWithDetails, FormQuestionRow, FormTemplateRow, FormTemplateWithQuestions } from './types';

type QuestionInput = Omit<FormQuestionRow, 'id' | 'template_id'>;
type TemplateFields = { name: string; description: string | null; is_default_onboarding: boolean };

export async function getFormTemplates(): Promise<FormTemplateRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_questions(count)')
    .eq('gym_id', gymId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []).map((row) => {
    const { form_questions, ...rest } = row as typeof row & { form_questions: { count: number }[] };
    return { ...rest, questionCount: form_questions[0]?.count ?? 0 };
  });
}

export async function getFormTemplateWithQuestions(templateId: string): Promise<FormTemplateWithQuestions | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, questions:form_questions(*)')
    .eq('id', templateId)
    .order('order_index', { foreignTable: 'form_questions', ascending: true })
    .maybeSingle();
  if (error) raise(error);
  return data as unknown as FormTemplateWithQuestions | null;
}

export async function createFormTemplate(fields: TemplateFields, questions: QuestionInput[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  // At most one default onboarding form per gym (0054's unique index) -- clearing by gym_id,
  // not coach_id, so a second coach setting their own default correctly unsets the first's.
  if (fields.is_default_onboarding) {
    const { error: clearError } = await supabase
      .from('form_templates')
      .update({ is_default_onboarding: false })
      .eq('gym_id', gymId)
      .eq('is_default_onboarding', true);
    if (clearError) raise(clearError);
  }

  const { data: template, error } = await supabase
    .from('form_templates')
    .insert({ ...fields, coach_id: user.id, gym_id: gymId })
    .select()
    .single();
  if (error) raise(error);

  if (questions.length > 0) {
    const { error: qError } = await supabase
      .from('form_questions')
      .insert(questions.map((q) => ({ ...q, template_id: template.id })));
    if (qError) raise(qError);
  }
}

export async function updateFormTemplate(
  templateId: string,
  fields: TemplateFields,
  questions: QuestionInput[]
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  if (fields.is_default_onboarding) {
    const { error: clearError } = await supabase
      .from('form_templates')
      .update({ is_default_onboarding: false })
      .eq('gym_id', gymId)
      .eq('is_default_onboarding', true)
      .neq('id', templateId);
    if (clearError) raise(clearError);
  }

  const { error } = await supabase.from('form_templates').update(fields).eq('id', templateId);
  if (error) raise(error);

  // Questions are replaced wholesale on every edit -- simplest correct approach for a
  // low-frequency solo-coach admin action, not a concurrency-sensitive path.
  const { error: deleteError } = await supabase.from('form_questions').delete().eq('template_id', templateId);
  if (deleteError) raise(deleteError);

  if (questions.length > 0) {
    const { error: qError } = await supabase
      .from('form_questions')
      .insert(questions.map((q) => ({ ...q, template_id: templateId })));
    if (qError) raise(qError);
  }
}

export async function deleteFormTemplate(templateId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('form_templates').delete().eq('id', templateId);
  if (error) raise(error);
}

export async function getClientFormAssignments(clientId: string): Promise<FormAssignmentWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('form_assignments')
    .select('*, template:form_templates(*, questions:form_questions(*)), responses:form_responses(*)')
    .eq('client_id', clientId)
    .order('assigned_at', { ascending: false });
  if (error) raise(error);

  // form_questions is a grandchild of form_assignments (via form_templates), and PostgREST's
  // order(..., { foreignTable }) only reaches directly embedded resources -- sort here instead.
  const assignments = (data ?? []) as unknown as FormAssignmentWithDetails[];
  for (const assignment of assignments) {
    assignment.template.questions.sort((a, b) => a.order_index - b.order_index);
  }
  return assignments;
}

export async function assignForm(templateId: string, clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_form', { p_template_id: templateId, p_client_id: clientId });
  return error ? fail(error, 'Could not assign that form') : ok();
}

// submit_form_response raises "Form already submitted" -- a domain error the client needs
// to read, so this returns rather than throws (see result.ts).
export async function submitFormResponses(
  assignmentId: string,
  answers: { question_id: string; answer: unknown }[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_form_response', {
    p_assignment_id: assignmentId,
    p_answers: answers,
  });
  return error ? fail(error, 'Could not submit that form') : ok();
}

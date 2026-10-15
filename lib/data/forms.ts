'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import type { QuestionPayload } from '@/lib/formEdit';
import type { FormAssignmentWithDetails, FormQuestionRow, FormTemplateRow, FormTemplateWithQuestions } from './types';

// What a new form is created with. (Saving an existing form sends QuestionPayload: the same, plus the id of a question that already exists.)
type QuestionInput = Omit<FormQuestionRow, 'id' | 'template_id' | 'archived_at' | 'answerCount'>;
type TemplateFields = { name: string; description: string | null; is_default_onboarding: boolean };

// forGymId: a member's page lists the forms of the MEMBER'S gym; everywhere else it is the gym being worked in (R38).
export async function getFormTemplates(forGymId?: string | null): Promise<FormTemplateRow[]> {
  const supabase = await createClient();
  const gymId = forGymId ?? (await resolveScopingGymId(supabase));
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_questions(count)')
    .eq('gym_id', gymId)
    .is('form_questions.archived_at', null) // questions taken out after they had answers are not counted
    .order('created_at');
  if (error) raise(error);
  return (data ?? []).map((row) => {
    const { form_questions, ...rest } = row as typeof row & { form_questions: { count: number }[] };
    return { ...rest, questionCount: form_questions[0]?.count ?? 0 };
  });
}

// The form with its CURRENT questions (archived ones left out), each with the number of answers it already has, for the editor.
export async function getFormTemplateWithQuestions(templateId: string): Promise<FormTemplateWithQuestions | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('form_templates')
    .select('*, questions:form_questions(*)')
    .eq('id', templateId)
    .order('order_index', { foreignTable: 'form_questions', ascending: true })
    .maybeSingle();
  if (error) raise(error);
  if (!data) return null;
  const template = data as unknown as FormTemplateWithQuestions;
  template.questions = template.questions.filter((q) => !q.archived_at);

  const { data: counts } = await supabase.rpc('form_answer_counts', { p_template_id: templateId });
  const answersBy = new Map<string, number>((counts ?? []).map((c: { question_id: string; answers: number | string }) => [c.question_id, Number(c.answers)]));
  for (const q of template.questions) q.answerCount = answersBy.get(q.id) ?? 0;
  return template;
}

// expectedGymId (on every write here): the gym the page was drawn for; see lib/data/gymGuard.ts (R28).
export async function createFormTemplate(fields: TemplateFields, questions: QuestionInput[], expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
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

// Saves an existing form in ONE request (save_form_template, migration 0135): questions that already exist are updated in place, new
// ones are added, and a question taken out is deleted if nobody answered it or archived if somebody did, so editing a form never deletes
// answers (R3). Returns rather than throws so the reason (for example a choice question with no options) reaches the screen.
export async function updateFormTemplate(
  templateId: string,
  fields: TemplateFields,
  questions: QuestionPayload[],
  expectedGymId?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('save_form_template', {
    p_template_id: templateId,
    p_fields: fields,
    p_questions: questions,
  });
  return error ? fail(error, 'Could not save that form') : ok();
}

export async function deleteFormTemplate(templateId: string, expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
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
  // An assignment whose template is gone (deleted, or not visible under RLS) can't be filled in, so skip it.
  const assignments = ((data ?? []) as unknown as FormAssignmentWithDetails[]).filter((a) => a.template);
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

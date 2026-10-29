import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FormAssignmentWithDetails } from '@ballistic/shared/data/types';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The member's forms with their questions and the answers already given. Small (a handful of forms of a few questions
// each), so one request brings it all; the answers of finished forms are shown from it without another trip.
export function useFormAssignments() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['form-assignments', userId],
    queryFn: async (): Promise<FormAssignmentWithDetails[]> => {
      const { data, error } = await supabase
        .from('form_assignments')
        .select('*, template:form_templates(*, questions:form_questions(*)), responses:form_responses(*)')
        .eq('client_id', userId)
        .order('assigned_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      // An assignment whose form is gone (deleted, or not visible) cannot be filled in. Questions come back in no
      // particular order from the nested select, so they are put in the coach's order here.
      const assignments = ((data ?? []) as unknown as FormAssignmentWithDetails[]).filter((a) => a.template);
      for (const a of assignments) a.template.questions.sort((x, y) => x.order_index - y.order_index);
      return assignments;
    },
  });
}

// Sends the answers; the database function checks the form is theirs and not already sent. The pending count (Home banner,
// Coach row) and the list refresh once it is in.
export function useSubmitForm() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, answers }: { assignmentId: string; answers: { question_id: string; answer: unknown }[] }) => {
      const { error } = await supabase.rpc('submit_form_response', { p_assignment_id: assignmentId, p_answers: answers });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-assignments', userId] });
      qc.invalidateQueries({ queryKey: ['pending-forms', userId] });
    },
  });
}

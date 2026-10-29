import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EducationCourseAssignmentWithDetails, EducationLessonCompletionRow } from '@ballistic/shared/data/types';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The member's courses with their sections and lessons, and which lessons they have finished. Two requests in parallel
// (completions cannot be embedded in the same call: they relate to a course only through lesson > section > course).
export function useCourseAssignments() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['courses', userId],
    queryFn: async (): Promise<EducationCourseAssignmentWithDetails[]> => {
      const [assignments, completions] = await Promise.all([
        supabase
          .from('education_course_assignments')
          .select('*, course:education_courses(*, education_modules(*, education_lessons(*)))')
          .eq('client_id', userId)
          .order('assigned_at', { ascending: false }),
        supabase.from('education_lesson_completions').select('*').eq('client_id', userId),
      ]);
      if (assignments.error) throw assignments.error;
      if (completions.error) throw completions.error;
      const done = (completions.data ?? []) as EducationLessonCompletionRow[];
      // A course the member cannot read comes back empty; leave it out rather than break the screen.
      return ((assignments.data ?? []) as unknown as Omit<EducationCourseAssignmentWithDetails, 'completions'>[]).filter((a) => a.course != null).map((a) => ({ ...a, completions: done }));
    },
  });
}

// Mark a lesson complete / not complete. Shown at once and rolled back on failure; the database only accepts lessons of an
// assigned course that have been unlocked, and says so if not.
export function useToggleLesson() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['courses', userId];
  return useMutation({
    mutationFn: async ({ lessonId, complete }: { lessonId: string; complete: boolean }) => {
      if (complete) {
        const { error } = await supabase.from('education_lesson_completions').insert({ lesson_id: lessonId, client_id: userId });
        // Already marked (a second tap, or another device): the lesson is complete either way.
        if (error && error.code !== '23505') throw new Error(/not open yet|not in a course/i.test(error.message) ? error.message : 'Could not save that.');
      } else {
        const { error } = await supabase.from('education_lesson_completions').delete().eq('lesson_id', lessonId).eq('client_id', userId);
        if (error) throw new Error('Could not save that.');
      }
    },
    onMutate: async ({ lessonId, complete }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<EducationCourseAssignmentWithDetails[]>(key);
      qc.setQueryData<EducationCourseAssignmentWithDetails[]>(key, (rows = []) =>
        rows.map((a) => {
          const without = a.completions.filter((c) => c.lesson_id !== lessonId);
          const completions = complete ? [...without, { id: 'pending-' + lessonId, lesson_id: lessonId, client_id: userId, completed_at: new Date().toISOString() } as EducationLessonCompletionRow] : without;
          return { ...a, completions };
        }),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

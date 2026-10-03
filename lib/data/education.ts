'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { CourseRollupRow, EducationCourseAssignmentWithDetails, EducationCourseWithModules } from './types';

// Fetches every course already nested with its modules/lessons in one round trip (mirrors
// getProgramTemplatesWithDays) -- lets the coach-authoring UI derive its currently-open
// course straight from these already-fresh props after any mutation (router.refresh() already
// re-runs this), rather than a separate on-click fetch that could go stale.
export async function getCourses(): Promise<EducationCourseWithModules[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('education_courses')
    .select('*, education_modules(*, education_lessons(*))')
    .eq('gym_id', gymId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []) as unknown as EducationCourseWithModules[];
}

export async function createCourse(title: string, description: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase
    .from('education_courses')
    .insert({ coach_id: user.id, gym_id: gymId, title, description });
  if (error) raise(error);
}

export async function updateCourse(id: string, fields: { title?: string; description?: string | null }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_courses').update(fields).eq('id', id);
  if (error) raise(error);
}

export async function updateModule(id: string, title: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_modules').update({ title }).eq('id', id);
  if (error) raise(error);
}

export async function deleteCourse(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_courses').delete().eq('id', id);
  if (error) raise(error);
}

export async function addModule(courseId: string, title: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from('education_modules')
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (existingError) raise(existingError);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('education_modules').insert({ course_id: courseId, title, sort_order: nextOrder });
  if (error) raise(error);
}

export async function deleteModule(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_modules').delete().eq('id', id);
  if (error) raise(error);
}

// Same shape as mealSections.ts's reorderMealSections -- one update per row, no RPC needed
// for a small per-course list.
export async function reorderModules(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('education_modules').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function addLesson(
  moduleId: string,
  fields: { title: string; body: string | null; link_url: string | null; unlock_at: string | null }
): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from('education_lessons')
    .select('sort_order')
    .eq('module_id', moduleId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (existingError) raise(existingError);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from('education_lessons')
    .insert({ module_id: moduleId, ...fields, sort_order: nextOrder });
  if (error) raise(error);
}

export async function updateLesson(
  id: string,
  fields: Partial<{ title: string; body: string | null; link_url: string | null; unlock_at: string | null }>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_lessons').update(fields).eq('id', id);
  if (error) raise(error);
}

export async function deleteLesson(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_lessons').delete().eq('id', id);
  if (error) raise(error);
}

export async function reorderLessons(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('education_lessons').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function getClientCourseAssignments(clientId: string): Promise<EducationCourseAssignmentWithDetails[]> {
  const supabase = await createClient();
  // Two separate queries, not one embedded select: education_lesson_completions has no
  // direct foreign key to education_course_assignments (it relates only indirectly, through
  // lesson -> module -> course -> assignment), so PostgREST can't embed it in a single call.
  const [assignmentsResult, completionsResult] = await Promise.all([
    supabase
      .from('education_course_assignments')
      .select('*, course:education_courses(*, education_modules(*, education_lessons(*)))')
      .eq('client_id', clientId)
      .order('assigned_at', { ascending: false }),
    supabase.from('education_lesson_completions').select('*').eq('client_id', clientId),
  ]);
  if (assignmentsResult.error) raise(assignmentsResult.error);
  if (completionsResult.error) raise(completionsResult.error);

  const completions = completionsResult.data ?? [];
  // An assignment whose course the viewer can't read comes back with a null course; drop it
  // rather than crash the screen.
  return ((assignmentsResult.data ?? []) as unknown as Omit<EducationCourseAssignmentWithDetails, 'completions'>[])
    .filter((a) => a.course != null)
    .map((a) => ({ ...a, completions }));
}

// Returns rather than throws -- assign_education_course raises user-facing domain errors that
// Next.js would redact out of a thrown error in production. See result.ts.
export async function assignCourse(courseId: string, clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_education_course', {
    p_course_id: courseId,
    p_client_id: clientId,
  });
  return error ? fail(error, 'Could not assign that course') : ok();
}

export async function markLessonComplete(lessonId: string, clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('education_lesson_completions').insert({ lesson_id: lessonId, client_id: clientId });
  if (error) raise(error);
}

export async function markLessonIncomplete(lessonId: string, clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('education_lesson_completions')
    .delete()
    .eq('lesson_id', lessonId)
    .eq('client_id', clientId);
  if (error) raise(error);
}

// Who has each of this gym's courses and how many of its lessons they have finished. Only what the
// signed-in coach is allowed to see comes back. Empty (never an error) so the Library still loads.
export async function getCourseRollup(): Promise<CourseRollupRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data: courses, error } = await supabase
    .from('education_courses')
    .select('id, education_modules(education_lessons(id))')
    .eq('gym_id', gymId);
  if (error || !courses || courses.length === 0) return [];

  const lessonsByCourse = new Map<string, Set<string>>();
  for (const c of courses) {
    const set = new Set<string>();
    for (const m of (c.education_modules ?? []) as { education_lessons: { id: string }[] }[]) {
      for (const l of m.education_lessons ?? []) set.add(l.id);
    }
    lessonsByCourse.set(c.id, set);
  }

  const { data: assignments, error: aError } = await supabase
    .from('education_course_assignments')
    .select('course_id, client_id, assigned_at')
    .in('course_id', courses.map((c) => c.id));
  if (aError || !assignments || assignments.length === 0) return [];

  const clientIds = Array.from(new Set(assignments.map((a) => a.client_id)));
  const { data: completions } = await supabase
    .from('education_lesson_completions')
    .select('lesson_id, client_id')
    .in('client_id', clientIds);

  const doneByClient = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    const set = doneByClient.get(c.client_id) ?? new Set<string>();
    set.add(c.lesson_id);
    doneByClient.set(c.client_id, set);
  }

  return assignments.map((a) => {
    const lessons = lessonsByCourse.get(a.course_id) ?? new Set<string>();
    const done = Array.from(doneByClient.get(a.client_id) ?? []).filter((id) => lessons.has(id)).length;
    return { course_id: a.course_id, client_id: a.client_id, assigned_at: a.assigned_at, done };
  });
}

// Copies a course into another gym the coach belongs to (an independent copy, no assignments).
export async function copyCourseToGym(courseId: string, targetGymId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('copy_education_course_to_gym', { p_course_id: courseId, p_target_gym_id: targetGymId });
  return error ? fail(error, 'Could not copy that course') : ok();
}

// Gives a course to several members at once. Anyone who already has it is skipped, so it is safe to run
// again after adding people.
export async function assignCourseToMany(courseId: string, clientIds: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from('education_course_assignments').select('client_id').eq('course_id', courseId);
  const already = new Set((existing ?? []).map((e) => e.client_id));
  const targets = Array.from(new Set(clientIds)).filter((id) => !already.has(id));
  if (targets.length === 0) return ok();

  const results = await Promise.all(
    targets.map((clientId) => supabase.rpc('assign_education_course', { p_course_id: courseId, p_client_id: clientId }))
  );
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return fail(failed[0].error, `${failed.length} of ${targets.length} could not be assigned`);
  }
  return ok();
}

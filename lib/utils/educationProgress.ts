import type { EducationCourseWithModules, EducationLessonCompletionRow, EducationLessonRow } from '@/lib/data/types';

function allLessons(course: EducationCourseWithModules): EducationLessonRow[] {
  return course.education_modules.flatMap((m) => m.education_lessons);
}

export function courseCompletionPercent(
  course: EducationCourseWithModules,
  completions: EducationLessonCompletionRow[]
): number {
  const lessons = allLessons(course);
  if (lessons.length === 0) return 0;
  const completedIds = new Set(completions.map((c) => c.lesson_id));
  const completed = lessons.filter((l) => completedIds.has(l.id)).length;
  return Math.round((completed / lessons.length) * 100);
}

export function isLessonUnlocked(lesson: EducationLessonRow, todayIso: string): boolean {
  return lesson.unlock_at == null || lesson.unlock_at <= todayIso;
}

// What a member is sent for a lesson that has not unlocked yet (ED1): the title and the date it opens (the screen shows both), but not the
// text or the link, which used to arrive in the page and could be read before the coach meant them to. The coach's view is unchanged.
export function redactLockedLessons<T extends { course: EducationCourseWithModules }>(assignments: T[], todayIso: string): T[] {
  return assignments.map((a) => ({
    ...a,
    course: {
      ...a.course,
      education_modules: a.course.education_modules.map((m) => ({
        ...m,
        education_lessons: m.education_lessons.map((l) => (isLessonUnlocked(l, todayIso) ? l : { ...l, body: null, link_url: null })),
      })),
    },
  }));
}

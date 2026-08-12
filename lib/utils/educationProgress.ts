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

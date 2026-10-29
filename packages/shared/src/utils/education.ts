import type { EducationCourseWithModules, EducationLessonCompletionRow, EducationLessonRow, EducationModuleWithLessons } from '../data/types';

// Reading a course on the phone: the order things are shown in, which section starts open, and which links may be opened.
// (The percentage and the lock rule are in educationProgress.ts.)

export function orderedModules(course: EducationCourseWithModules): EducationModuleWithLessons[] {
  return [...course.education_modules].sort((a, b) => a.sort_order - b.sort_order);
}

export function orderedLessons(module: EducationModuleWithLessons): EducationLessonRow[] {
  return [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);
}

// Sections start collapsed except the first one that still has something left to do.
export function firstUnfinishedModuleId(course: EducationCourseWithModules, completions: Pick<EducationLessonCompletionRow, 'lesson_id'>[]): string | null {
  const done = new Set(completions.map((c) => c.lesson_id));
  return orderedModules(course).find((m) => m.education_lessons.some((l) => !done.has(l.id)))?.id ?? null;
}

export function moduleProgress(module: EducationModuleWithLessons, completions: Pick<EducationLessonCompletionRow, 'lesson_id'>[]): { done: number; total: number } {
  const done = new Set(completions.map((c) => c.lesson_id));
  return { done: module.education_lessons.filter((l) => done.has(l.id)).length, total: module.education_lessons.length };
}

export function courseStatus(percent: number, completedCount: number): 'Not started' | 'In progress' | 'Completed' {
  return completedCount === 0 ? 'Not started' : percent >= 100 ? 'Completed' : 'In progress';
}

// A lesson link is typed in by the coach, so only web addresses are ever opened (never tel:, file:, javascript: or an app link).
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

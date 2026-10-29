import { describe, expect, it } from 'vitest';
import { courseCompletionPercent, isLessonUnlocked, redactLockedLessons } from './educationProgress';

const lesson = (id: string, unlock_at: string | null) =>
  ({ id, module_id: 'm1', title: `Lesson ${id}`, body: `Secret text ${id}`, link_url: `https://example.com/${id}`, sort_order: 0, unlock_at }) as never;

const assignment = {
  id: 'a1',
  completions: [],
  course: {
    id: 'c1',
    title: 'Course',
    education_modules: [{ id: 'm1', title: 'Module', sort_order: 0, education_lessons: [lesson('open', null), lesson('past', '2026-10-01'), lesson('today', '2026-10-15'), lesson('later', '2026-11-01')] }],
  },
} as never;

describe('isLessonUnlocked', () => {
  it('opens on the unlock day', () => {
    expect(isLessonUnlocked(lesson('x', '2026-10-15'), '2026-10-15')).toBe(true);
    expect(isLessonUnlocked(lesson('x', '2026-10-16'), '2026-10-15')).toBe(false);
    expect(isLessonUnlocked(lesson('x', null), '2026-10-15')).toBe(true);
  });
});

describe('redactLockedLessons (ED1)', () => {
  const [redacted] = redactLockedLessons([assignment], '2026-10-15') as unknown as { course: { education_modules: { education_lessons: { id: string; title: string; body: string | null; link_url: string | null; unlock_at: string | null }[] }[] } }[];
  const lessons = redacted.course.education_modules[0].education_lessons;
  const byId = (id: string) => lessons.find((l) => l.id === id)!;

  it('strips the text and link from a lesson that has not unlocked, keeping its title and date for the lock row', () => {
    expect(byId('later')).toMatchObject({ title: 'Lesson later', unlock_at: '2026-11-01', body: null, link_url: null });
  });

  it('leaves lessons that are open untouched', () => {
    for (const id of ['open', 'past', 'today']) {
      expect(byId(id).body).toBe(`Secret text ${id}`);
      expect(byId(id).link_url).toBe(`https://example.com/${id}`);
    }
  });

  it('does not change the original assignment', () => {
    const original = (assignment as unknown as { course: { education_modules: { education_lessons: { id: string; body: string | null }[] }[] } }).course.education_modules[0].education_lessons;
    expect(original.find((l) => l.id === 'later')?.body).toBe('Secret text later');
  });

  it('still counts the locked lessons towards completion', () => {
    const percent = courseCompletionPercent((redacted as unknown as { course: never }).course, [{ lesson_id: 'open' } as never]);
    expect(percent).toBe(25);
  });
});

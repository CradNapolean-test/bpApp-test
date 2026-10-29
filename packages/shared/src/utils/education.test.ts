import { describe, expect, it } from 'vitest';

import type { EducationCourseWithModules } from '../data/types';
import { courseStatus, firstUnfinishedModuleId, moduleProgress, orderedLessons, orderedModules, safeHttpUrl } from './education';

const lesson = (id: string, sort: number) => ({ id, module_id: 'm', title: id, body: null, link_url: null, sort_order: sort, unlock_at: null });
const course = {
  id: 'c', coach_id: 'x', gym_id: 'g', title: 'Course', description: null, created_at: '',
  education_modules: [
    { id: 'm2', course_id: 'c', title: 'Second', sort_order: 1, education_lessons: [lesson('l3', 0), lesson('l4', 1)] },
    { id: 'm1', course_id: 'c', title: 'First', sort_order: 0, education_lessons: [lesson('l2', 1), lesson('l1', 0)] },
  ],
} as unknown as EducationCourseWithModules;

describe('ordering', () => {
  it('sorts sections and lessons by their sort order', () => {
    expect(orderedModules(course).map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(orderedLessons(orderedModules(course)[0]).map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});

describe('firstUnfinishedModuleId', () => {
  it('opens the first section with something left to do', () => {
    expect(firstUnfinishedModuleId(course, [])).toBe('m1');
    expect(firstUnfinishedModuleId(course, [{ lesson_id: 'l1' }, { lesson_id: 'l2' }])).toBe('m2');
  });
  it('is null when everything is done', () => {
    expect(firstUnfinishedModuleId(course, ['l1', 'l2', 'l3', 'l4'].map((id) => ({ lesson_id: id })))).toBeNull();
  });
});

describe('moduleProgress and courseStatus', () => {
  it('counts the lessons done in a section', () => {
    expect(moduleProgress(orderedModules(course)[0], [{ lesson_id: 'l1' }, { lesson_id: 'l4' }])).toEqual({ done: 1, total: 2 });
  });
  it('names the state of a course', () => {
    expect(courseStatus(0, 0)).toBe('Not started');
    expect(courseStatus(50, 2)).toBe('In progress');
    expect(courseStatus(100, 4)).toBe('Completed');
  });
});

describe('safeHttpUrl', () => {
  it('allows web addresses', () => {
    expect(safeHttpUrl('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(safeHttpUrl(' http://example.com/a.pdf ')).toBe('http://example.com/a.pdf');
  });
  it('refuses everything else', () => {
    for (const bad of ['javascript:alert(1)', 'tel:+441234', 'file:///etc/passwd', 'intent://x#Intent;end', 'ballistic://home', 'not a url', '', null, undefined]) {
      expect(safeHttpUrl(bad as string | null | undefined)).toBeNull();
    }
  });
});

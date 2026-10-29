import { describe, expect, it } from 'vitest';

import { cleanPhotoDescription, groupByMealSection, NEEDS_PHOTO_OR_NOTE, suggestMealSection, validateMealEntry, validatePhotoDescription } from './photoDiary';

describe('validateMealEntry', () => {
  it('accepts a photo, a note or both, but not neither', () => {
    expect(validateMealEntry(true, '')).toBeNull();
    expect(validateMealEntry(false, 'Chicken salad')).toBeNull();
    expect(validateMealEntry(true, 'Chicken salad')).toBeNull();
    expect(validateMealEntry(false, '   ')).toBe(NEEDS_PHOTO_OR_NOTE);
    expect(validateMealEntry(false, '')).toBe(NEEDS_PHOTO_OR_NOTE);
  });
});

describe('cleanPhotoDescription / validatePhotoDescription', () => {
  it('trims the note, treats an empty one as none, and limits it to 500 characters', () => {
    expect(cleanPhotoDescription('  Chicken salad  ')).toBe('Chicken salad');
    expect(cleanPhotoDescription('   ')).toBeNull();
    expect(validatePhotoDescription('x'.repeat(500))).toBeNull();
    expect(validatePhotoDescription('x'.repeat(501))).not.toBeNull();
  });
});

const SECTIONS = [
  { id: 'b', label: 'Breakfast', sort_order: 0 },
  { id: 'l', label: 'Lunch', sort_order: 1 },
  { id: 'd', label: 'Dinner', sort_order: 2 },
  { id: 's', label: 'Snacks', sort_order: 3 },
];

describe('suggestMealSection', () => {
  it('picks the meal for the time of day by the section name', () => {
    expect(suggestMealSection(SECTIONS, 8)).toBe('b');
    expect(suggestMealSection(SECTIONS, 12)).toBe('l');
    expect(suggestMealSection(SECTIONS, 19)).toBe('d');
    expect(suggestMealSection(SECTIONS, 16)).toBe('s');
    expect(suggestMealSection(SECTIONS, 23)).toBe('s');
  });
  it('suggests nothing when no section fits', () => {
    expect(suggestMealSection([{ id: 'x', label: 'Pre-workout', sort_order: 0 }], 8)).toBeNull();
  });
});

describe('groupByMealSection', () => {
  it('groups in section order, keeps order inside a group, and puts meals with no type last', () => {
    const entries = [
      { id: '1', meal_section_id: 'd' },
      { id: '2', meal_section_id: null },
      { id: '3', meal_section_id: 'b' },
      { id: '4', meal_section_id: 'd' },
    ];
    const groups = groupByMealSection(entries, SECTIONS);
    expect(groups.map((g) => g.section?.id ?? null)).toEqual(['b', 'd', null]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['1', '4']);
  });
  it('treats a section that no longer exists as no meal type', () => {
    expect(groupByMealSection([{ id: '1', meal_section_id: 'gone' }], SECTIONS)).toEqual([{ section: null, entries: [{ id: '1', meal_section_id: 'gone' }] }]);
  });
});

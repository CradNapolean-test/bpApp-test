import { describe, expect, it } from 'vitest';

import { MAX_PHOTOS_PER_DAY, NEEDS_PHOTO_OR_NOTE, canAddPhoto, cleanPhotoDescription, foodPhotoPath, groupByMealSection, suggestMealSection, validateMealEntry, validatePhotoDescription } from './photoDiary';

describe('foodPhotoPath', () => {
  it('builds the same path the web does, starting with the member id', () => {
    expect(foodPhotoPath('member-1', 'log-1', 'abc')).toBe('member-1/log-1-abc.jpg');
    expect(foodPhotoPath('member-1', 'log-1', 'abc', 'png')).toBe('member-1/log-1-abc.png');
  });
});

describe('cleanPhotoDescription', () => {
  it('trims the note and treats an empty one as none', () => {
    expect(cleanPhotoDescription('  Chicken salad  ')).toBe('Chicken salad');
    expect(cleanPhotoDescription('   ')).toBeNull();
    expect(cleanPhotoDescription('')).toBeNull();
  });
});

describe('validatePhotoDescription', () => {
  it('limits the note to 500 characters', () => {
    expect(validatePhotoDescription('x'.repeat(500))).toBeNull();
    expect(validatePhotoDescription('x'.repeat(501))).not.toBeNull();
  });
  it('judges the trimmed note, which is what is saved', () => {
    expect(validatePhotoDescription('  ' + 'x'.repeat(500) + '  ')).toBeNull();
  });
});

describe('validateMealEntry', () => {
  it('accepts a photo, a note or both, but not neither', () => {
    expect(validateMealEntry(true, '')).toBeNull();
    expect(validateMealEntry(false, 'Chicken salad')).toBeNull();
    expect(validateMealEntry(true, 'Chicken salad')).toBeNull();
    expect(validateMealEntry(false, '   ')).toBe(NEEDS_PHOTO_OR_NOTE);
    expect(validateMealEntry(false, '')).toBe(NEEDS_PHOTO_OR_NOTE);
  });
});

describe('canAddPhoto', () => {
  it('allows up to 40 photos a day', () => {
    expect(canAddPhoto(0)).toBe(true);
    expect(canAddPhoto(MAX_PHOTOS_PER_DAY - 1)).toBe(true);
    expect(canAddPhoto(MAX_PHOTOS_PER_DAY)).toBe(false);
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

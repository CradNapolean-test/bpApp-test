import { describe, expect, it } from 'vitest';

import { canAddPhoto, cleanPhotoDescription, foodPhotoPath, MAX_PHOTOS_PER_DAY, NEEDS_PHOTO_OR_NOTE, validateMealEntry, validatePhotoDescription } from './photoDiary';

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

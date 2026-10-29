import { describe, expect, it } from 'vitest';

import { cleanPhotoDescription, NEEDS_PHOTO_OR_NOTE, validateMealEntry, validatePhotoDescription } from './photoDiary';

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

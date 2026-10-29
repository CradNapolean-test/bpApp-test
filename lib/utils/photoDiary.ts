// The photo diary's entry rules for the web (the phone app keeps the same ones in packages/shared/src/utils/photoDiary.ts).

export const MAX_PHOTO_DESCRIPTION = 500; // also the database's limit (migration 0114)
export const NEEDS_PHOTO_OR_NOTE = 'Add a photo or a short description of the meal.';

// The short note under a photo: trimmed, and nothing at all if it is empty.
export function cleanPhotoDescription(text: string): string | null {
  const t = text.trim();
  return t === '' ? null : t;
}

export function validatePhotoDescription(text: string): string | null {
  return text.trim().length > MAX_PHOTO_DESCRIPTION ? `Keep the note under ${MAX_PHOTO_DESCRIPTION} characters.` : null;
}

// A meal can be logged with a photo, a note, or both, but not neither (the database checks the same, migration 0145).
export function validateMealEntry(hasPhoto: boolean, description: string): string | null {
  return hasPhoto || description.trim() !== '' ? null : NEEDS_PHOTO_OR_NOTE;
}

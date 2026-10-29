// The photo diary: a visual food diary for members whose coach chose it. Photos only: no numbers are worked out from them.

export const MAX_PHOTO_DESCRIPTION = 500; // also the database's limit (migration 0114)
export const MAX_PHOTOS_PER_DAY = 40; // also the database's limit

// Where a meal photo lives in the private food-photos bucket. The first part is the member's own id, which the storage
// policies check; the same shape the web uses.
export function foodPhotoPath(clientId: string, dailyLogId: string, id: string, ext = 'jpg'): string {
  return `${clientId}/${dailyLogId}-${id}.${ext}`;
}

// The short note under a photo: trimmed, and nothing at all if it is empty.
export function cleanPhotoDescription(text: string): string | null {
  const t = text.trim();
  return t === '' ? null : t;
}

export function validatePhotoDescription(text: string): string | null {
  return text.trim().length > MAX_PHOTO_DESCRIPTION ? `Keep the note under ${MAX_PHOTO_DESCRIPTION} characters.` : null;
}

// A meal can be logged with a photo, a note, or both, but not neither (the database checks the same).
export const NEEDS_PHOTO_OR_NOTE = 'Add a photo or a short description of the meal.';
export function validateMealEntry(hasPhoto: boolean, description: string): string | null {
  return hasPhoto || description.trim() !== '' ? null : NEEDS_PHOTO_OR_NOTE;
}

// Whether another photo can be added to a day that already has `count`.
export function canAddPhoto(count: number): boolean {
  return count < MAX_PHOTOS_PER_DAY;
}

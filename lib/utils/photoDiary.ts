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

// ---------- meal type ----------
// Which meal a photo belongs to is one of the member's own meal sections (Breakfast, Lunch, ...), or none.

export interface MealSectionLite {
  id: string;
  label: string;
  sort_order: number;
}

// The section to preselect for the time of day, matched on the section's name; null when the member's sections do not include one
// that fits (they rename and add their own), in which case nothing is preselected.
export function suggestMealSection(sections: MealSectionLite[], hour: number): string | null {
  const wanted = hour >= 4 && hour < 11 ? 'breakfast' : hour >= 11 && hour < 15 ? 'lunch' : hour >= 17 && hour < 22 ? 'dinner' : hour >= 22 || hour < 4 ? 'snack' : 'snack';
  return sections.find((s) => s.label.toLowerCase().includes(wanted))?.id ?? null;
}

export interface MealGroup<T> {
  section: MealSectionLite | null;
  entries: T[];
}

// A day's meals grouped by meal in the member's section order, newest first inside each, the ones with no meal type last.
// A day with no meal types at all comes back as one group with no heading.
export function groupByMealSection<T extends { meal_section_id?: string | null }>(entries: T[], sections: MealSectionLite[]): MealGroup<T>[] {
  const known = new Set(sections.map((s) => s.id));
  const groups: MealGroup<T>[] = [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((section) => ({ section, entries: entries.filter((e) => e.meal_section_id === section.id) }))
    .filter((g) => g.entries.length > 0);
  const rest = entries.filter((e) => !e.meal_section_id || !known.has(e.meal_section_id));
  if (rest.length > 0) groups.push({ section: null, entries: rest });
  return groups;
}

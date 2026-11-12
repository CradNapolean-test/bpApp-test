// D26 (LB6, 11 Nov 2026): an exercise typed by name that is already in the library is linked to the library exercise, so it gets the
// library's video, tracking type and % of 1RM instead of being a bare name. Conservative on purpose: an exact name match only, ignoring
// case and extra spaces, and only when exactly one active library exercise has that name ("Deadlift" and "DEADLIFT" are both in the
// library today, so neither is picked for "deadlift"). Migration 0167 links the rows typed before this with the same rule.

// A name as it is compared: trimmed, runs of spaces made one, lower case.
export function exerciseNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// The one active library exercise with this name, or null (no match, or more than one).
export function findLibraryMatch<T extends { name: string; is_active?: boolean | null }>(library: T[], name: string): T | null {
  const key = exerciseNameKey(name);
  if (!key) return null;
  const hits = library.filter((l) => l.is_active !== false && exerciseNameKey(l.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

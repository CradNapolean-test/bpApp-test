// "Create '<name>'" in the workout builder's exercise picker (live review item 5): a name that is not in the library is added to the
// library and to the workout in one step, and the workout's exercise is linked to the new library row. What it records is read from the
// name, as when one is typed in the library (lib/trackingGuess.ts); the rest starts blank for the coach to fill in from the library.
//
// Who may add is the database's rule, "coaches add to exercise_library" (migration 0130): a coach at a gym (profiles.role = 'coach' and
// a gym_id, which is what my_gym_id() reads), adding as themselves. canAddToLibrary mirrors it so the picker offers the button only to
// them, and the server action refuses anyone else with a message before the database would.
import { exerciseNameKey } from './libraryMatch';
import { guessTrackingType } from './trackingGuess';
import type { TrackingType } from './workoutTracking';

export const LIBRARY_NAME_MAX = 100;

export const LIBRARY_ADD_REFUSED = 'Only a coach at a gym can add exercises to the library.';

// The name as it is stored: trimmed, runs of spaces made one.
export function cleanExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function libraryNameProblem(name: string): string | null {
  const clean = cleanExerciseName(name);
  if (!clean) return 'Type the exercise’s name first.';
  if (clean.length > LIBRARY_NAME_MAX) return `Keep the name to ${LIBRARY_NAME_MAX} characters or fewer.`;
  return null;
}

export function canAddToLibrary(profile: { role?: string | null; gym_id?: string | null } | null | undefined): boolean {
  return profile?.role === 'coach' && !!profile.gym_id;
}

// An ilike pattern that finds every library name that could be this one whatever its case and spacing: the words in order with anything
// between them ("db  press" and "DB Press" both). The exact comparison is made afterwards with exerciseNameKey. %, _ and \ in the name
// are matched as they are.
export function libraryNamePattern(name: string): string {
  return cleanExerciseName(name)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.replace(/[\\%_]/g, (c) => `\\${c}`))
    .join('%');
}

// The active library exercise already called this, if the picker's list was out of date (another coach added it a moment ago, or the
// whole library had not been read). More than one ("Deadlift" and "DEADLIFT") is for the coach to pick from the list.
export function existingLibraryEntry<T extends { name: string; is_active?: boolean | null }>(
  candidates: T[],
  name: string
): { kind: 'none' } | { kind: 'one'; entry: T } | { kind: 'many' } {
  const key = exerciseNameKey(name);
  const hits = candidates.filter((c) => c.is_active !== false && exerciseNameKey(c.name) === key);
  if (hits.length === 0) return { kind: 'none' };
  return hits.length === 1 ? { kind: 'one', entry: hits[0] } : { kind: 'many' };
}

export interface NewLibraryEntry {
  name: string;
  tracking_type: TrackingType;
  default_sets: null;
  default_reps: null;
  default_rpe: null;
  default_rest_seconds: null;
  video_url: null;
  notes: null;
  muscle_group: null;
  equipment: null;
  instructions: null;
  image_url: null;
}

// The library row for a typed name. A name with no confident guess records weight and reps, as everywhere else.
export function newLibraryEntry(name: string): NewLibraryEntry {
  const clean = cleanExerciseName(name);
  return {
    name: clean,
    tracking_type: guessTrackingType(clean) ?? 'weight_reps',
    default_sets: null,
    default_reps: null,
    default_rpe: null,
    default_rest_seconds: null,
    video_url: null,
    notes: null,
    muscle_group: null,
    equipment: null,
    instructions: null,
    image_url: null,
  };
}

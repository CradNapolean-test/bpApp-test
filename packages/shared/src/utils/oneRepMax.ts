import type { ClientExerciseMaxRow } from '../data/types';

export interface ResolvedMax {
  estimated1RM: number;
  source: ClientExerciseMaxRow;
}

// Resolves the latest tested max on file for a library exercise, converting a rep max (reps > 1, e.g. a 3RM) into an
// estimated 1RM via the Epley formula: a coach or member rarely tests a true 1RM directly, so treating every
// recorded weight as one would resolve %1RM prescriptions off the wrong number. reps === 1 (the default, matching
// every pre-existing row) is already a true 1RM. Moved unchanged from the web ExerciseEditor so web and mobile agree.
export function latestMax(maxes: ClientExerciseMaxRow[] | undefined, libraryId: string | null): ResolvedMax | null {
  if (!maxes || !libraryId) return null;
  const matches = maxes.filter((m) => m.exercise_library_id === libraryId);
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.tested_date + b.created_at).localeCompare(a.tested_date + a.created_at));
  const source = matches[0];
  const estimated1RM = source.reps > 1 ? source.tested_max * (1 + source.reps / 30) : source.tested_max;
  return { estimated1RM, source };
}

// The target load in kg for a "% of 1RM" prescription, rounded to the nearest kg, or null when there is no max on
// file or no percentage.
export function percentOfMaxKg(resolved: ResolvedMax | null, percent: number | null): number | null {
  if (!resolved || percent == null) return null;
  return Math.round((resolved.estimated1RM * percent) / 100);
}

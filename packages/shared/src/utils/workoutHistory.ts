import type { WorkoutLogRow } from '../data/types';
import { daysBetween, isoDateInTz } from './dates';

// "What did I do last time" and "is this a new best", for the member's workout screen. Moved from the web WorkoutTab
// so web and mobile agree. Same exercise = the same library entry when it has one, otherwise the same name
// (custom exercises).

type LogLike = Pick<WorkoutLogRow, 'id' | 'exercise_id' | 'exercise_library_id' | 'set_number' | 'actual_reps' | 'actual_load' | 'logged_at' | 'set_type'>;
export type ExerciseRef = { name: string; exercise_library_id: string | null };

// Working sets from OTHER sessions of the same exercise.
export function earlierLogs<L extends LogLike>(
  logs: L[],
  exerciseById: Map<string, ExerciseRef>,
  libraryId: string | null,
  name: string,
  excludeExerciseId: string,
): L[] {
  const wantName = name.trim().toLowerCase();
  return logs.filter((l) => {
    if (!l.exercise_id || l.exercise_id === excludeExerciseId || l.set_type !== 'working') return false;
    const logged = exerciseById.get(l.exercise_id);
    const logLib = l.exercise_library_id ?? logged?.exercise_library_id ?? null;
    if (libraryId && logLib === libraryId) return true;
    return !!wantName && logged?.name.trim().toLowerCase() === wantName;
  });
}

export interface LastSession<L> {
  sets: L[];
  // "Last week" when the session was 4-10 days ago, otherwise "Last time".
  label: 'Last week' | 'Last time';
  // When the latest set was logged (ISO timestamp); the screen formats it.
  loggedAt: string;
}

// The member's previous session of an exercise: its working sets in order, labelled, so they know what to beat.
export function lastSessionFor<L extends LogLike>(earlier: L[], tz: string, todayIso: string): LastSession<L> | null {
  if (earlier.length === 0) return null;
  const latest = [...earlier].sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  const sets = earlier
    .filter((l) => l.exercise_id === latest.exercise_id)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0) || a.logged_at.localeCompare(b.logged_at));
  const daysAgo = daysBetween(isoDateInTz(new Date(latest.logged_at), tz), todayIso);
  return { sets, label: daysAgo >= 4 && daysAgo <= 10 ? 'Last week' : 'Last time', loggedAt: latest.logged_at };
}

// The heaviest load from earlier sessions of this exercise; a heavier set today is a new best. Null when there is no
// earlier load above zero.
export function priorBestLoad(earlier: Pick<LogLike, 'actual_load'>[]): number | null {
  const loads = earlier.map((l) => l.actual_load ?? 0);
  return loads.length > 0 && Math.max(...loads) > 0 ? Math.max(...loads) : null;
}

export const isNewBest = (load: number | null | undefined, priorBest: number | null) => load != null && priorBest != null && load > priorBest;

// What the member did for this same set number last time (the last set if they did fewer sets then).
export function lastSetFor<L extends Pick<LogLike, 'actual_reps' | 'actual_load'>>(last: { sets: L[] } | null, setNumber: number): { reps: number | null; load: number | null } | null {
  const l = last?.sets[setNumber - 1] ?? last?.sets[last.sets.length - 1];
  return l ? { reps: l.actual_reps, load: l.actual_load } : null;
}

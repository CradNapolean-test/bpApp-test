import type { WorkoutProgramRow } from '@/lib/data/types';

// The library entries a member's programmes point at (R13/M1). The member's page carries only these rows of the exercise library, not all
// of it: names, pictures and videos for what they are actually doing.
export function libraryIdsOf(programs: Pick<WorkoutProgramRow, 'workout_program_days'>[]): string[] {
  const ids = new Set<string>();
  for (const program of programs) {
    for (const day of program.workout_program_days ?? []) {
      for (const exercise of day.workout_exercises ?? []) {
        if (exercise.exercise_library_id) ids.add(exercise.exercise_library_id);
      }
    }
  }
  return [...ids];
}

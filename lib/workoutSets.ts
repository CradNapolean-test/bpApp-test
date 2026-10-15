// Small rules behind the member's workout screen (L4).

// ---- set numbers ----
// The next set is numbered after the HIGHEST one logged, not "how many are logged plus one": after deleting set 2 of three, the old rule
// handed out number 3 again and the member had two sets numbered 3.
export function nextSetNumber(logs: { set_number: number | null }[]): number {
  const highest = logs.reduce((most, log, index) => Math.max(most, log.set_number ?? index + 1), 0);
  return highest + 1;
}

// A set with no reps, no load and no RPE says nothing; it used to be saved anyway and counted as a set done.
export function isEmptySet(set: { reps: number | '' | null; load: number | '' | null; rpe: number | '' | null }): boolean {
  const blank = (v: number | '' | null) => v === '' || v == null;
  return blank(set.reps) && blank(set.load) && blank(set.rpe);
}

// ---- finishing a workout ----
export interface WorkoutSummary {
  sets: number;
  exercises: number;
  empty: boolean;
}

// Given how many sets were logged for each exercise in the workout.
export function workoutSummary(setsPerExercise: number[]): WorkoutSummary {
  const sets = setsPerExercise.reduce((a, b) => a + b, 0);
  return { sets, exercises: setsPerExercise.filter((n) => n > 0).length, empty: sets === 0 };
}

export function finishMessage(summary: WorkoutSummary): string {
  if (summary.empty) return 'Workout closed. Nothing was logged.';
  const sets = `${summary.sets} set${summary.sets === 1 ? '' : 's'}`;
  const exercises = `${summary.exercises} exercise${summary.exercises === 1 ? '' : 's'}`;
  return `Workout complete: ${sets} across ${exercises}. Nice work.`;
}

// ---- Strong / Conditioning block choices ----
// A tap shows at once from local state while the save happens in the background. That local copy used to beat the server's forever, so a
// choice changed on another device (or by the coach) never showed up here. A local choice now only stands while the server still has what
// it had when the tap was made (the save has not landed yet); once the server has moved, the server wins.
export interface BlockChoice {
  slot1: string | null;
  slot2: string | null;
}
export interface LocalBlockChoice {
  choice: BlockChoice;
  // What the server held for that workout when the member tapped.
  base: BlockChoice;
}

const same = (a: BlockChoice | undefined, b: BlockChoice) => (a?.slot1 ?? null) === b.slot1 && (a?.slot2 ?? null) === b.slot2;

export function reconcileLocalChoices(local: Record<string, LocalBlockChoice>, server: Map<string, BlockChoice>): Map<string, BlockChoice> {
  const kept = new Map<string, BlockChoice>();
  for (const [dayId, entry] of Object.entries(local)) {
    if (same(server.get(dayId), entry.base)) kept.set(dayId, entry.choice);
  }
  return kept;
}

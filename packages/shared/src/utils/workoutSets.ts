// Small rules behind the member's workout screen (L4).

// ---- set numbers ----
// The next set is numbered after the HIGHEST one logged, not "how many are logged plus one": after deleting set 2 of three, the old rule
// handed out number 3 again and the member had two sets numbered 3.
export function nextSetNumber(logs: { set_number: number | null }[]): number {
  const highest = logs.reduce((most, log, index) => Math.max(most, log.set_number ?? index + 1), 0);
  return highest + 1;
}

// ---- keeping the screen's copy of the sets in step with what was saved (R13) ----
// Logging, correcting or deleting a set used to reload the whole dashboard (several seconds on a gym's signal, once per set). The workout
// screen now keeps its own copy of the sets and changes it as each save succeeds.
export type SetChange<T extends { id: string }> =
  | { kind: 'added'; row: T }
  | { kind: 'updated'; id: string; fields: Partial<T> }
  | { kind: 'deleted'; id: string };

export function applySetChange<T extends { id: string }>(logs: T[], change: SetChange<T>): T[] {
  switch (change.kind) {
    case 'added':
      return logs.some((l) => l.id === change.row.id) ? logs : [change.row, ...logs];
    case 'updated':
      return logs.map((l) => (l.id === change.id ? { ...l, ...change.fields } : l));
    case 'deleted':
      return logs.filter((l) => l.id !== change.id);
  }
}

// One exercise's sets in the order they were done. The sets come newest first, so the screen's "set 1, set 2..." chips ran backwards and
// the next set started from the first set's numbers instead of the last one's.
export function sortedSets<T extends { set_number: number | null; logged_at: string }>(logs: T[]): T[] {
  return [...logs].sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0) || a.logged_at.localeCompare(b.logged_at));
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

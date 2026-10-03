import type { WorkoutProgramRow } from '@/lib/data/types';

// When a programme counts as having begun: its start date, or for older hand-built programmes with
// no start date, the day it was created.
function effectiveStart(p: WorkoutProgramRow): string {
  return p.start_date ?? p.created_at.slice(0, 10);
}

// A member only ever follows one programme. The current one is the one whose start date is the latest
// that has already arrived. Programmes that start later are "upcoming"; everything else is past. Past
// programmes are kept (every weight and rep logged stays on file), they just aren't shown as the
// programme.
export function pickCurrentProgram(
  programs: WorkoutProgramRow[],
  todayIso: string
): { current: WorkoutProgramRow | null; upcoming: WorkoutProgramRow[]; past: WorkoutProgramRow[] } {
  const newestFirst = (a: WorkoutProgramRow, b: WorkoutProgramRow) =>
    effectiveStart(b).localeCompare(effectiveStart(a)) || b.created_at.localeCompare(a.created_at);
  const started = programs.filter((p) => effectiveStart(p) <= todayIso).sort(newestFirst);
  const upcoming = programs
    .filter((p) => effectiveStart(p) > todayIso)
    .sort((a, b) => effectiveStart(a).localeCompare(effectiveStart(b)));
  return { current: started[0] ?? null, upcoming, past: started.slice(1) };
}

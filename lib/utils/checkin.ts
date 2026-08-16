// Pure, synchronous resolution logic for the classes-linked check-in feature -- deliberately
// NOT in lib/data/*.ts (that family is 'use server'-async-only by convention). Operates over
// data the client already has fully loaded (DashboardShell's programs/workoutLogs), so no new
// server round trip is needed to decide whether/what a check-in button should do.
//
// Only one workout program is ever active for a client at a time (confirmed product
// decision), which simplifies this to: whichever program has the latest start_date that is
// still <= today wins, no overlap/tiebreak logic needed. A future-dated program simply
// doesn't count until its date arrives, at which point it naturally becomes the new
// latest-applicable one -- no "close out the old program" step required.
//
// A class's own day_of_week is matched directly against a programme day's day_position (both
// use the same 0=Sunday..6=Saturday convention) -- no separate manual "linked day" step for a
// coach to keep in sync with the class schedule.

import { daysBetween, isoDateInTz } from './dates';
import type { WorkoutLogRow, WorkoutProgramDayRow, WorkoutProgramRow } from '@/lib/data/types';

export type CheckinResolution =
  | { status: 'ready'; programId: string; dayId: string; weekNum: number }
  | { status: 'already_logged'; programId: string; dayId: string; weekNum: number }
  | { status: 'not_linked' }
  | { status: 'no_active_program' }
  | { status: 'no_matching_day' };

export function resolveActiveProgram(
  programs: WorkoutProgramRow[],
  todayIso: string
): { program: WorkoutProgramRow; weekNum: number } | null {
  const candidates = programs
    .filter((p): p is WorkoutProgramRow & { start_date: string } => p.start_date != null && p.start_date <= todayIso)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0));
  const program = candidates[0];
  if (!program || !program.start_date) return null;

  const weekNum = Math.floor(daysBetween(program.start_date, todayIso) / 7) + 1;
  const maxWeek = Math.max(0, ...program.workout_program_days.map((d) => d.week_num));
  if (weekNum > maxWeek) return null; // block has ended, nothing new assigned -- empty

  return { program, weekNum };
}

export function resolveProgramDayByPosition(
  program: WorkoutProgramRow,
  weekNum: number,
  dayPosition: number
): WorkoutProgramDayRow | null {
  return program.workout_program_days.find((d) => d.week_num === weekNum && d.day_position === dayPosition) ?? null;
}

function hasLoggedDayToday(day: WorkoutProgramDayRow, workoutLogs: WorkoutLogRow[], todayIso: string, tz: string): boolean {
  const dayExerciseIds = new Set(day.workout_exercises.map((e) => e.id));
  return workoutLogs.some(
    (log) => log.exercise_id && dayExerciseIds.has(log.exercise_id) && isoDateInTz(new Date(log.logged_at), tz) === todayIso
  );
}

export function resolveCheckinTarget(
  programs: WorkoutProgramRow[],
  workoutLogs: WorkoutLogRow[],
  classDayOfWeek: number | null,
  todayIso: string,
  tz: string
): CheckinResolution {
  if (classDayOfWeek == null) return { status: 'not_linked' };

  const active = resolveActiveProgram(programs, todayIso);
  if (!active) return { status: 'no_active_program' };

  const day = resolveProgramDayByPosition(active.program, active.weekNum, classDayOfWeek);
  if (!day) return { status: 'no_matching_day' };

  if (hasLoggedDayToday(day, workoutLogs, todayIso, tz)) {
    return { status: 'already_logged', programId: active.program.id, dayId: day.id, weekNum: active.weekNum };
  }
  return { status: 'ready', programId: active.program.id, dayId: day.id, weekNum: active.weekNum };
}

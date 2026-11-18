import { resolveActiveProgram, resolveProgramDayByPosition } from '@/lib/utils/checkin';
import { pickCurrentProgram } from '@/lib/utils/currentProgram';
import { isoDateInTz } from '@/lib/utils/dates';
import { dayHighlights } from '@/lib/workoutSections';
import type { StripWorkout } from '@/lib/todayStrip';
import type { WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

// D15: today's workout for member Home (MX23, TR8). It shows as the Training line of the Your day card (MemberHome.tsx); the wording is
// in lib/todayStrip.ts.

// Today's workout from the programmes on the page, the way the coaching hub finds it (the current programme, its week, today's weekday).
export function stripWorkoutFor(programs: WorkoutProgramRow[], workoutLogs: WorkoutLogRow[], todayIso: string, tz: string): { workout: StripWorkout; dayId: string | null } {
  const program = pickCurrentProgram(programs, todayIso).current;
  if (!program) return { workout: { status: 'none' }, dayId: null };
  if (!program.start_date) return { workout: { status: 'no_start_date', programName: program.name }, dayId: null };
  if (program.start_date > todayIso) return { workout: { status: 'none' }, dayId: null };
  const active = resolveActiveProgram(programs, todayIso);
  if (!active) return { workout: { status: 'ended' }, dayId: null };
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const day = resolveProgramDayByPosition(active.program, active.weekNum, weekday);
  if (!day) return { workout: { status: 'rest_day', weekNum: active.weekNum }, dayId: null };
  const ids = new Set(day.workout_exercises.map((e) => e.id));
  const done = workoutLogs.some((l) => l.exercise_id != null && ids.has(l.exercise_id) && isoDateInTz(new Date(l.logged_at), tz) === todayIso);
  return {
    workout: {
      status: 'workout',
      dayLabel: day.day_label,
      highlights: dayHighlights(day.workout_exercises),
      exerciseCount: day.workout_exercises.filter((e) => e.block_type === 'exercise').length,
      weekNum: active.weekNum,
      done,
    },
    dayId: day.id,
  };
}

'use client';

import { Apple, Dumbbell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { resolveActiveProgram, resolveProgramDayByPosition } from '@/lib/utils/checkin';
import { pickCurrentProgram } from '@/lib/utils/currentProgram';
import { isoDateInTz } from '@/lib/utils/dates';
import { dayHighlights } from '@/lib/workoutSections';
import { foodLeft, foodStripText, workoutStripText, type StripText, type StripWorkout } from '@/lib/todayStrip';
import type { WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';
import { Card } from '@/app/_components/ui';

// D15: today's workout, and calories and protein left today, under the greeting on member Home (MX23, NU22, TR8). Each half opens
// where it is done: the day's workout, or the food diary. The wording is in lib/todayStrip.ts.

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

function Half({ icon: Icon, text, onClick }: { icon: LucideIcon; text: StripText; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 items-start gap-2.5 p-3.5 text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">{text.label}</span>
        <span className={`block truncate text-base font-extrabold leading-tight ${text.over ? 'text-warning' : 'text-black dark:text-zinc-50'}`}>{text.title}</span>
        <span className="block truncate text-xs text-zinc-500">{text.detail}</span>
      </span>
    </button>
  );
}

export function TodayStrip({
  workout,
  food,
  onOpenWorkout,
  onOpenFood,
}: {
  // Null leaves that half out (switched off for the member, or no programme running).
  workout: StripWorkout | null;
  food: Parameters<typeof foodLeft>[0] | null;
  onOpenWorkout: () => void;
  onOpenFood: () => void;
}) {
  const workoutText = workout ? workoutStripText(workout) : null;
  const foodText = food ? foodStripText(foodLeft(food)) : null;
  if (!workoutText && !foodText) return null;
  return (
    <Card flush className={`grid overflow-hidden divide-x divide-black/5 dark:divide-white/10 ${workoutText && foodText ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {workoutText && <Half icon={Dumbbell} text={workoutText} onClick={onOpenWorkout} />}
      {foodText && <Half icon={Apple} text={foodText} onClick={onOpenFood} />}
    </Card>
  );
}

import { exerciseIsVisible, type SectionedExercise, usesSections } from '../workoutSections';

// The list of workout days a member sees for a programme week: weekday badge, title, a couple of lift names, how
// many are logged. Moved from the web WorkoutTab / ProgramDayList so web and mobile agree.

export interface OverviewDay {
  id: string;
  week_num: number;
  day_label: string;
  phase_label: string | null;
  day_position: number | null;
}
export type OverviewExercise = SectionedExercise & { id: string; name: string; block_type: 'exercise' | 'circuit' };

export interface DaySummary {
  id: string;
  weekNum: number;
  dayLabel: string;
  phaseLabel: string | null;
  dayPosition: number | null;
  exerciseCount: number;
  // Lifts the member will actually do (respecting their Strong / Conditioning picks) and how many have a set logged.
  liftCount: number;
  loggedCount: number;
  highlights: string[];
  // Any exercise in the day has a logged set.
  done: boolean;
  // Today's workout in the current week.
  isToday: boolean;
}

export function summariseDays(
  days: OverviewDay[],
  exercisesByDay: Map<string, OverviewExercise[]>,
  loggedExerciseIds: Set<string>,
  chosenBlocksFor: (dayId: string) => string[],
  todayDow: number,
  currentWeek: number,
): DaySummary[] {
  return days.map((day) => {
    const all = exercisesByDay.get(day.id) ?? [];
    const sectioned = usesSections(all);
    const chosen = chosenBlocksFor(day.id);
    const visible = sectioned ? all.filter((ex) => exerciseIsVisible(ex, true, chosen)) : all;
    const lifts = visible.filter((ex) => ex.block_type === 'exercise');
    return {
      id: day.id,
      weekNum: day.week_num,
      dayLabel: day.day_label,
      phaseLabel: day.phase_label,
      dayPosition: day.day_position,
      exerciseCount: all.length,
      liftCount: lifts.length,
      loggedCount: lifts.filter((ex) => loggedExerciseIds.has(ex.id)).length,
      highlights: [...lifts].sort((a, b) => a.sort_order - b.sort_order).slice(0, 2).map((ex) => ex.name),
      done: all.some((ex) => loggedExerciseIds.has(ex.id)),
      isToday: day.day_position != null && day.day_position === todayDow && day.week_num === currentWeek,
    };
  });
}

// Monday-first by the linked weekday (0 = Sunday .. 6 = Saturday); days with no weekday sort last, then by label.
const weekdayRank = (p: number | null | undefined) => (p == null ? 9 : (p + 6) % 7);
export function daysForWeek<T extends { weekNum: number; dayPosition: number | null; dayLabel: string }>(days: T[], week: number): T[] {
  return days
    .filter((d) => d.weekNum === week)
    .sort((a, b) => weekdayRank(a.dayPosition) - weekdayRank(b.dayPosition) || a.dayLabel.localeCompare(b.dayLabel));
}

export const weekNumbers = (days: { weekNum: number }[]) => Array.from(new Set(days.map((d) => d.weekNum))).sort((a, b) => a - b);

// "3 of 5 exercises logged" for the open day, and whether it is all done.
export function dayProgress(lifts: { id: string }[], loggedExerciseIds: Set<string>) {
  const done = lifts.filter((l) => loggedExerciseIds.has(l.id)).length;
  return { done, total: lifts.length, allDone: lifts.length > 0 && done === lifts.length, pct: lifts.length ? Math.round((done / lifts.length) * 100) : 0 };
}

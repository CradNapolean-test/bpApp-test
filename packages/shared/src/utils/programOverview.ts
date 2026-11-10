import { dayHighlights, dayLogProgress, type SectionedExercise } from '../workoutSections';

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
    // The warm-up counts once and only the picked Strong / Conditioning blocks count, as on the open day (TR4, TR5).
    const progress = dayLogProgress(all, chosenBlocksFor(day.id), (id) => loggedExerciseIds.has(id));
    return {
      id: day.id,
      weekNum: day.week_num,
      dayLabel: day.day_label,
      phaseLabel: day.phase_label,
      dayPosition: day.day_position,
      // What the member will do, the same number the open day counts to (it read 17 here and "0 of 5" inside, TR5).
      exerciseCount: progress.total,
      liftCount: progress.total,
      loggedCount: progress.done,
      // The Lift, not the warm-up (TR7).
      highlights: dayHighlights(all),
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

// "3 of 5 exercises logged" for the open day, and whether it is all done: the warm-up is one item, and only the picked Strong /
// Conditioning blocks count (TR4).
export function dayProgress(exercises: OverviewExercise[], chosen: string[], loggedExerciseIds: Set<string>) {
  return dayLogProgress(exercises, chosen, (id) => loggedExerciseIds.has(id));
}

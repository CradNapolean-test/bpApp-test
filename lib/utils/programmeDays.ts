// Copying a workout to the next week of a programme or template (LB3).

interface DayLike {
  id: string;
  week_num: number;
  day_label: string;
  day_position: number | null;
}

// The workout(s) in `week` that a copy of `source` would duplicate: the one on the same weekday, or, when the source has no weekday, one
// with no weekday and the same name. "Copy to next week" used to add a second Monday after "Add week" had already made one.
export function sameWorkoutInWeek<T extends DayLike>(days: T[], source: DayLike, week: number): T[] {
  const name = source.day_label.trim().toLowerCase();
  return days.filter(
    (d) =>
      d.week_num === week &&
      d.id !== source.id &&
      (source.day_position != null ? d.day_position === source.day_position : d.day_position == null && d.day_label.trim().toLowerCase() === name)
  );
}

// "Add week (copy of last)": the new week is the one after the last week, made from that week's workouts. Pass the days as the database
// has them at the moment of the copy, not as the screen last showed them: the button comes back on before the page has reloaded, so a
// second tap used to copy week 1 into week 2 again. That is how "November Weeks 9-11" got every workout twice in weeks 2 and 3 (weeks 2
// and 3 each 12 workouts instead of 6), and every member given it had the same.
export function nextWeekCopy<T extends DayLike>(days: T[]): { from: number; to: number; source: T[] } | null {
  if (days.length === 0) return null;
  const from = Math.max(...days.map((d) => d.week_num));
  return { from, to: from + 1, source: days.filter((d) => d.week_num === from) };
}

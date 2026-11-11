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

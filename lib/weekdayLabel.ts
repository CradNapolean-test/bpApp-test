import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';

// Whether a workout's name is just its weekday ("Monday", "mon", "MON ") for the day it is on (0 = Sunday .. 6 = Saturday). A template's
// workout card then shows the day once, in its name, instead of again in the tile beside it (LB13).
export function labelNamesWeekday(label: string, position: number | null | undefined): boolean {
  if (position == null || position < 0 || position > 6) return false;
  const name = label.trim().toLowerCase();
  return name === WEEKDAY_LABELS[position].toLowerCase() || name === WEEKDAY_SHORT[position].toLowerCase();
}

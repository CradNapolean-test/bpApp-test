// The default check-in reminder choices (DC1). The list is the usual ones, but a coach (or an older version of the app) may have saved a value
// outside it, such as 10: the menu must show what is stored instead of silently showing another number.

export const REMINDER_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7, 14];

// The choices plus the current value if it is not one of them, in order. 0 (off) is not in the list: the menu has its own "Off" entry.
export function reminderDayOptions(current: number): number[] {
  if (current === 0 || !Number.isFinite(current) || current < 0 || REMINDER_DAY_CHOICES.includes(current)) return REMINDER_DAY_CHOICES;
  return [...REMINDER_DAY_CHOICES, current].sort((a, b) => a - b);
}

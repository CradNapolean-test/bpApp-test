import { addDays, toIsoDate } from './utils/dates';

// Saving a day of the Weekly Log (R14, WL2).
//
// Before: any save (a blur, a mood tap, the gym toggle) sent the whole non-food field set from the form. For a day older than the 84
// days the page had loaded the form was empty, so the real stored bodyweight, steps, sleep and notes were replaced with blanks; and
// even for a recent day the form was a stale snapshot, so a change made on another device was undone. Now a save sends ONLY the
// fields the member changed since the day was loaded or last saved, and days past the edit window are read-only.

// The fields the check-in form owns. Food (protein, carbs, fat, fibre, calories) belongs to the food diary, and day_type is not
// edited here, so none of those are ever sent.
export const CHECKIN_FIELDS = [
  'water', 'bodyweight', 'steps', 'sleep', 'gym_session', 'hunger', 'energy', 'motivation', 'stress', 'period_started', 'notes',
] as const;
export type CheckinField = (typeof CHECKIN_FIELDS)[number];
export type DayValues = Record<CheckinField, number | string | boolean | null>;

// What changed between two copies of a day: only the check-in fields whose value differs. An empty note is the same as no note.
export function changedFields(baseline: Partial<DayValues>, current: Partial<DayValues>): Partial<DayValues> {
  const patch: Partial<DayValues> = {};
  for (const field of CHECKIN_FIELDS) {
    const before = baseline[field] ?? null;
    const after = current[field] ?? null;
    const same = field === 'notes' ? (before || null) === (after || null) : before === after;
    if (!same) patch[field] = field === 'notes' ? (after || null) : after;
  }
  return patch;
}

// ---- how far back a member can look and change ----
// D20 (recommended default): members can edit the last 14 days and browse the last 30. Coaches see everything and change nothing here.
export const EDIT_DAYS = 14;
export const BROWSE_DAYS = 30;

const dayOffset = (date: string, todayIso: string) =>
  Math.round((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);

// Whether a member may change this day: it is not in the future and not older than the edit window.
export function canEditDay(date: string, todayIso: string): boolean {
  const age = dayOffset(date, todayIso);
  return age >= 0 && age <= EDIT_DAYS;
}

// Food (not the check-in) can also be planned or logged for tomorrow: a member weighing up tomorrow's meals, or prepping them tonight. It is the
// only day ahead; the check-in, photos and everything else still stop at today. Tomorrow's food stays out of the weekly averages until it is today.
export const FOOD_AHEAD_DAYS = 1;
export function canEditFoodDay(date: string, todayIso: string): boolean {
  const age = dayOffset(date, todayIso);
  return age >= -FOOD_AHEAD_DAYS && age <= EDIT_DAYS;
}

// Whether a member can open the week starting on this Monday: its last day is still inside the browse window.
export function canBrowseWeek(weekStart: string, todayIso: string): boolean {
  const lastDay = toIsoDate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));
  return dayOffset(lastDay, todayIso) <= BROWSE_DAYS;
}

export const LOCKED_DAY_MESSAGE = 'This day is more than 2 weeks old, so it can no longer be changed here. Ask your coach to change this.';

// Whether a member may LOOK at this date (food diary, photos): not in the future, and within the browse window.
export function canBrowseDate(date: string, todayIso: string): boolean {
  const age = dayOffset(date, todayIso);
  return age >= 0 && age <= BROWSE_DAYS;
}

import { CALORIE_FLOOR } from '@/lib/calculations';
import type { TrafficLight } from '@/lib/utils/accountability';

// The coach Overview's food numbers for this week: which days its calorie and protein averages come from, and how they are coloured
// against the member's target. Every target number comes from calculations.ts (via averageDayTarget); this only picks the days and
// the colour.

// A day logged with less than this share of the day's calorie target is part-logged (a shake and nothing else), not a day of eating.
// Graham's "Calories (avg) 986, target 2,450" averaged a 139 kcal shake-only day and the half day so far with his one full day of
// 2,047 (NU25).
export const PART_DAY_SHARE = 0.5;
// The same line for a member with no target yet: half the calorie floor.
export const PART_DAY_KCAL_NO_TARGET = CALORIE_FLOOR / 2;

export interface FoodDaySplit<T> {
  // Days before today with a day's worth of food on them: what the averages use.
  full: T[];
  // Days before today with food on them, but under the part-day line. Left out and counted, so the coach knows.
  part: T[];
  // Days of the week before today (today is still going, so it is never one of the averaged days).
  completedDays: number;
}

// `days` are the week's days with food logged on them (hasFoodLogged), `weekStart` its Monday.
export function splitFoodDays<T extends { log_date: string }>(
  days: T[],
  todayIso: string,
  weekStart: string,
  targetCalories: number | null,
  caloriesOf: (d: T) => number
): FoodDaySplit<T> {
  const line = targetCalories != null && targetCalories > 0 ? targetCalories * PART_DAY_SHARE : PART_DAY_KCAL_NO_TARGET;
  const past = days.filter((d) => d.log_date < todayIso);
  const completedDays = Math.max(0, Math.min(7, Math.round((Date.parse(todayIso + 'T00:00:00Z') - Date.parse(weekStart + 'T00:00:00Z')) / 86400000)));
  return {
    full: past.filter((d) => caloriesOf(d) >= line),
    part: past.filter((d) => caloriesOf(d) < line),
    completedDays,
  };
}

// Colour bands against the target. Calories: within 10% either side is green, within 20% amber, further off red (eating well under
// the target is worth a word too). Protein: 90% of the target or more is green, 75% amber, under that red; more than the target is
// fine. Kept as data so a change is a one-line edit.
export const CALORIE_BANDS = { green: 0.1, amber: 0.2 };
export const PROTEIN_BANDS = { green: 0.9, amber: 0.75 };

export function calorieTone(avg: number, target: number): TrafficLight | null {
  if (!(target > 0)) return null;
  const off = Math.abs(avg - target) / target;
  return off <= CALORIE_BANDS.green ? 'green' : off <= CALORIE_BANDS.amber ? 'amber' : 'red';
}

export function proteinTone(avg: number, target: number): TrafficLight | null {
  if (!(target > 0)) return null;
  const share = avg / target;
  return share >= PROTEIN_BANDS.green ? 'green' : share >= PROTEIN_BANDS.amber ? 'amber' : 'red';
}

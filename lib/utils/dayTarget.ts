import type { DayTarget, WeeklyTarget } from '@/lib/calculations';
import type { DailyLogRow } from '@/lib/data/types';

// Which daily target applies to a day. Only a selection: every number comes from calculations.ts (validated against the real
// spreadsheet). The phone has the same rule in packages/shared/src/utils/dayTarget.ts.
//
// Calorie cycling (Nov 2026 decision): every day is a low day unless the member marked it a high day in their food diary, up to
// HIGH_DAYS_PER_WEEK a week (Monday to Sunday). Before, an unmarked day had no target at all and nothing ever marked a day, so a
// cycling member saw no targets anywhere. A member who is not cycling gets the flat target whatever the day says.
export const HIGH_DAYS_PER_WEEK = 2;

export type DayType = DailyLogRow['day_type'];

export function isCyclingTarget(weekTarget: WeeklyTarget | null | undefined): boolean {
  return !!weekTarget?.dailyLow && !!weekTarget?.dailyHigh;
}

export function dayTargetFor(weekTarget: WeeklyTarget | null | undefined, dayType: DayType | null | undefined): DayTarget | null {
  if (!weekTarget) return null;
  if (!isCyclingTarget(weekTarget)) return weekTarget.dailyFlat ?? null;
  return dayType === 'high' ? weekTarget.dailyHigh! : weekTarget.dailyLow!;
}

// The planned average day (the week's total over 7): what a week's average intake is read against. For a member who is not
// cycling this is just the flat target.
export function averageDayTarget(weekTarget: WeeklyTarget | null | undefined): DayTarget | null {
  if (!weekTarget) return null;
  if (!isCyclingTarget(weekTarget)) return weekTarget.dailyFlat ?? null;
  return {
    calories: weekTarget.calories / 7,
    protein: weekTarget.protein / 7,
    carbs: weekTarget.carbs / 7,
    fat: weekTarget.fat / 7,
    floorApplied: weekTarget.floorApplied,
  };
}

// How many high days a member has left in a week, from that week's day types (the day being changed left out by the caller).
export function highDaysLeft(dayTypes: (DayType | null | undefined)[]): number {
  return Math.max(0, HIGH_DAYS_PER_WEEK - dayTypes.filter((t) => t === 'high').length);
}

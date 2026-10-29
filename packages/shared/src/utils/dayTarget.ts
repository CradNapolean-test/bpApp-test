import type { DayTarget, WeeklyTarget } from '../calculations';
import type { DailyLogRow } from '../data/types';

// Picks which already-computed daily target applies to a day. This is only a selection, no new maths: the numbers
// all come from calculations.ts (validated against the real spreadsheet). Same rule as the web Weekly Log tab:
// a low/high day uses that target (falling back to the flat one), anything else uses the flat target.
// For a calorie-cycling member on a "flat" day there is no flat target, so this returns null (as the web does).
export function dayTargetFor(weekTarget: WeeklyTarget | null, dayType: DailyLogRow['day_type'] | null | undefined): DayTarget | null {
  if (!weekTarget) return null;
  if (dayType === 'low') return weekTarget.dailyLow ?? weekTarget.dailyFlat ?? null;
  if (dayType === 'high') return weekTarget.dailyHigh ?? weekTarget.dailyFlat ?? null;
  return weekTarget.dailyFlat ?? null;
}

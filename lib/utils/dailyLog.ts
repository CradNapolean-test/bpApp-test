import { dayCalories } from '@/lib/calculations';
import type { DailyLogRow } from '@/lib/data/types';

// The Food Tracking tab auto-creates a blank row for "today" (lib/data/dailyLogs.ts
// getOrCreateDailyLog) so it has somewhere to attach diary entries even before the client
// has saved anything in Weekly Log. Overview/Insights need to tell that blank row apart
// from an actual logged day.
export function hasLoggedData(log: DailyLogRow): boolean {
  return (
    log.calories != null ||
    log.protein != null ||
    log.carbs != null ||
    log.fat != null ||
    log.fibre != null ||
    log.water != null ||
    log.bodyweight != null ||
    log.steps != null ||
    log.sleep != null ||
    log.gym_session ||
    log.hunger != null ||
    log.energy != null ||
    log.motivation != null ||
    log.stress != null ||
    log.period_started ||
    Boolean(log.notes)
  );
}

// ---- calories for a day ----
// Calories are no longer always worked out from protein, carbs and fat: a Quick Add of "300 kcal, no macros" has calories and no
// macros. daily_logs.calories holds the day's total including those (written by the food sync); older rows have null there and
// behave exactly as before. Use this wherever a day's calories are shown or averaged, never dayCalories() on the macros directly.
export function dayCaloriesOf(log: Pick<DailyLogRow, 'calories' | 'protein' | 'carbs' | 'fat'>): number {
  return log.calories ?? dayCalories(log.protein ?? 0, log.carbs ?? 0, log.fat ?? 0);
}

// Whether the day has any food on it. A day whose last food was deleted has nulls, not zeros, and is not a food day (M2).
export function hasFoodLogged(log: Pick<DailyLogRow, 'calories' | 'protein' | 'carbs' | 'fat'>): boolean {
  return log.calories != null || log.protein != null || log.carbs != null || log.fat != null;
}

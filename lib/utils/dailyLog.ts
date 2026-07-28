import type { DailyLogRow } from '@/lib/data/types';

// The Food Tracking tab auto-creates a blank row for "today" (lib/data/dailyLogs.ts
// getOrCreateDailyLog) so it has somewhere to attach diary entries even before the client
// has saved anything in Weekly Log. Overview/Insights need to tell that blank row apart
// from an actual logged day.
export function hasLoggedData(log: DailyLogRow): boolean {
  return (
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

import { addDays, isoDateInTz, isoWeekKey, toIsoDate } from '@/lib/utils/dates';

// Monday of the last week that has finished at a gym, by the GYM's calendar. The week rolls over on Monday morning at the gym, which
// is a different moment from Monday morning in London when the gym is, say, in Auckland (CM6/R36).
export function lastCompletedWeekIn(timezone: string, now: Date = new Date()): string {
  const today = isoDateInTz(now, timezone);
  return toIsoDate(addDays(new Date(`${isoWeekKey(today)}T00:00:00Z`), -7));
}

// Today's date at a gym, for "is this hold running today" and the like.
export function gymToday(timezone: string, now: Date = new Date()): string {
  return isoDateInTz(now, timezone);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

// Monday of the week containing `d` (UTC-based, avoids server-timezone drift).
export function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function weekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(weekStart, i)));
}

// ISO week key (Monday-start) for grouping daily logs into weeks in Overview.
export function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const start = startOfWeek(d);
  return toIsoDate(start);
}

// Next occurrence (today counts) of a class's day_of_week (0=Sunday..6=Saturday, matching
// classes.day_of_week / Postgres's own convention), so booking a recurring class doesn't
// require the client to pick a date by hand.
export function nextDateForWeekday(dayOfWeek: number, from: Date = new Date()): string {
  const diff = (dayOfWeek - from.getUTCDay() + 7) % 7;
  return toIsoDate(addDays(from, diff));
}

// Whole-day difference between two ISO dates (b - a), UTC-anchored like every other helper
// here so it isn't thrown off by server-timezone drift.
export function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round(
    (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / msPerDay
  );
}

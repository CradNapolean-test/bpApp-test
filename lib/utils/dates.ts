export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A curated subset of IANA zones (not all ~400) covering the regions this app's clients are
// actually likely to be in, matching the style of other bounded selects (e.g. diet_approach)
// rather than a raw Intl.supportedValuesOf('timeZone') dump.
export const COMMON_TIMEZONES = [
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Perth',
  'Asia/Singapore',
  'Europe/London',
  'America/Los_Angeles',
  'America/New_York',
  'UTC',
] as const;

export const DEFAULT_TIMEZONE = 'Pacific/Auckland';

// A given instant's calendar date in `tz`, not the server's (UTC) one -- the fix for a client
// near a UTC day boundary having "today" (or a stored timestamp's day) resolve to the wrong
// day for them (see lib/data/dashboardBundle.ts, lib/data/coach.ts, lib/utils/checkin.ts).
// en-CA formats as YYYY-MM-DD directly, no string surgery needed.
export function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function todayIsoInTz(tz: string): string {
  return isoDateInTz(new Date(), tz);
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

// "HH:MM:SS" (24h, from Postgres time columns) -> "6:00pm" (12h, no leading zero).
export function formatClassTime(startTime: string | null | undefined): string {
  if (!startTime) return '';
  const [hStr, mStr] = startTime.split(':');
  const hour24 = Number(hStr);
  const period = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${mStr}${period}`;
}

// Short relative time ("9m", "41m", "1h", "2d") for compact activity-feed style rows.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

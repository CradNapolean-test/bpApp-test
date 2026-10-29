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

export const DEFAULT_TIMEZONE = 'Europe/London';

// 0=Sunday..6=Saturday, matching classes.day_of_week / Postgres's own convention.
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Values a programme day's weekday picker offers -- Monday(1) through Saturday(6); Sunday(0)
// is deliberately excluded since a programme only runs Monday-Saturday.
export const PROGRAM_WEEKDAYS = [1, 2, 3, 4, 5, 6];

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

// ---- Showing dates and times to people (en-GB everywhere) ----
// The app is for a UK gym. Some screens wrote dates the American way ("Thursday, Oct 15"), the New Zealand way, or in whatever language the
// phone was set to. These are the one set of formatters to use; they always write en-GB, take a timezone for server or gym-time output, and
// accept either a Date, a full timestamp, or a plain 'YYYY-MM-DD' (read as that calendar day, in UTC, so it never shifts a day).

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
}

// A plain calendar day must be shown in UTC (it has no time of day); anything else uses the timezone asked for, else the device's own.
function zoneFor(value: Date | string, timeZone?: string): string | undefined {
  return typeof value === 'string' && DATE_ONLY.test(value) ? 'UTC' : timeZone;
}

// "Thursday 15 Oct"  (weekday: 'short' gives "Thu 15 Oct", false gives "15 Oct")
export function formatLongDate(value: Date | string, options: { timeZone?: string; weekday?: 'long' | 'short' | false } = {}): string {
  const weekday = options.weekday === undefined ? 'long' : options.weekday;
  const text = toDate(value).toLocaleDateString('en-GB', {
    ...(weekday ? { weekday } : {}),
    day: 'numeric',
    month: 'short',
    timeZone: zoneFor(value, options.timeZone),
  });
  // en-GB puts a comma after the weekday in some versions of the browser's language data and not in others: never.
  return text.replace(/^(\w+),\s/, '$1 ');
}

// "15 Oct"
export function formatShortDate(value: Date | string, timeZone?: string): string {
  return formatLongDate(value, { timeZone, weekday: false });
}

// "Thu", "Mon"
export function formatWeekdayShort(value: Date | string, timeZone?: string): string {
  return toDate(value).toLocaleDateString('en-GB', { weekday: 'short', timeZone: zoneFor(value, timeZone) });
}

// "6:00pm", "12:30am": the same 12-hour style as formatClassTime, for a moment in time.
export function formatTime(value: Date | string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zoneFor(value, timeZone) }).formatToParts(toDate(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}${get('dayPeriod').toLowerCase().replace(/\./g, '')}`;
}

// "Fri 16 Oct, 6:00pm"
export function formatDateTime(value: Date | string, timeZone?: string): string {
  return `${formatLongDate(value, { timeZone, weekday: 'short' })}, ${formatTime(value, timeZone)}`;
}

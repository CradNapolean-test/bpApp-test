// Pure helpers behind the owner's Overview and Reports (R30). Kept apart from the screens so the like-for-like comparisons, the
// guards for empty data and the loader's retry behaviour can be tested without a browser.

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---- Loading without lying -----------------------------------------------------------------------------------------------------

// What a loader hands the screen. A failure carries a sentence the owner can read; the technical reason is logged elsewhere, never shown.
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export const LOAD_FAILED = 'We could not load this. Try again.';

// Runs a loader and turns anything it throws (a dropped connection, a timeout) into a failed result, so a screen can always leave its
// "Loading…" state. Call it again to retry: nothing is remembered between calls.
export async function settle<T>(load: () => Promise<Loaded<T>>, onError?: (error: unknown) => void): Promise<Loaded<T>> {
  try {
    return await load();
  } catch (error) {
    onError?.(error);
    return { ok: false, error: LOAD_FAILED };
  }
}

// ---- Equal day ranges ----------------------------------------------------------------------------------------------------------

export interface DayCheckIns {
  date: string;
  checkIns: number;
}

// 1 (Monday) to 7 (Sunday) for a 'YYYY-MM-DD' date.
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// "Mon", "Mon to Wed": the days of the current week that have happened.
export function weekSoFarLabel(daysSoFar: number): string {
  const n = Math.min(7, Math.max(1, Math.round(daysSoFar)));
  return n === 1 ? WEEKDAY_SHORT[0] : `${WEEKDAY_SHORT[0]} to ${WEEKDAY_SHORT[n - 1]}`;
}

export interface WeekSoFar {
  days: number;
  label: string;
  // Share of member-days with a check-in, this week so far and on the same days last week (null when last week is out of range).
  thisRate: number;
  lastRate: number | null;
}

// Compares the part-finished week with the same weekdays of last week. `perDay` is the report's last 28 days, oldest first, ending today.
// The measure is check-ins per member per day, because "members who checked in at least once this week" cannot be cut to the same days.
export function weekSoFar(perDay: DayCheckIns[], members: number): WeekSoFar | null {
  if (members <= 0 || perDay.length === 0) return null;
  const days = isoWeekday(perDay[perDay.length - 1].date);
  if (perDay.length < days) return null;
  const sum = (rows: DayCheckIns[]) => rows.reduce((n, d) => n + d.checkIns, 0);
  const rate = (rows: DayCheckIns[]) => Math.round((100 * sum(rows)) / (members * days));
  const thisWeek = perDay.slice(perDay.length - days);
  const lastWeekEnd = perDay.length - 7;
  const lastWeek = lastWeekEnd - days >= 0 ? perDay.slice(lastWeekEnd - days, lastWeekEnd) : null;
  return { days, label: weekSoFarLabel(days), thisRate: rate(thisWeek), lastRate: lastWeek ? rate(lastWeek) : null };
}

const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

// "1st to 14th": the days of the month that have happened.
export function monthSoFarLabel(dayOfMonth: number): string {
  return dayOfMonth <= 1 ? '1st' : `1st to ${ordinal(dayOfMonth)}`;
}

// "+12% on the same days last month (1st to 14th)", or null when there is nothing fair to compare with. `before` must be last month's
// figure up to the same day of the month; without it (the database has not been updated) there is no comparison rather than a wrong one.
export function monthToDateChange(now: number, before: number | null | undefined, dayOfMonth: number | null | undefined): string | null {
  if (before == null || dayOfMonth == null || before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% on the same days last month (${monthSoFarLabel(dayOfMonth)})`;
}

// ---- Guards for empty data -----------------------------------------------------------------------------------------------------

export interface WeekdayAverage {
  dow: number;
  avgPct: number;
}

// The best and the quietest weekday, or null when there is nothing to rank (an empty report must not crash the screen).
export function weekdayExtremes(byWeekday: WeekdayAverage[]): { best: WeekdayAverage; worst: WeekdayAverage } | null {
  if (byWeekday.length === 0) return null;
  const sorted = [...byWeekday].sort((a, b) => b.avgPct - a.avgPct);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export const weekdayName = (dow: number): string => WEEKDAY_SHORT[dow - 1] ?? '';

// The bar charts scale to their largest bar; with no bars (or all zero) they still need a divisor.
export const maxOf = (values: number[]): number => Math.max(1, ...values);

// The last and the one before it, each null when missing.
export function lastTwo<T>(rows: T[]): { current: T | null; previous: T | null } {
  return { current: rows.length > 0 ? rows[rows.length - 1] : null, previous: rows.length > 1 ? rows[rows.length - 2] : null };
}

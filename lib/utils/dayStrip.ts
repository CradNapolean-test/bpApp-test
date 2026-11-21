import { addDays, startOfWeek, toIsoDate, WEEKDAY_SHORT } from './dates';

// The day strip on the food diary and the daily check-in (item 8, signed off 21 Nov 2026): which days it shows, how much of each
// day's ring is filled, the small month name over the 1st, and what a screen reader hears for each day. Only dates and numbers here.
// The web has this file as lib/utils/dayStrip.ts and the phone as packages/shared/src/utils/dayStrip.ts: keep the two identical.
//
// Every date is a local day key ("2026-11-19", the member's own Europe/London day), never a slice of a UTC timestamp.

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A strip never needs more than a few years of days; the cap only stops a bad date from looping for ever.
const MAX_DAYS = 3700;

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shift = (iso: string, n: number) => toIsoDate(addDays(parse(iso), n));
const kcal = (n: number) => Math.round(n).toLocaleString('en-GB');

// Every day from `from` to `to`, both included, oldest first.
export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = shift(d, 1)) out.push(d);
  return out;
}

// The Monday of the week a day is in (weeks run Monday to Sunday, as the check-in's weeks do).
export function weekStartOfDay(iso: string): string {
  return toIsoDate(startOfWeek(parse(iso)));
}

// The food diary's strip for a member: `browseDays` back (the 30 days canBrowseDate allows) to `aheadDays` ahead (tomorrow, the one
// day the diary lets a member plan).
export function foodStripDays(todayIso: string, browseDays: number, aheadDays: number): string[] {
  return daysInRange(shift(todayIso, -browseDays), shift(todayIso, aheadDays));
}

// The daily check-in's strip for a member: whole weeks, from the Monday of the week `browseDays` ago (the oldest week canBrowseWeek
// opens) to the Sunday of this week. The days still to come this week are shown, as the day chips showed them.
export function checkinStripDays(todayIso: string, browseDays: number): string[] {
  return daysInRange(weekStartOfDay(shift(todayIso, -browseDays)), shift(weekStartOfDay(todayIso), 6));
}

// ---- a coach's strips (no 30-day limit) ----
// The page carries the member's last 84 days, from `pageFrom`; days older than those are read in one range query, `extra` days at a
// time (the web's app/dashboard/_components/useDayMarks.ts).

const dayGap = (later: string, earlier: string) => Math.round((parse(later).getTime() - parse(earlier).getTime()) / 86_400_000);

// The days read on top of the page's: `extra` days, up to the day before the page's first, so none is missed and none read twice.
export function olderSpan(pageFrom: string, extra: number): { from: string; to: string } {
  return { from: shift(pageFrom, -extra), to: shift(pageFrom, -1) };
}

// How far before the page's days a coach's strip reaches from the start: to the Monday of a week opened straight from the coach's
// dashboard when that week is older than the page's days, and exactly there, so the strip does not grow at the front (pushing the
// week opened out of view) once its rows arrive. Otherwise none.
export function reachBackDays(pageFrom: string, openedWeek: string | null | undefined): number {
  if (!openedWeek) return 0;
  const monday = weekStartOfDay(openedWeek);
  return monday < pageFrom ? dayGap(pageFrom, monday) : 0;
}

// The first day of a coach's check-in strip, which shows whole weeks: the first Monday on or after `firstDay` (the oldest day whose
// rings are in), or the Monday of the week opened when that is older still, so the week opened is always on the strip.
export function coachWeekStripStart(firstDay: string, openedWeek: string | null | undefined): string {
  const monday = weekStartOfDay(firstDay);
  const start = monday < firstDay ? shift(monday, 7) : firstDay;
  const opened = openedWeek ? weekStartOfDay(openedWeek) : null;
  return opened && opened < start ? opened : start;
}

// ---- the rings ----

export type RingState = 'plain' | 'part' | 'done';

export function ringState(fraction: number): RingState {
  return fraction >= 1 ? 'done' : fraction > 0 ? 'part' : 'plain';
}

// What a day of food needs: its calories (dayCaloriesOf) and whether any food is on it at all (hasFoodLogged).
export interface FoodDay {
  calories: number;
  hasFood: boolean;
}

// The food diary's ring (owner, 21 Nov): calories logged that day against that day's calorie target, like a small copy of the
// diary's calorie ring. Full at or over the target, never more. A member with no target yet gets a full ring once any food is in.
// Tomorrow (or any day after today) is always plain: planned food has not been eaten yet.
export function foodRing(date: string, todayIso: string, day: FoodDay | null | undefined, target: number | null | undefined): number {
  if (date > todayIso || !day?.hasFood) return 0;
  if (target == null || !(target > 0)) return 1;
  return Math.min(1, Math.max(0, day.calories / target));
}

export type Tracker = 'sleep' | 'steps' | 'water';
export type CheckinDay = Partial<Record<Tracker | 'bodyweight', number | null>>;

// How many of the trackers switched on for this member are in that day (the "x of 3" on Home's check-in line).
export function trackersIn(log: CheckinDay | null | undefined, trackers: readonly Tracker[]): number {
  return trackers.filter((k) => log?.[k] != null).length;
}

// The daily check-in's ring: of sleep, steps and water, the ones switched on for this member that are in that day, out of those
// switched on (1 of 3 is a third, 1 of 2 is half). With all three switched off, full once that day's weight is in. The same "done"
// rule as Home's check-in line (checkinToday). A day still to come is plain.
export function checkinRing(date: string, todayIso: string, log: CheckinDay | null | undefined, trackers: readonly Tracker[]): number {
  if (date > todayIso) return 0;
  if (trackers.length === 0) return log?.bodyweight != null ? 1 : 0;
  return trackersIn(log, trackers) / trackers.length;
}

// ---- words ----

// "Thu 19 Nov".
export function stripDayName(iso: string): string {
  const d = parse(iso);
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

// The small month name over the 1st of each month ("Nov"), nothing on any other day.
export function monthOver(iso: string): string | null {
  const d = parse(iso);
  return d.getUTCDate() === 1 ? MONTH_SHORT[d.getUTCMonth()] : null;
}

function dayWords(iso: string, todayIso: string): string {
  const when = iso === todayIso ? 'today' : iso === shift(todayIso, 1) ? 'tomorrow' : null;
  return when ? `${stripDayName(iso)}, ${when}` : stripDayName(iso);
}

// What a coach sees under each date: the day's calories, or "no food" (shown in red).
export function coachCalories(day: FoodDay | null | undefined): { text: string; noFood: boolean } {
  return day?.hasFood ? { text: kcal(day.calories), noFood: false } : { text: 'no food', noFood: true };
}

// A food day's button, said to a screen reader: "Tue 17 Nov, 1,980 of 2,050 kcal".
export function foodDayLabel(date: string, todayIso: string, day: FoodDay | null | undefined, target: number | null | undefined): string {
  const name = dayWords(date, todayIso);
  if (!day?.hasFood) return date > todayIso ? name : `${name}, nothing logged`;
  const eaten = date > todayIso ? 'planned' : 'kcal';
  return target != null && target > 0 ? `${name}, ${kcal(day.calories)} of ${kcal(target)} ${eaten}` : `${name}, ${kcal(day.calories)} ${eaten}`;
}

// A check-in day's button: "Thu 19 Nov, 2 of 3 checked in". A coach also hears the day's food ("..., 1,980 kcal" or "..., no food").
export function checkinDayLabel(
  date: string,
  todayIso: string,
  log: CheckinDay | null | undefined,
  trackers: readonly Tracker[],
  food?: FoodDay | null
): string {
  const name = dayWords(date, todayIso);
  const parts = [name];
  if (date <= todayIso) {
    if (trackers.length === 0) parts.push(log?.bodyweight != null ? 'weighed in' : 'not weighed in');
    else parts.push(`${trackersIn(log, trackers)} of ${trackers.length} checked in`);
  }
  if (food !== undefined && date <= todayIso) parts.push(food?.hasFood ? `${kcal(food.calories)} kcal` : 'no food');
  return parts.join(', ');
}

// "this week", "last week", or "the week of 2 Nov", for the week `weekStart` (a Monday) begins.
export function weekPhrase(weekStart: string, todayIso: string): string {
  const thisWeek = weekStartOfDay(todayIso);
  if (weekStart === thisWeek) return 'this week';
  if (weekStart === shift(thisWeek, -7)) return 'last week';
  const d = parse(weekStart);
  return `the week of ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

// The line under the food strip, for the week of the day picked: "Food logged on 3 days this week. A full ring means the day reached
// its calories." Days after today are left out (planned food is not counted, as in the week's averages).
export function foodStripCaption(pickedDate: string, todayIso: string, foodDays: ReadonlyMap<string, FoodDay>, hasTarget: boolean): string {
  const monday = weekStartOfDay(pickedDate);
  const logged = daysInRange(monday, shift(monday, 6)).filter((d) => d <= todayIso && foodDays.get(d)?.hasFood).length;
  const key = hasTarget ? 'A full ring means the day reached its calories.' : 'A ring means food was logged that day.';
  return `Food logged on ${days(logged)} ${weekPhrase(monday, todayIso)}. ${key}`;
}

// The line under the check-in strip, for the week of the day picked: "1 of 4 days fully checked in this week. A part ring shows how
// much of a day is in." Only the days so far count.
export function checkinStripCaption(
  pickedDate: string,
  todayIso: string,
  logs: ReadonlyMap<string, CheckinDay>,
  trackers: readonly Tracker[]
): string {
  const monday = weekStartOfDay(pickedDate);
  const soFar = daysInRange(monday, shift(monday, 6)).filter((d) => d <= todayIso);
  const done = soFar.filter((d) => checkinRing(d, todayIso, logs.get(d), trackers) >= 1).length;
  const phrase = weekPhrase(monday, todayIso);
  if (trackers.length === 0) return `${done} of ${days(soFar.length)} weighed in ${phrase}. A full ring means the day's weight is in.`;
  return `${done} of ${days(soFar.length)} fully checked in ${phrase}. A part ring shows how much of a day is in.`;
}

// The coach's Timetable as a week calendar (app/coach/classes/_components/TimetableView.tsx): which hours are drawn, which time a tap on
// the grid lands on, where a new session starts, and which day the phone's one-day view shows (CS7, CS11).

// Dates are plain 'YYYY-MM-DD' strings, worked in UTC so a day never shifts with the device's own time zone.
export const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const mondayOf = (iso: string) => isoAdd(iso, -((dowOf(iso) + 6) % 7));

// Monday first, Sunday last.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// A session has no stored length, so the calendar draws each as a 45-minute block.
export const DURATION = 45;
export const HOUR_H = 56;
// Hours with nothing scheduled are folded into a thin band this tall, so the day is not mostly empty space.
export const GAP_H = 20;
// A tap lands on the quarter hour it is in.
const STEP = 15;

export type HourRow = { hour: number | null; top: number; height: number };

export const toMin = (t: string | null | undefined) => {
  const [h, m] = (t ?? '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// The hours worth drawing: those with a session in them and one either side, with the rest folded into thin bands (hour null).
// With nothing scheduled, 5am to 8pm.
export function hourRows(startTimes: (string | null | undefined)[]): { rows: HourRow[]; total: number } {
  const visible = new Set<number>();
  for (const t of startTimes) {
    if (!t) continue;
    const m = toMin(t);
    for (let h = Math.floor(m / 60) - 1; h <= Math.floor((m + DURATION - 1) / 60) + 1; h++) if (h >= 0 && h < 24) visible.add(h);
  }
  if (visible.size === 0) for (let h = 5; h <= 20; h++) visible.add(h);
  const rows: HourRow[] = [];
  let top = 0;
  let prev: number | null = null;
  for (const h of [...visible].sort((x, y) => x - y)) {
    if (prev !== null && h - prev > 1) {
      rows.push({ hour: null, top, height: GAP_H });
      top += GAP_H;
    }
    rows.push({ hour: h, top, height: HOUR_H });
    top += HOUR_H;
    prev = h;
  }
  return { rows, total: top };
}

// Where a time sits on the grid, in pixels from the top.
export function yOfMinute(rows: HourRow[], min: number): number {
  const r = rows.find((x) => x.hour === Math.floor(min / 60)) ?? rows[0];
  if (!r) return 0;
  return r.top + ((min - (r.hour ?? 0) * 60) * HOUR_H) / 60;
}

// The time a tap at `y` pixels down a day column lands on ('HH:MM', on the quarter hour), or null for a folded band or outside the grid.
export function timeAtY(rows: HourRow[], y: number): string | null {
  const r = rows.find((x) => y >= x.top && y < x.top + x.height);
  if (!r || r.hour === null) return null;
  const into = Math.min(59, Math.max(0, ((y - r.top) / HOUR_H) * 60));
  return hhmm(r.hour * 60 + Math.floor(into / STEP) * STEP);
}

// The date a one-off session made for weekday `day` starts on: that day in the week shown, or, when that has already gone, the next
// such weekday from today (a one-off can't be in the past).
function onOrAfterToday(date: string, todayIso: string): string {
  if (date >= todayIso) return date;
  return isoAdd(todayIso, (dowOf(date) - dowOf(todayIso) + 7) % 7);
}

export type NewSessionStart = { dayOfWeek: number; date: string; startTime: string };

// Where a new session's form starts (CS7).
//  - From a tap on the grid: the day and time tapped.
//  - From "Add session": the week being shown, on today when that week is this one, on its Monday when it is a later week, and on
//    today when it is an earlier one (nothing new can start in a week that has gone). 06:00, as before.
// `date` is what the One-off switch uses; a repeating session only takes the weekday.
export function newSessionStart(weekStart: string, todayIso: string, tapped?: { day: number; time: string }): NewSessionStart {
  if (tapped) {
    const date = isoAdd(weekStart, (tapped.day + 6) % 7);
    return { dayOfWeek: tapped.day, date: onOrAfterToday(date, todayIso), startTime: tapped.time };
  }
  const date = weekStart > todayIso ? weekStart : todayIso;
  return { dayOfWeek: dowOf(date), date, startTime: '06:00' };
}

// The day the phone's one-day view shows (CS11). The day the coach picked, while it is one of the days drawn; otherwise today when
// the week shown is this week and today is drawn; otherwise the first day drawn (Monday).
export function phoneDayFor(weekStart: string, todayIso: string, chosen: number | null, days: number[]): number {
  if (chosen !== null && days.includes(chosen)) return chosen;
  const today = dowOf(todayIso);
  if (todayIso >= weekStart && todayIso <= isoAdd(weekStart, 6) && days.includes(today)) return today;
  return days[0] ?? 1;
}

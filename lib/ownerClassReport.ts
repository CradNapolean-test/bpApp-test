// The owner's class reports (RO10): class fill against capacity, attendance by week and waitlist demand, from owner_class_report
// (migration 0176). Places offered and sessions that ran are counted exactly as the coach's Busiest report counts them (lib/slotPopularity),
// so the owner and the coaches see the same fill for the same slot. Pure, so the maths can be tested.

import { fillPercent, slotPopularity, type PopularityBooking, type PopularityClass } from '@/lib/slotPopularity';
import { addDays, formatClassTime, toIsoDate, WEEKDAY_SHORT } from '@/lib/utils/dates';

export interface ReportClass {
  id: string;
  gymId: string;
  gymName: string;
  name: string;
  dayOfWeek: number | null;
  startTime: string | null;
  specificDate: string | null;
  capacity: number;
  retiredAt: string | null;
}

// One class on one date: places taken (still booked), how many came, no-shows, members still on the waitlist, members who came off it.
export interface ReportSession {
  classId: string;
  date: string;
  booked: number;
  attended: number;
  noShow: number;
  waiting: number;
  promoted: number;
}

export interface ClassReportRaw {
  today: string;
  from: string;
  weeks: number;
  classes: ReportClass[];
  sessions: ReportSession[];
  // "classId|YYYY-MM-DD" for dates a coach cancelled.
  cancelled: string[];
  weekMembers: { weekStart: string; members: number }[];
}

const shiftDay = (iso: string, days: number) => toIsoDate(addDays(new Date(`${iso}T00:00:00Z`), days));
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);

// "Mon 6:00am · Strength", "Sat 14/11 9:00am · Open gym" for a one-off date; with the gym's name in front when the report covers more
// than one gym.
export function slotLabel(c: ReportClass, withGym = false): string {
  const when =
    c.dayOfWeek != null && c.startTime
      ? `${c.specificDate ? `${WEEKDAY_SHORT[c.dayOfWeek]} ${c.specificDate.slice(8)}/${c.specificDate.slice(5, 7)}` : WEEKDAY_SHORT[c.dayOfWeek]} ${formatClassTime(c.startTime)} · `
      : '';
  return `${withGym ? `${c.gymName} · ` : ''}${when}${c.name}`;
}

const manyGyms = (raw: ClassReportRaw) => new Set(raw.classes.map((c) => c.gymId)).size > 1;

// The per-session counts as one booking each, the shape slotPopularity reads. A booking marked both attended and no-show (never written
// by the app) counts as attended.
export function sessionBookings(sessions: ReportSession[]): PopularityBooking[] {
  const out: PopularityBooking[] = [];
  for (const s of sessions) {
    const booked = Math.max(0, s.booked);
    const attended = Math.min(booked, Math.max(0, s.attended));
    const noShow = Math.min(booked - attended, Math.max(0, s.noShow));
    for (let i = 0; i < booked; i++) {
      out.push({ class_id: s.classId, booking_date: s.date, status: 'booked', attended: i < attended, no_show: i >= attended && i < attended + noShow });
    }
  }
  return out;
}

const asPopularity = (c: ReportClass): PopularityClass => ({
  id: c.id,
  day_of_week: c.dayOfWeek,
  specific_date: c.specificDate,
  capacity: c.capacity,
  retired_at: c.retiredAt,
});

interface FillTotals {
  sessions: number;
  places: number;
  taken: number;
  marked: number;
  attended: number;
  fillPct: number | null;
}

function totalsOf(rows: { sessions: number; places: number; bookingCount: number; marked: number; attended: number }[]): FillTotals {
  const t = rows.reduce(
    (n, r) => ({ sessions: n.sessions + r.sessions, places: n.places + r.places, taken: n.taken + r.bookingCount, marked: n.marked + r.marked, attended: n.attended + r.attended }),
    { sessions: 0, places: 0, taken: 0, marked: 0, attended: 0 }
  );
  return { ...t, fillPct: pct(t.taken, t.places) };
}

export interface FillRow {
  slot: string;
  sessions: number;
  places: number;
  taken: number;
  fillPct: number;
  marked: number;
  attended: number;
  // Came, out of the bookings a coach marked; null when none were marked.
  camePct: number | null;
}

export interface ClassFill {
  from: string;
  to: string;
  rows: FillRow[];
  totals: FillTotals;
}

// Sessions that have happened in the last `days` days, up to yesterday: places taken against places offered, per weekly slot, fullest first.
export function classFill(raw: ClassReportRaw, days = 28): ClassFill {
  const from = shiftDay(raw.today, -days);
  const to = shiftDay(raw.today, -1);
  const withGym = manyGyms(raw);
  const label = new Map(raw.classes.map((c) => [c.id, slotLabel(c, withGym)]));
  const cancelled = new Set(raw.cancelled);
  const slots = slotPopularity(raw.classes.map(asPopularity), sessionBookings(raw.sessions), cancelled, from, to, (id) => label.get(id) ?? 'Unknown class');
  const rows = slots.map((s) => ({
    slot: s.className,
    sessions: s.sessions,
    places: s.places,
    taken: s.bookingCount,
    fillPct: fillPercent(s),
    marked: s.marked,
    attended: s.attended,
    camePct: pct(s.attended, s.marked),
  }));
  return { from, to, rows, totals: totalsOf(slots) };
}

export interface WeekRow {
  weekStart: string;
  // True for the week that is still running (counted up to yesterday).
  current: boolean;
  sessions: number;
  places: number;
  taken: number;
  fillPct: number | null;
  attended: number;
  noShows: number;
  unmarked: number;
  // Came, out of the bookings a coach marked.
  attendedPct: number | null;
  // Different members who came that week.
  members: number;
}

// Week by week (Monday start), oldest first, for the weeks the report asked for. Each week counts its sessions up to yesterday, so this
// week is "so far" and a Monday shows an empty current week.
export function attendanceByWeek(raw: ClassReportRaw): WeekRow[] {
  const thisWeek = mondayOf(raw.today);
  const yesterday = shiftDay(raw.today, -1);
  const cancelled = new Set(raw.cancelled);
  const classes = raw.classes.map(asPopularity);
  const bookings = sessionBookings(raw.sessions);
  const members = new Map(raw.weekMembers.map((w) => [w.weekStart, w.members]));
  const out: WeekRow[] = [];
  for (let i = Math.max(1, raw.weeks) - 1; i >= 0; i--) {
    const weekStart = shiftDay(thisWeek, -7 * i);
    const end = shiftDay(weekStart, 6) < yesterday ? shiftDay(weekStart, 6) : yesterday;
    const t = totalsOf(end >= weekStart ? slotPopularity(classes, bookings, cancelled, weekStart, end, () => '') : []);
    out.push({
      weekStart,
      current: weekStart === thisWeek,
      sessions: t.sessions,
      places: t.places,
      taken: t.taken,
      fillPct: t.fillPct,
      attended: t.attended,
      noShows: t.marked - t.attended,
      unmarked: t.taken - t.marked,
      attendedPct: pct(t.attended, t.marked),
      members: members.get(weekStart) ?? 0,
    });
  }
  return out;
}

export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return shiftDay(iso, -((day + 6) % 7));
}

export interface WaitlistRow {
  slot: string;
  // Last `days` days, up to yesterday: sessions that had a waitlist, members who waited, who got a place, who never did.
  sessionsWithWaitlist: number;
  waited: number;
  gotPlace: number;
  missedOut: number;
  // Today and the next 14 days: members on a waitlist now.
  waitingNow: number;
}

// Where members wanted a place and the class was full. Only slots with any waitlist, most wanted first. A member who left the waitlist
// before a place came up can't be told from one who never joined it (the booking row is cancelled), so "waited" is a floor.
export function waitlistDemand(raw: ClassReportRaw, days = 28): WaitlistRow[] {
  const from = shiftDay(raw.today, -days);
  const withGym = manyGyms(raw);
  const byClass = new Map(raw.classes.map((c) => [c.id, c]));
  const rows = new Map<string, WaitlistRow>();
  for (const s of raw.sessions) {
    const c = byClass.get(s.classId);
    if (!c || (s.waiting <= 0 && s.promoted <= 0)) continue;
    const past = s.date >= from && s.date < raw.today;
    const upcoming = s.date >= raw.today;
    if (!past && !upcoming) continue;
    const row = rows.get(c.id) ?? { slot: slotLabel(c, withGym), sessionsWithWaitlist: 0, waited: 0, gotPlace: 0, missedOut: 0, waitingNow: 0 };
    if (past) {
      row.sessionsWithWaitlist += 1;
      row.waited += s.waiting + s.promoted;
      row.gotPlace += s.promoted;
      row.missedOut += s.waiting;
    } else {
      row.waitingNow += s.waiting;
    }
    rows.set(c.id, row);
  }
  return [...rows.values()]
    .filter((r) => r.waited > 0 || r.waitingNow > 0)
    .sort((a, b) => b.waited + b.waitingNow - (a.waited + a.waitingNow) || a.slot.localeCompare(b.slot));
}

// ---- CSV (headers and rows for toCsv) ----

type Csv = { headers: string[]; rows: (string | number | null)[][] };
const blank = (n: number | null) => (n === null ? '' : n);

export function classFillCsv(fill: ClassFill): Csv {
  return {
    headers: ['Class', 'Sessions', 'Places offered', 'Places taken', 'Fill %', 'Marked', 'Attended', 'Came % of marked'],
    rows: fill.rows.map((r) => [r.slot, r.sessions, r.places, r.taken, r.fillPct, r.marked, r.attended, blank(r.camePct)]),
  };
}

export function attendanceCsv(weeks: WeekRow[]): Csv {
  return {
    headers: ['Week starting', 'Sessions', 'Places offered', 'Places taken', 'Fill %', 'Attended', 'No-shows', 'Not marked', 'Came % of marked', 'Members who came'],
    rows: weeks.map((w) => [w.weekStart, w.sessions, w.places, w.taken, blank(w.fillPct), w.attended, w.noShows, w.unmarked, blank(w.attendedPct), w.members]),
  };
}

export function waitlistCsv(rows: WaitlistRow[]): Csv {
  return {
    headers: ['Class', 'Sessions with a waitlist', 'Members who waited', 'Got a place', 'Did not get in', 'Waiting now'],
    rows: rows.map((r) => [r.slot, r.sessionsWithWaitlist, r.waited, r.gotPlace, r.missedOut, r.waitingNow]),
  };
}

import type { ClassRow, ScheduleOccurrence } from '../data/types';
import { addDays, nextDateForWeekday, toIsoDate } from './dates';

// Classes are stored as a weekly pattern (day_of_week) or a one-off (specific_date), not as individual dated rows.
// This turns them into the concrete dated sessions a member can book. Same rules as the web's
// getScheduleOccurrences, with one deliberate difference: "today" is passed in (the member's own calendar date)
// instead of read from the server clock, so a member near a UTC day boundary sees the right days.

type ClassForSchedule = Pick<ClassRow, 'id' | 'name' | 'day_of_week' | 'specific_date' | 'start_time' | 'capacity' | 'credit_cost' | 'cutoff_hours'>;
export type BareOccurrence = Omit<ScheduleOccurrence, 'bookedCount' | 'unmarkedCount'>;

export function generateOccurrences(
  classes: ClassForSchedule[],
  opts: { todayIso: string; weeksAhead?: number; weeksBack?: number; blackoutStart?: string | null; blackoutEnd?: string | null },
): BareOccurrence[] {
  const { todayIso, weeksAhead = 3, weeksBack = 0, blackoutStart = null, blackoutEnd = null } = opts;
  const today = new Date(todayIso + 'T00:00:00Z');
  const windowStart = toIsoDate(addDays(today, -weeksBack * 7));
  const windowEnd = toIsoDate(addDays(today, weeksAhead * 7));
  const out: BareOccurrence[] = [];

  const base = (c: ClassForSchedule, date: string): BareOccurrence => ({
    classId: c.id, className: c.name, date, startTime: c.start_time, capacity: c.capacity, creditCost: c.credit_cost,
    cutoffHours: c.cutoff_hours, blackoutStart, blackoutEnd,
  });

  for (const c of classes) {
    if (c.specific_date) {
      // One-off: a single occurrence, kept only if it falls inside the window.
      if (c.specific_date >= windowStart && c.specific_date < windowEnd) out.push(base(c, c.specific_date));
      continue;
    }
    if (c.day_of_week == null) continue;
    const first = new Date(nextDateForWeekday(c.day_of_week, today) + 'T00:00:00Z'); // today counts
    for (let w = -weeksBack; w < weeksAhead; w++) out.push(base(c, toIsoDate(addDays(first, w * 7))));
  }
  return out;
}

// Drops sessions the coach cancelled and adds how many are booked. `counts` are per-session totals for the whole gym
// (the class_booking_counts RPC: counts only, never who), because a member can only read their own bookings.
export function applyExceptionsAndCounts(
  occurrences: BareOccurrence[],
  exceptions: { class_id: string; occurrence_date: string }[],
  counts: { class_id: string; booking_date: string; booked_count: number }[],
): ScheduleOccurrence[] {
  const cancelled = new Set(exceptions.map((e) => `${e.class_id}|${e.occurrence_date}`));
  const booked = new Map(counts.map((c) => [`${c.class_id}|${c.booking_date}`, c.booked_count]));
  return occurrences
    .filter((o) => !cancelled.has(`${o.classId}|${o.date}`))
    .map((o) => ({ ...o, bookedCount: booked.get(`${o.classId}|${o.date}`) ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

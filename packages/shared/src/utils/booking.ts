import type { BookingRow, ScheduleOccurrence } from '../data/types';
import { addDays, toIsoDate } from './dates';
import { cancelDeadline, type CancelDeadline } from './cancelDeadline';

// What a member can see and do on the booking screen. Presentation rules only: the database (book_class,
// cancel_booking) is what actually decides credits, refunds and who gets in. These mirror the web ClassesArea.

// A member with a package limit can book that many days ahead; otherwise two weeks.
export const DEFAULT_WINDOW_DAYS = 13;
export const bookingWindowDays = (advanceDays: number | null | undefined) => advanceDays ?? DEFAULT_WINDOW_DAYS;

// Class start as wall-clock ms at the gym (same encoding as nowLocalMs).
export function startMs(date: string, startTime: string | null): number {
  const [h, m] = (startTime ?? '00:00').split(':').map(Number);
  return Date.parse(`${date}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
}

// Only sessions still ahead of us and inside the member's booking window are offered.
export function bookableOccurrences(occurrences: ScheduleOccurrence[], nowMs: number, todayIso: string, windowDays: number): ScheduleOccurrence[] {
  const lastDate = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), windowDays));
  return occurrences.filter((o) => startMs(o.date, o.startTime) > nowMs && o.date <= lastDate);
}

export const isMorning = (o: Pick<ScheduleOccurrence, 'startTime'>) => (o.startTime ?? '00:00') < '12:00';

export type SlotState = 'booked' | 'waitlisted' | 'full' | 'open';

export function slotState(occ: ScheduleOccurrence, existing: Pick<BookingRow, 'status'> | undefined): SlotState {
  if (existing?.status === 'booked') return 'booked';
  if (existing?.status === 'waitlist') return 'waitlisted';
  return occ.bookedCount >= occ.capacity ? 'full' : 'open';
}

export function spots(occ: Pick<ScheduleOccurrence, 'capacity' | 'bookedCount'>) {
  const left = occ.capacity - occ.bookedCount;
  return { left, full: left <= 0, fillPct: occ.capacity > 0 ? Math.min(100, Math.round((occ.bookedCount / occ.capacity) * 100)) : 100, scarce: left > 0 && left <= 3 };
}

// What the confirmation sheet shows before booking.
export function bookSummary(occ: ScheduleOccurrence, creditsBalance: number) {
  const full = occ.bookedCount >= occ.capacity;
  const enough = creditsBalance >= occ.creditCost;
  return { full, cost: occ.creditCost, enough, left: creditsBalance - occ.creditCost, canConfirm: full || enough };
}

// What the cancel sheet shows. `late` means inside the cut-off: cancelling now forfeits the credit.
export function cancelSummary(
  booking: Pick<BookingRow, 'status' | 'booking_date'> & { class: { start_time: string | null; cutoff_hours: number } | null },
  nowMs: number,
  blackoutStart: string | null,
  blackoutEnd: string | null,
): { waitlisted: boolean; late: boolean; deadline: CancelDeadline | null } {
  const waitlisted = booking.status === 'waitlist';
  if (waitlisted || !booking.class) return { waitlisted, late: false, deadline: null };
  const deadline = cancelDeadline(booking.booking_date, booking.class.start_time, booking.class.cutoff_hours, blackoutStart, blackoutEnd);
  return { waitlisted, late: nowMs >= deadline.deadlineMs, deadline };
}

// The Saturday a member's credit week started on. Weekly credits reset on SATURDAY (migration 0144), so a member can book the week
// ahead; a credit week runs Saturday to Friday. Same rule as the database's credit_week_start(): Saturday and Sunday give that
// Saturday, Monday to Friday give the Saturday just gone. (The database works in UTC dates and so does this.)
export function creditWeekStart(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  const isoWeekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Monday 1 ... Sunday 7
  return toIsoDate(addDays(d, -((isoWeekday + 1) % 7)));
}

// The day the weekly allowance next resets: the next Saturday after today (a Saturday points a week ahead, as the day's reset has run).
export function nextResetDate(todayIso: string): string {
  return toIsoDate(addDays(new Date(creditWeekStart(todayIso) + 'T00:00:00Z'), 7));
}

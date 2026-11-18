import type { BookingRow } from '@/lib/data/types';
import { addDays, toIsoDate } from './dates';
import { cancelDeadline, type CancelDeadline } from './cancelDeadline';

// Booking-screen rules the web shares with the phone app. Twin of packages/shared/src/utils/booking.ts (startMs, cancelSummary,
// creditWeekStart, nextResetDate): keep the two the same. Presentation only: the database (book_class, cancel_booking) decides.

// Class start as wall-clock ms at the gym (same encoding as nowLocalMs).
export function startMs(date: string, startTime: string | null): number {
  const [h, m] = (startTime ?? '00:00').split(':').map(Number);
  return Date.parse(`${date}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
}

// What the cancel sheet shows. `late` means cancelling now forfeits the credit: inside the cut-off, unless the booking came off the
// waitlist after the cut-off, which is refunded until the session starts (`refundUntilStart`, decision D1, migration 0158's cancel_booking).
export function cancelSummary(
  booking: Pick<BookingRow, 'status' | 'booking_date' | 'promoted_after_cutoff'> & { class: { start_time: string | null; cutoff_hours: number } | null },
  nowMs: number,
  blackoutStart: string | null,
  blackoutEnd: string | null,
): { waitlisted: boolean; late: boolean; deadline: CancelDeadline | null; refundUntilStart: boolean } {
  const waitlisted = booking.status === 'waitlist';
  if (waitlisted || !booking.class) return { waitlisted, late: false, deadline: null, refundUntilStart: false };
  const deadline = cancelDeadline(booking.booking_date, booking.class.start_time, booking.class.cutoff_hours, blackoutStart, blackoutEnd);
  const refundUntilStart = !!booking.promoted_after_cutoff && nowMs < startMs(booking.booking_date, booking.class.start_time);
  return { waitlisted, late: nowMs >= deadline.deadlineMs && !refundUntilStart, deadline, refundUntilStart };
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

// What a member can pay for a session on one day (the database's member_session_credits, migration 0171): the weekly credits left for
// the credit week that day is in, bonus credits, and the plan's planned last day.
export interface SessionCredit {
  weeklyLeft: number;
  bonus: number;
  planLastDay: string | null;
}

export interface SessionPayment {
  // What the member can spend on this session; null while a later week's numbers are not known yet.
  available: number | null;
  enough: boolean;
  left: number | null;
  // The session is in a later credit week than today's, so it is paid from that week's credits.
  laterWeek: boolean;
  weekStart: string;
  // The session is after the plan's planned last day: it can't be booked (the plan's end would cancel it).
  afterPlanEnd: boolean;
}

// What the booking sheet says about paying for one session. A credit counts in the week the session runs (D13b): a session in a later
// credit week is paid from that week's own credits, not from what is left this week. Until the day's numbers have loaded, a session this
// week uses the balance on screen, and a later week's is left to the database to decide.
export function sessionPayment(date: string, cost: number, todayIso: string, credit: SessionCredit | undefined, balance: number): SessionPayment {
  const weekStart = creditWeekStart(date);
  const laterWeek = weekStart > creditWeekStart(todayIso);
  if (!credit) {
    if (laterWeek) return { available: null, enough: true, left: null, laterWeek, weekStart, afterPlanEnd: false };
    return { available: balance, enough: balance >= cost, left: balance - cost, laterWeek, weekStart, afterPlanEnd: false };
  }
  const afterPlanEnd = credit.planLastDay != null && date > credit.planLastDay;
  const available = Math.max(credit.weeklyLeft, 0) + Math.max(credit.bonus, 0);
  return { available, enough: !afterPlanEnd && available >= cost, left: available - cost, laterWeek, weekStart, afterPlanEnd };
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Sat 21 Nov" for an ISO date, the same on every device (no locale data needed).
export function shortDayLabel(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

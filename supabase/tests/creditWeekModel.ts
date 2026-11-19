import { creditWeekStart } from '../../lib/utils/booking';
import { addDays, toIsoDate } from '../../lib/utils/dates';

// An in-memory copy of migration 0171's credit rules, step for step, so the week-boundary cases can be tested without a database:
// session_credit_sources, charge_booking, start_credit_week, refund_booking_credits (0132, with 0171's hold release), the refund / no-refund
// choice in cancel_booking (0158, unchanged) and clear_membership_credits with cancel_bookings_for_ended_plan.
// migration-bookings-events.test.ts checks the SQL still has the expressions this mirrors.

export type Bucket = 'membership' | 'bonus';
export interface LedgerRow {
  delta: number;
  bucket: Bucket;
  bookingId: string | null;
  reason: string;
}
export interface ModelBooking {
  id: string;
  date: string;
  status: 'booked' | 'waitlist' | 'cancelled';
  weeklyCredits: number;
}
export interface ModelPlan {
  startedAt: string;
  scheduledEnd: string | null;
  lastResetWeek: string | null;
  perWeek: number;
}

const weekEndOf = (week: string) => toIsoDate(addDays(new Date(`${week}T00:00:00Z`), 6));

export class ModelMember {
  ledger: LedgerRow[] = [];
  bookings: ModelBooking[] = [];
  plan: ModelPlan | null = null;
  private seq = 0;

  balance(bucket: Bucket): number {
    return this.ledger.filter((r) => r.bucket === bucket).reduce((s, r) => s + r.delta, 0);
  }

  private membershipRows(bookingId: string): LedgerRow[] {
    return this.ledger.filter((r) => r.bookingId === bookingId && r.bucket === 'membership');
  }

  // A booking made before 0171: charged from the weekly balance when it was made, weekly_credits 0.
  addOldBooking(date: string, cost = 1): ModelBooking {
    const b: ModelBooking = { id: `old${++this.seq}`, date, status: 'booked', weeklyCredits: 0 };
    this.bookings.push(b);
    this.ledger.push({ delta: -cost, bucket: 'membership', bookingId: b.id, reason: 'Booked' });
    return b;
  }

  // session_credit_sources(member, day)
  sources(date: string): { weeklyLeft: number; weeklyNow: boolean; bonusLeft: number; planLastDay: string | null } {
    const bonusLeft = this.balance('bonus');
    const p = this.plan;
    const planLastDay = p?.scheduledEnd ?? null;
    // No open plan: a weekly balance still left (a refund after a plan ended) is spent at once.
    if (!p) return { weeklyLeft: Math.max(this.balance('membership'), 0), weeklyNow: true, bonusLeft, planLastDay };
    if (date < p.startedAt || (p.scheduledEnd != null && date > p.scheduledEnd)) return { weeklyLeft: 0, weeklyNow: false, bonusLeft, planLastDay };
    const week = creditWeekStart(date);
    if (p.lastResetWeek != null && week <= p.lastResetWeek) {
      return { weeklyLeft: Math.max(this.balance('membership'), 0), weeklyNow: true, bonusLeft, planLastDay };
    }
    const weekEnd = weekEndOf(week);
    let taken = 0;
    for (const b of this.bookings.filter((x) => x.weeklyCredits > 0 && x.date >= week && x.date <= weekEnd)) {
      const rows = this.membershipRows(b.id);
      taken += rows.length > 0 ? Math.max(-rows.reduce((s, r) => s + r.delta, 0), 0) : b.weeklyCredits;
    }
    return { weeklyLeft: Math.max(p.perWeek - taken, 0), weeklyNow: false, bonusLeft, planLastDay };
  }

  // charge_booking(booking, cost)
  charge(bookingId: string, cost: number): boolean {
    const b = this.bookings.find((x) => x.id === bookingId)!;
    const s = this.sources(b.date);
    const weekly = Math.min(cost, s.weeklyLeft);
    const bonus = cost - weekly;
    if (bonus > Math.max(s.bonusLeft, 0)) return false;
    if (weekly > 0 && s.weeklyNow) this.ledger.push({ delta: -weekly, bucket: 'membership', bookingId, reason: 'Booked' });
    if (bonus > 0) this.ledger.push({ delta: -bonus, bucket: 'bonus', bookingId, reason: 'Booked' });
    // With no open plan the booking is paid when booked (weekly_credits 0): a plan started later neither counts nor charges it.
    b.weeklyCredits = this.plan ? weekly : 0;
    return true;
  }

  // book_class(class, day): the plan's last day, then a place and the charge (a failed charge undoes the booking).
  book(date: string, cost = 1): ModelBooking {
    const last = this.sources(date).planLastDay;
    if (last != null && date > last) throw new Error(`Your plan ends on ${last}, so you can't book after that.`);
    const b: ModelBooking = { id: `b${++this.seq}`, date, status: 'booked', weeklyCredits: 0 };
    this.bookings.push(b);
    if (!this.charge(b.id, cost)) {
      this.bookings.pop();
      throw new Error('Not enough credits');
    }
    return b;
  }

  // start_credit_week(plan, week): the Saturday reset and the top-up when a plan starts or changes.
  startWeek(week: string): void {
    const p = this.plan!;
    const weekEnd = weekEndOf(week);
    const chargeHolds = (holds: ModelBooking[]) => {
      for (const b of holds.sort((a, c) => a.date.localeCompare(c.date))) {
        this.ledger.push({ delta: -b.weeklyCredits, bucket: 'membership', bookingId: b.id, reason: b.status === 'cancelled' ? 'Booked (cancelled, no refund)' : 'Booked' });
      }
    };
    const uncharged = (b: ModelBooking) => b.weeklyCredits > 0 && this.membershipRows(b.id).length === 0;
    // Holds of an earlier week whose reset never ran: charged first, against the old balance the reset row replaces.
    chargeHolds(this.bookings.filter((b) => uncharged(b) && b.date < week));
    const used = this.ledger
      .filter((r) => r.bucket === 'membership' && r.bookingId != null)
      .filter((r) => {
        const b = this.bookings.find((x) => x.id === r.bookingId)!;
        return b.weeklyCredits > 0 && b.date >= week && b.date <= weekEnd;
      })
      .reduce((s, r) => s + r.delta, 0);
    this.ledger.push({ delta: p.perWeek + used - this.balance('membership'), bucket: 'membership', bookingId: null, reason: `membership reset: week of ${week}` });
    p.lastResetWeek = week;
    // Then this week's holds, whatever the booking's status (a refund drops a hold).
    chargeHolds(this.bookings.filter((b) => uncharged(b) && b.date >= week && b.date <= weekEnd));
  }

  // refund_booking_credits(booking): drops a hold never charged, then gives back what the booking still has charged, per bucket; weekly
  // capped at the allowance when on a plan.
  refund(bookingId: string): number {
    const b = this.bookings.find((x) => x.id === bookingId)!;
    if (b.weeklyCredits > 0 && this.membershipRows(bookingId).length === 0) b.weeklyCredits = 0;
    let total = 0;
    for (const bucket of ['bonus', 'membership'] as Bucket[]) {
      const net = -this.ledger.filter((r) => r.bookingId === bookingId && r.bucket === bucket).reduce((s, r) => s + r.delta, 0);
      if (net <= 0) continue;
      let amount = net;
      if (bucket === 'membership' && this.plan) amount = Math.min(amount, Math.max(this.plan.perWeek - this.balance('membership'), 0));
      this.ledger.push({ delta: amount, bucket, bookingId, reason: 'Refunded' });
      total += amount;
    }
    return total;
  }

  // cancel_booking(booking) (0158, unchanged): refunded in time; otherwise nothing now (a hold stays for its week's reset).
  cancel(bookingId: string, inTime: boolean): void {
    const b = this.bookings.find((x) => x.id === bookingId)!;
    const wasBooked = b.status === 'booked';
    b.status = 'cancelled';
    if (wasBooked && inTime) this.refund(bookingId);
  }

  // A plan ends (clear_membership_credits): upcoming bookings cancelled and refunded, any hold left dropped, the weekly balance cleared.
  endPlan(upcomingFrom: string): void {
    this.plan = null;
    for (const b of this.bookings.filter((x) => x.date >= upcomingFrom && x.status !== 'cancelled')) {
      const wasBooked = b.status === 'booked';
      b.status = 'cancelled';
      if (wasBooked) this.refund(b.id);
    }
    for (const b of this.bookings) if (b.weeklyCredits > 0 && this.membershipRows(b.id).length === 0) b.weeklyCredits = 0;
    const left = this.balance('membership');
    if (left !== 0) this.ledger.push({ delta: -left, bucket: 'membership', bookingId: null, reason: 'membership ended' });
  }

  // How many weekly credits the sessions of one credit week used in the end (charged, less refunds).
  weeklyUsedFor(week: string): number {
    const weekEnd = weekEndOf(week);
    const ids = new Set(this.bookings.filter((b) => b.date >= week && b.date <= weekEnd).map((b) => b.id));
    return -this.ledger.filter((r) => r.bucket === 'membership' && r.bookingId != null && ids.has(r.bookingId)).reduce((s, r) => s + r.delta, 0);
  }
}

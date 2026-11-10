// Reports → Busiest: how full each weekly slot gets, over sessions that have already happened. Pure so it can be tested; getCoachReport
// (lib/data/reports.ts) reads the rows.
//
// It used to count every booking from the start of the period into the future (waitlist too) and rank slots by that count, so upcoming
// bookings read as "didn't come" (2 bookings · 50% came while every past booking was attended, CS28) and a 20-place slot always beat an
// 8-place one (CS15). Now: places taken ÷ places offered (capacity × sessions that ran), and "% came" out of the bookings the coach marked,
// as Overview counts it.
//
// Known limit: classes have no created date, so a slot added part-way through the period counts the weeks before it existed as empty
// sessions and reads emptier than it is.

export interface PopularityClass {
  id: string;
  day_of_week: number | null;
  specific_date: string | null;
  capacity: number;
  retired_at: string | null;
}

export interface PopularityBooking {
  class_id: string;
  booking_date: string;
  status: string;
  attended: boolean | null;
  no_show: boolean | null;
}

export interface SlotPopularity {
  className: string;
  // Sessions of this slot that ran in the period (not cancelled), and the places they offered (capacity × sessions).
  sessions: number;
  places: number;
  // Places taken on those sessions, how many the coach marked attended or no-show, and how many attended.
  bookingCount: number;
  marked: number;
  attended: number;
}

export const fillPercent = (s: Pick<SlotPopularity, 'bookingCount' | 'places'>): number => (s.places > 0 ? Math.round((s.bookingCount / s.places) * 100) : 0);

function* daysBetween(from: string, to: string): Generator<string> {
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

// `from`..`to` are the first and last days counted (inclusive); `to` should be a day that is over. `cancelled` holds "classId|date" for
// dates the coach cancelled. Slots with no session in the period are left out.
export function slotPopularity(
  classes: PopularityClass[],
  bookings: PopularityBooking[],
  cancelled: Set<string>,
  from: string,
  to: string,
  labelOf: (classId: string) => string
): SlotPopularity[] {
  const booked = bookings.filter((b) => b.status === 'booked' && b.booking_date >= from && b.booking_date <= to);
  const days = from <= to ? [...daysBetween(from, to)] : [];
  const out: SlotPopularity[] = [];
  for (const c of classes) {
    const retiredOn = c.retired_at ? c.retired_at.slice(0, 10) : null;
    const dates = new Set<string>();
    for (const d of c.specific_date ? days.filter((x) => x === c.specific_date) : c.day_of_week != null ? days.filter((x) => new Date(`${x}T00:00:00Z`).getUTCDay() === c.day_of_week) : []) {
      if (!cancelled.has(`${c.id}|${d}`) && (!retiredOn || d < retiredOn)) dates.add(d);
    }
    const mine = booked.filter((b) => b.class_id === c.id);
    // A date with places taken ran, even if the slot has since moved to another day.
    for (const b of mine) dates.add(b.booking_date);
    if (dates.size === 0) continue;
    out.push({
      className: labelOf(c.id),
      sessions: dates.size,
      places: dates.size * c.capacity,
      bookingCount: mine.length,
      marked: mine.filter((b) => b.attended || b.no_show).length,
      attended: mine.filter((b) => b.attended).length,
    });
  }
  return out.sort((a, b) => fillPercent(b) - fillPercent(a) || b.bookingCount - a.bookingCount);
}

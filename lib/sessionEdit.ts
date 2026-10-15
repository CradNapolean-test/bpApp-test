// What to tell a coach before a change to a timetable slot is saved, and the words for retiring one (R26, CH2). The database enforces the
// rules (migration 0132: capacity below the number booked and a changed weekday are refused, a changed start time notifies the members);
// this says so BEFORE the save, in plain English, so nothing surprises the coach or the members.

export interface SessionFields {
  dayOfWeek: number | null;
  specificDate: string | null;
  // "06:00" or "06:00:00"
  startTime: string | null;
  capacity: number;
}

export interface BookingSummary {
  // Distinct members booked or waitlisted on an upcoming date.
  upcomingMembers: number;
  // Largest number of "booked" bookings on any one upcoming date.
  mostBookedOnOneDate: number;
  // Every booking ever made for the session, any date, any status (0 means it can simply be deleted).
  totalBookings: number;
}

export type SessionEditCheck =
  | { kind: 'none' }
  | { kind: 'notify'; message: string }
  | { kind: 'blocked'; message: string };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const members = (n: number) => `${n} member${n === 1 ? ' is' : 's are'}`;

export function checkSessionEdit(before: SessionFields, after: SessionFields, summary: BookingSummary): SessionEditCheck {
  if (summary.upcomingMembers === 0) return { kind: 'none' };

  const dayMoved = before.dayOfWeek !== after.dayOfWeek || before.specificDate !== after.specificDate;
  if (dayMoved) {
    return {
      kind: 'blocked',
      message: `${members(summary.upcomingMembers)} already booked on upcoming sessions, so the day can't be changed. Retire this slot and create a new one instead.`,
    };
  }

  if (after.capacity < before.capacity && after.capacity < summary.mostBookedOnOneDate) {
    return {
      kind: 'blocked',
      message: `${summary.mostBookedOnOneDate} members are booked on one of the upcoming sessions, so the capacity can't go below ${summary.mostBookedOnOneDate}.`,
    };
  }

  if (hhmm(before.startTime) !== hhmm(after.startTime)) {
    const n = summary.upcomingMembers;
    return {
      kind: 'notify',
      message: `${members(n)} booked on this session. They will be told it now starts at ${hhmm(after.startTime)} (it was ${hhmm(before.startTime) || 'not set'}).`,
    };
  }

  return { kind: 'none' };
}

export interface RetireWording {
  title: string;
  body: string;
  confirmLabel: string;
}

// The confirmation for taking a session out of the timetable. A session with no bookings at all can simply be deleted; one with bookings
// is retired, which refunds and tells the members booked on upcoming dates and keeps all history.
export function retireWording(sessionName: string, summary: BookingSummary): RetireWording & { action: 'delete' | 'retire' } {
  if (summary.totalBookings === 0) {
    return {
      action: 'delete',
      title: `Delete "${sessionName}"?`,
      body: 'Nobody has ever booked it, so nothing else is affected.',
      confirmLabel: 'Delete',
    };
  }
  const n = summary.upcomingMembers;
  const upcoming =
    n === 0
      ? 'Nobody is booked on an upcoming date, so nobody needs refunding or telling.'
      : `${n} member${n === 1 ? '' : 's'} booked on upcoming dates will be refunded and told it is no longer running.`;
  return {
    action: 'retire',
    title: `Retire "${sessionName}"?`,
    body: `${upcoming} Past bookings and attendance stay on file. It will no longer appear for booking.`,
    confirmLabel: 'Retire session',
  };
}

// The date for a new one-off session cannot be in the past; today is fine.
export function isPastSessionDate(date: string, todayIso: string): boolean {
  return date < todayIso;
}

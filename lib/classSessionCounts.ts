import { startMs } from '@/lib/utils/booking';

// The numbers on each session card (class id + date): places taken, how many are waiting, and how many booked places still need
// marking attended or no-show. Pure so it can be tested; getScheduleOccurrences (lib/data/classes.ts) reads the rows.

export interface SessionBookingRow {
  class_id: string;
  booking_date: string;
  status: string;
  attended: boolean | null;
  no_show: boolean | null;
}

export interface SessionCounts {
  booked: Map<string, number>;
  waiting: Map<string, number>;
  unmarked: Map<string, number>;
}

export const sessionKey = (classId: string, date: string) => `${classId}|${date}`;

// `startTimeOf` gives each class's start time; `nowMs` is the gym's wall clock (nowLocalMs). A booking needs marking once its session has
// started, not from the next day: a session that finished this morning used to show neither "to mark" nor "Marked" until tomorrow (CV9/BK28).
export function countSessionBookings(rows: SessionBookingRow[], startTimeOf: Map<string, string | null>, nowMs: number): SessionCounts {
  const booked = new Map<string, number>();
  const waiting = new Map<string, number>();
  const unmarked = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);
  for (const b of rows) {
    const key = sessionKey(b.class_id, b.booking_date);
    if (b.status === 'waitlist') {
      bump(waiting, key);
      continue;
    }
    if (b.status !== 'booked') continue;
    bump(booked, key);
    if (!b.attended && !b.no_show && startMs(b.booking_date, startTimeOf.get(b.class_id) ?? null) <= nowMs) bump(unmarked, key);
  }
  return { booked, waiting, unmarked };
}

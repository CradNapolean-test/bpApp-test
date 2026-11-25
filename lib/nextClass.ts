// "Next class" on the coach's Overview of a member (CV8). It used to be the first booked class on or after today by date alone, so at
// 2:50pm it could still say "Next: today 6:00am". Now a class today counts only until it starts, by the gym's clock. A class with no
// start time can't be placed before or after now, so it still counts on its day (as the dashboard treats it: startedBy).
import { toMinutes } from './todaySessions';

type Booked = { booking_date: string; status: string; class?: { start_time?: string | null } | null };

export function isUpcomingClass(b: Booked, todayIso: string, nowMinute: number): boolean {
  if (b.status !== 'booked') return false;
  if (b.booking_date > todayIso) return true;
  if (b.booking_date < todayIso) return false;
  const start = b.class?.start_time ?? null;
  return start == null || start === '' || toMinutes(start) > nowMinute;
}

// The soonest still-to-come booked class, or undefined when there is none.
export function nextBookedClass<T extends Booked>(bookings: T[], todayIso: string, nowMinute: number): T | undefined {
  return bookings
    .filter((b) => isUpcomingClass(b, todayIso, nowMinute))
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')))[0];
}

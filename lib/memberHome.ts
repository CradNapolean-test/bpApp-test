// Member Home ("Your day"): the week strip in the header, and what counts as done in the Your day card.
// Only dates and wording here, so the rules can be tested without the screen.

import { WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';
import { formatWeight, type WeightUnit } from '@/lib/utils/weightUnits';

type HomeBooking = { booking_date: string; status: string; attended: boolean };

export type WeekDayState = 'trained' | 'today' | 'booked' | 'plain';

export interface HomeWeekDay {
  iso: string;
  // "Mon"
  label: string;
  // Day of the month, for the chip.
  dayNum: number;
  // What the chip shows. A session attended today reads as trained, not as today.
  state: WeekDayState;
  isToday: boolean;
  // Said to a screen reader: "Monday 9, trained".
  description: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function joinDays(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Monday to Sunday of the week `todayIso` falls in, with the sessions attended and the ones still booked.
export function homeWeek(bookings: HomeBooking[], todayIso: string): { days: HomeWeekDay[]; caption: string } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));

  const attended = new Set(bookings.filter((b) => b.attended && b.status !== 'cancelled').map((b) => b.booking_date));
  const booked = new Set(bookings.filter((b) => b.status === 'booked' && !b.attended && b.booking_date >= todayIso).map((b) => b.booking_date));

  const days: HomeWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dayIso = iso(d);
    const isToday = dayIso === todayIso;
    const state: WeekDayState = attended.has(dayIso) ? 'trained' : isToday ? 'today' : booked.has(dayIso) ? 'booked' : 'plain';
    const said = [
      `${WEEKDAY_LABELS[d.getUTCDay()]} ${d.getUTCDate()}`,
      isToday ? 'today' : '',
      attended.has(dayIso) ? 'trained' : booked.has(dayIso) ? 'booked' : '',
    ].filter(Boolean);
    days.push({ iso: dayIso, label: WEEKDAY_SHORT[d.getUTCDay()], dayNum: d.getUTCDate(), state, isToday, description: said.join(', ') });
  }

  const done = days.filter((d) => attended.has(d.iso)).length;
  const ahead = days
    .filter((d) => booked.has(d.iso))
    .map((d) => (d.isToday ? 'today' : WEEKDAY_LABELS[new Date(`${d.iso}T00:00:00Z`).getUTCDay()]));
  const doneText = done === 0 ? 'No sessions done yet this week.' : `${done} session${done === 1 ? '' : 's'} done this week.`;
  const aheadText = ahead.length > 0 ? `Booked ${joinDays(ahead)}.` : 'Nothing booked yet.';
  return { days, caption: `${doneText} ${aheadText}` };
}

// The daily check-in line on Home. With sleep, steps or water switched on it is done when every one of them is in for today; with all
// three switched off, when today's bodyweight is in. The weight reads in the member's units (D16).
export function checkinToday(
  log: { sleep: number | null; steps: number | null; water: number | null; bodyweight: number | null } | null | undefined,
  trackers: readonly string[],
  unit: WeightUnit = 'kg'
): { done: boolean; detail: string } {
  const weight = log?.bodyweight != null ? formatWeight(log.bodyweight, unit) : null;
  if (trackers.length === 0) {
    return weight ? { done: true, detail: `Done. ${weight}.` } : { done: false, detail: "Today's weigh-in and how you feel" };
  }
  const inSoFar = trackers.filter((k) => log?.[k as 'sleep' | 'steps' | 'water'] != null).length;
  if (inSoFar === trackers.length) return { done: true, detail: weight ? `Done. ${weight}.` : 'Done for today.' };
  if (inSoFar > 0) return { done: false, detail: `${inSoFar} of ${trackers.length} in so far` };
  const names = joinDays([...trackers]);
  return { done: false, detail: `${names[0].toUpperCase()}${names.slice(1)} for today` };
}

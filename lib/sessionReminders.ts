import type { PushPayload } from './push';
import { clockLabel } from './classCancelPush';
import { hourInZone, isQuietHour, QUIET_END_HOUR } from './coachPush';
import { wallTimeToIso } from './broadcastSend';
import { isoDateInTz } from './utils/dates';

// The reminder before a booked session (decision D20). Pure, with the clock passed in, so the timing is tested; the hourly job is
// app/api/cron/session-reminders/route.ts, and session_reminders (migration 0160) makes sure a booking is never reminded twice.
//
// When: 2 hours before the session starts. The job runs once an hour (GitHub Actions at :05, see .github/workflows), so a reminder may go
// up to half an hour early, which keeps it close to 2 hours whatever minute the session starts at (a 6:30 pm session is reminded at 4:05,
// not 5:05). Never in quiet hours (21:00 to 07:00 at the gym, as for a coach's push): when 2 hours before falls in them, the reminder goes
// the evening before from 20:00 instead (a 6 am class is reminded at about 8 pm the day before, not at 4 am). Someone who booked after the
// reminder time already knows, and is not reminded.

export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
export const REMINDER_EARLY_MS = 30 * 60 * 1000;
export const EVENING_REMINDER_HOUR = 20;

export interface ReminderBooking {
  bookingId: string;
  clientId: string;
  className: string;
  // The session's date and start time at the gym (bookings.booking_date, classes.start_time).
  date: string;
  startTime: string | null;
  // The gym's timezone.
  timeZone: string;
  // When the place became theirs: booked, or moved off the waitlist.
  bookedAt: string;
}

export interface DueReminder extends ReminderBooking {
  startsAt: string;
  // The session is later today at the gym, or tomorrow (an early class reminded the evening before).
  when: 'today' | 'tomorrow';
}

// When the session starts, as an instant. Null without a start time (there is nothing to remind about) or for a date that is not a date.
export function sessionStartMs(date: string, startTime: string | null, timeZone: string): number | null {
  const time = startTime ? /^(\d{2}):(\d{2})/.exec(startTime) : null;
  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const iso = wallTimeToIso(`${date}T${time[1]}:${time[2]}`, timeZone);
  return iso ? new Date(iso).getTime() : null;
}

// The day before an ISO date ("2026-03-01" -> "2026-02-28").
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// The ideal moment for the reminder: 2 hours before, or 20:00 the evening before when that falls in quiet hours.
export function reminderAtMs(startMs: number, timeZone: string): number {
  const twoHoursBefore = startMs - REMINDER_LEAD_MS;
  const at = new Date(twoHoursBefore);
  if (!isQuietHour(at, timeZone)) return twoHoursBefore;
  // In quiet hours: after 21:00 it is that evening's 20:00; before 07:00 it is the previous evening's.
  const localDate = isoDateInTz(at, timeZone);
  const eveningDate = hourInZone(at, timeZone) < QUIET_END_HOUR ? dayBefore(localDate) : localDate;
  const evening = wallTimeToIso(`${eveningDate}T${String(EVENING_REMINDER_HOUR).padStart(2, '0')}:00`, timeZone);
  return evening ? new Date(evening).getTime() : twoHoursBefore;
}

// The bookings whose reminder is due at `now`. The caller still claims each one (session_reminders) before pushing, so a booking that
// was reminded by an earlier run is not reminded again.
export function dueReminders(bookings: ReminderBooking[], now: Date): DueReminder[] {
  const nowMs = now.getTime();
  const due: DueReminder[] = [];
  for (const b of bookings) {
    const startMs = sessionStartMs(b.date, b.startTime, b.timeZone);
    if (startMs == null || nowMs >= startMs) continue;
    const earliest = reminderAtMs(startMs, b.timeZone) - REMINDER_EARLY_MS;
    if (nowMs < earliest) continue;
    if (isQuietHour(now, b.timeZone)) continue;
    const bookedMs = new Date(b.bookedAt).getTime();
    if (!Number.isFinite(bookedMs) || bookedMs >= earliest) continue;
    due.push({ ...b, startsAt: new Date(startMs).toISOString(), when: isoDateInTz(now, b.timeZone) === b.date ? 'today' : 'tomorrow' });
  }
  return due;
}

// ---- never twice ----
// The session_reminders table (migration 0160) as the job uses it: an insert that skips bookings already there (the booking id is the
// primary key) and answers only the rows it inserted. The admin client's from('session_reminders') is one.
export interface ReminderClaims {
  upsert(
    rows: { booking_id: string }[],
    options: { onConflict: string; ignoreDuplicates: boolean }
  ): { select(columns: string): PromiseLike<{ data: { booking_id: string }[] | null; error: { message: string } | null }> };
}

export type ReminderRun =
  | { ok: true; due: number; claimed: number; sent: number; failed: number }
  | { ok: false; error: string };

// Claims each due booking, then pushes only the bookings this call claimed, once each. A booking a previous run (or one running at the
// same time) already claimed is not in the answer, so it is not pushed again; a booking listed twice is claimed and pushed once; if the
// claim fails nothing is pushed. `push` answers what lib/push.ts's pushQuietly does (null when the push threw).
export async function remindOnce(
  due: DueReminder[],
  claims: ReminderClaims,
  push: (reminder: DueReminder) => Promise<{ sent: number; failed: number } | null>
): Promise<ReminderRun> {
  const byBooking = new Map<string, DueReminder>();
  for (const d of due) if (!byBooking.has(d.bookingId)) byBooking.set(d.bookingId, d);
  const unique = [...byBooking.values()];
  if (unique.length === 0) return { ok: true, due: 0, claimed: 0, sent: 0, failed: 0 };

  const { data, error } = await claims
    .upsert(
      unique.map((d) => ({ booking_id: d.bookingId })),
      { onConflict: 'booking_id', ignoreDuplicates: true }
    )
    .select('booking_id');
  if (error) return { ok: false, error: error.message };

  const mine = new Set((data ?? []).map((c) => c.booking_id));
  const toSend = unique.filter((d) => mine.has(d.bookingId));
  let sent = 0;
  let failed = 0;
  await Promise.all(
    toSend.map(async (d) => {
      const result = await push(d);
      sent += result?.sent ?? 0;
      failed += result?.failed ?? (result ? 0 : 1);
    })
  );
  return { ok: true, due: unique.length, claimed: toSend.length, sent, failed };
}

// "Strength & Conditioning today at 6 pm"
export function sessionReminderPayload(r: Pick<DueReminder, 'bookingId' | 'className' | 'startTime' | 'when'>): PushPayload {
  const name = r.className.length > 60 ? `${r.className.slice(0, 57)}...` : r.className;
  return {
    title: `${name} ${r.when}${r.startTime ? ` at ${clockLabel(r.startTime)}` : ''}`,
    body: "See you there. Can't make it? Cancel in the app so someone on the waiting list can have your place.",
    url: '/dashboard?open=book',
    tag: `session-reminder-${r.bookingId}`,
  };
}

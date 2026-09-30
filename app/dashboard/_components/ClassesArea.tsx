'use client';

import { useState } from 'react';
import { CalendarDays, Clock, Ticket } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { bookClass, cancelBooking } from '@/lib/data/classes';
import { addDays, DEFAULT_TIMEZONE, formatClassTime, startOfWeek, todayIsoInTz, toIsoDate } from '@/lib/utils/dates';
import { cancelDeadline, cancelNote, formatClock, nowLocalMs } from '@/lib/utils/cancelDeadline';
import { CheckInButton } from './CheckInButton';
import type { BookingRow, ClientMembershipRow, ScheduleOccurrence, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

export function ClassesArea({
  bookings,
  occurrences,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
}: {
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
}) {
  const { run } = useAction();
  const confirm = useConfirm();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Must match the timezone dashboardBundle used server-side to resolve booking/occurrence
  // dates (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` here is the UTC
  // date, which disagrees with the client's local "today" for roughly half of every day
  // outside UTC.
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const nowMs = nowLocalMs(tz);
  const nextReset = toIsoDate(addDays(startOfWeek(new Date()), 7));

  const advanceDays = membership?.package?.advance_booking_days ?? null;
  const lastBookableDate = advanceDays != null ? toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), advanceDays)) : null;

  const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
  const bookingByKey = new Map(activeBookings.map((b) => [`${b.class_id}|${b.booking_date}`, b]));

  function startMs(date: string, startTime: string | null): number {
    const [h, m] = (startTime ?? '00:00').split(':').map(Number);
    return Date.parse(`${date}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
  }

  // Only sessions still ahead of us and inside this member's booking window are offered.
  const bookable = occurrences.filter(
    (o) => startMs(o.date, o.startTime) > nowMs && (lastBookableDate == null || o.date <= lastBookableDate)
  );
  const days = [...new Set(bookable.map((o) => o.date))].sort();
  const selectedDate = pickedDate && days.includes(pickedDate) ? pickedDate : (days[0] ?? null);

  const blackoutStart = occurrences[0]?.blackoutStart ?? null;
  const blackoutEnd = occurrences[0]?.blackoutEnd ?? null;
  const cutoffHours = occurrences[0]?.cutoffHours ?? 3;

  async function handleBook(occ: ScheduleOccurrence) {
    setBusyKey(`${occ.classId}|${occ.date}`);
    try {
      const full = occ.bookedCount >= occ.capacity;
      await run(() => bookClass(occ.classId, occ.date), {
        success: full ? `Added to the waitlist for ${occ.className}` : `Booked ${occ.className}`,
      });
    } finally {
      setBusyKey(null);
    }
  }

  // Warns before a cancel that will forfeit the credit (past the cancellation deadline). The
  // database decides the actual refund; this only mirrors its rule so nobody is surprised.
  async function handleCancel(bookingId: string, b?: BookingRow) {
    if (b && b.status === 'booked' && b.class) {
      const deadline = cancelDeadline(b.booking_date, b.class.start_time, b.class.cutoff_hours, blackoutStart, blackoutEnd);
      if (nowMs >= deadline.deadlineMs) {
        const ok = await confirm({
          title: 'Cancel and lose your credit?',
          body: 'It is too close to the session to get your credit back. You can still cancel, but the credit will not be refunded.',
          confirmLabel: 'Cancel anyway',
          destructive: true,
        });
        if (!ok) return;
      }
    }
    setBusyKey(bookingId);
    try {
      await run(() => cancelBooking(bookingId), { success: 'Booking cancelled' });
    } finally {
      setBusyKey(null);
    }
  }

  const dayOccurrences = bookable
    .filter((o) => o.date === selectedDate)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  // Upcoming only (today onwards, not cancelled) -- past sessions live in attendance history, not
  // the booking list.
  const upcoming = bookings
    .filter((b) => b.status !== 'cancelled' && b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')));
  const morning = dayOccurrences.filter((o) => (o.startTime ?? '00:00') < '12:00');
  const evening = dayOccurrences.filter((o) => (o.startTime ?? '00:00') >= '12:00');

  function renderSlot(occ: ScheduleOccurrence) {
    const key = `${occ.classId}|${occ.date}`;
    const existingBooking = bookingByKey.get(key);
    const spots = occ.capacity - occ.bookedCount;
    const full = spots <= 0;
    const booked = existingBooking?.status === 'booked';
    const waitlisted = existingBooking?.status === 'waitlist';
    const note = booked
      ? cancelNote(cancelDeadline(occ.date, occ.startTime, occ.cutoffHours, occ.blackoutStart, occ.blackoutEnd))
      : null;
    return (
      <div
        key={key}
        className={`rounded-2xl border p-3.5 ${
          booked ? 'border-accent/30 bg-accent-soft' : 'border-black/[.06] bg-card dark:border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">
              {occ.startTime ? formatClassTime(occ.startTime) : occ.className}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {occ.className} · max {occ.capacity}
              {occ.creditCost !== 1 ? ` · ${occ.creditCost} credits` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {booked && existingBooking ? (
              <>
                <span className="text-[11px] font-bold text-success">Booked ✓</span>
                <button
                  onClick={() => handleCancel(existingBooking.id, existingBooking)}
                  disabled={busyKey === existingBooking.id}
                  className="rounded-full bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : waitlisted && existingBooking ? (
              <>
                <span className="text-[11px] font-bold text-warning">On waitlist</span>
                <button
                  onClick={() => handleCancel(existingBooking.id)}
                  disabled={busyKey === existingBooking.id}
                  className="rounded-full bg-black/10 px-3 py-1.5 text-xs font-bold text-zinc-700 disabled:opacity-50 dark:bg-white/10 dark:text-zinc-300"
                >
                  Leave
                </button>
              </>
            ) : (
              <>
                <span className={`text-[11px] font-bold ${full ? 'text-danger' : spots <= 3 ? 'text-warning' : 'text-success'}`}>
                  {full ? 'Full' : `${spots} left`}
                </span>
                <button
                  onClick={() => handleBook(occ)}
                  disabled={busyKey === key}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold disabled:opacity-50 ${
                    full ? 'bg-warning/15 text-warning' : 'bg-accent text-accent-foreground'
                  }`}
                >
                  {full ? 'Waitlist' : 'Book'}
                </button>
              </>
            )}
          </div>
        </div>
        {note && <p className="mt-2 text-[11px] text-zinc-500">{note}</p>}
      </div>
    );
  }

  const policyText =
    blackoutStart && blackoutEnd
      ? `Cancel ${cutoffHours}+ hours before to keep your credit. Blackout ${formatClock(blackoutStart.slice(0, 5))}–${formatClock(blackoutEnd.slice(0, 5))} — cancel early morning sessions the night before.`
      : `Cancel ${cutoffHours}+ hours before to keep your credit.`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
        <div className="flex items-center gap-3">
          <Ticket className="h-5 w-5 text-accent" />
          <div>
            <p className="text-[11px] text-zinc-500">Credits remaining</p>
            <p className="text-2xl font-black leading-none text-accent">{creditsBalance}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-black dark:text-zinc-50">{membership?.package?.name ?? 'No membership'}</p>
          {membership?.package && (
            <p className="text-[11px] text-zinc-500">
              {membership.package.credits_per_week}/week · resets{' '}
              {new Date(nextReset + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 rounded-xl border border-black/[.06] bg-black/[.02] px-3 py-2.5 dark:border-white/10 dark:bg-white/[.03]">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <p className="text-[11px] leading-snug text-zinc-500">{policyText}</p>
      </div>

      <div>
        {days.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No sessions to book"
            hint={
              occurrences.length === 0
                ? 'Check back once your coach schedules some.'
                : 'There are no upcoming sessions inside your booking window.'
            }
          />
        ) : (
          <>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
              {days.map((d) => {
                const dt = new Date(d + 'T00:00:00Z');
                const active = d === selectedDate;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPickedDate(d)}
                    className={`flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2 ${
                      active
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-black/[.06] text-zinc-600 dark:border-white/10 dark:text-zinc-300'
                    }`}
                  >
                    <span className="text-[11px] font-bold uppercase opacity-80">
                      {dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                    </span>
                    <span className="text-sm font-black">{dt.getUTCDate()}</span>
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <p className="px-1 pb-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
                {new Date(selectedDate + 'T00:00:00Z').toLocaleDateString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
                })}
              </p>
            )}
            {morning.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Morning</p>
                {morning.map(renderSlot)}
              </div>
            )}
            {evening.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400">Evening</p>
                {evening.map(renderSlot)}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">My bookings</h3>
        {upcoming.length === 0 ? (
          <EmptyState icon={Ticket} title="No upcoming bookings" hint="Book a session above and it'll show up here." />
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => {
              const waitlisted = b.status === 'waitlist';
              // Same cancellation rule as the session cards above: refund up to the deadline,
              // none after it (enforced by the database; this just shows it).
              const deadline =
                !waitlisted && b.class
                  ? cancelDeadline(b.booking_date, b.class.start_time, b.class.cutoff_hours, blackoutStart, blackoutEnd)
                  : null;
              const late = deadline != null && nowMs >= deadline.deadlineMs;
              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="font-bold text-black dark:text-zinc-50">{b.class?.name}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {new Date(b.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
                        })}
                        {b.class?.start_time ? ` · ${formatClassTime(b.class.start_time)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!waitlisted && b.booking_date === todayIso && (
                        <CheckInButton classRow={b.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} timezone={timezone} />
                      )}
                      <span
                        className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          waitlisted ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-accent-soft text-accent'
                        }`}
                      >
                        {waitlisted ? 'Waitlist' : 'Booked'}
                      </span>
                      <button
                        onClick={() => handleCancel(b.id, b)}
                        disabled={busyKey === b.id}
                        className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                      >
                        {waitlisted ? 'Leave' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                  {deadline && (
                    <p className={`mt-2 text-[11px] ${late ? 'text-danger' : 'text-zinc-500'}`}>
                      {late ? 'Past the cancellation deadline — cancelling now forfeits your credit' : cancelNote(deadline)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

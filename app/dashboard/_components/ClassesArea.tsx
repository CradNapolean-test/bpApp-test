'use client';

import { useState } from 'react';
import { CalendarDays, Ticket } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { ClassCalendar } from '@/app/_components/ClassCalendar';
import { EmptyState } from '@/app/_components/EmptyState';
import { bookClass, cancelBooking } from '@/lib/data/classes';
import { addDays, formatClassTime, startOfWeek, toIsoDate } from '@/lib/utils/dates';
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
}: {
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
}) {
  const { run } = useAction();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const todayIso = toIsoDate(new Date());
  const nextReset = toIsoDate(addDays(startOfWeek(new Date()), 7));

  const activeBookings = bookings.filter((b) => b.status !== 'cancelled');
  const bookingByKey = new Map(activeBookings.map((b) => [`${b.class_id}|${b.booking_date}`, b]));

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

  async function handleCancel(bookingId: string) {
    setBusyKey(bookingId);
    try {
      await run(() => cancelBooking(bookingId), { success: 'Booking cancelled' });
    } finally {
      setBusyKey(null);
    }
  }

  const dayOccurrences = occurrences.filter((o) => o.date === selectedDate);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
        <h3 className="text-sm text-zinc-500">This week&apos;s credits</h3>
        <p className="text-2xl font-bold text-black dark:text-zinc-50">{creditsBalance}</p>
        {membership?.package ? (
          <p className="mt-1 text-sm text-zinc-500">
            {membership.package.name} · {membership.package.credits_per_week}/week · resets{' '}
            {new Date(nextReset + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No membership package assigned yet.</p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Available classes</h3>
        <ClassCalendar occurrences={occurrences} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        {!selectedDate && (
          <div className="mt-3">
            <EmptyState
              icon={CalendarDays}
              title={occurrences.length === 0 ? 'No classes scheduled' : 'Pick a day to book'}
              hint={
                occurrences.length === 0
                  ? 'Check back once your coach schedules some.'
                  : 'Marked days have a class available. Select one to book or join the waitlist.'
              }
            />
          </div>
        )}

        {selectedDate && (
          <div className="mt-3 space-y-2.5">
            {dayOccurrences.map((occ) => {
              const key = `${occ.classId}|${occ.date}`;
              const existingBooking = bookingByKey.get(key);
              const full = occ.bookedCount >= occ.capacity;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-black dark:text-zinc-50">{occ.className}</p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {occ.startTime ? `${formatClassTime(occ.startTime)} · ` : ''}
                      {occ.bookedCount}/{occ.capacity} booked · {occ.creditCost} credit{occ.creditCost === 1 ? '' : 's'}
                    </p>
                  </div>
                  {existingBooking ? (
                    <button
                      onClick={() => handleCancel(existingBooking.id)}
                      disabled={busyKey === existingBooking.id}
                      className="shrink-0 rounded-full bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50"
                    >
                      {existingBooking.status === 'waitlist' ? 'Leave waitlist' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBook(occ)}
                      disabled={busyKey === key || (full && occ.date < todayIso)}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                    >
                      {full ? 'Join waitlist' : 'Book'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bookings</h3>
        {bookings.length === 0 ? (
          <EmptyState icon={Ticket} title="No bookings yet" hint="Book a class above and it'll show up here." />
        ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const isPast = b.booking_date < todayIso;
            const badge =
              b.status === 'cancelled'
                ? { label: 'Cancelled', cls: 'bg-black/5 text-zinc-500 dark:bg-white/10' }
                : b.status === 'waitlist'
                  ? { label: 'Waitlist', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' }
                  : isPast
                    ? b.attended
                      ? { label: 'Attended', cls: 'bg-success/10 text-success' }
                      : { label: 'No-show', cls: 'bg-danger/10 text-danger' }
                    : { label: 'Booked', cls: 'bg-accent-soft text-accent' };
            return (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-bold text-black dark:text-zinc-50">{b.class?.name}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {new Date(b.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    {b.class?.start_time ? ` · ${formatClassTime(b.class.start_time)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.status === 'booked' && b.booking_date === todayIso && (
                    <CheckInButton classRow={b.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} />
                  )}
                  {b.status !== 'cancelled' && !isPast && (
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={busyKey === b.id}
                      className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

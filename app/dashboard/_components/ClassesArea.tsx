'use client';

import { useState } from 'react';
import { CalendarDays, Ticket } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { ClassCalendar } from '@/app/_components/ClassCalendar';
import { EmptyState } from '@/app/_components/EmptyState';
import { bookClass, cancelBooking } from '@/lib/data/classes';
import { addDays, startOfWeek, toIsoDate } from '@/lib/utils/dates';
import type { BookingRow, ClientMembershipRow, ScheduleOccurrence } from '@/lib/data/types';

export function ClassesArea({
  bookings,
  occurrences,
  creditsBalance,
  membership,
}: {
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
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
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">This week&apos;s credits</h3>
        <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{creditsBalance}</p>
        {membership?.package ? (
          <p className="mt-1 text-sm text-zinc-500">
            {membership.package.name} · {membership.package.credits_per_week}/week · resets {nextReset}
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
          <ul className="mt-3 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
            {dayOccurrences.map((occ) => {
              const key = `${occ.classId}|${occ.date}`;
              const existingBooking = bookingByKey.get(key);
              const full = occ.bookedCount >= occ.capacity;
              return (
                <li key={key} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    {occ.className}
                    {occ.startTime ? ` ${occ.startTime.slice(0, 5)}` : ''}{' '}
                    <span className="text-zinc-500">
                      · {occ.bookedCount}/{occ.capacity} booked · {occ.creditCost} credit{occ.creditCost === 1 ? '' : 's'}
                    </span>
                  </span>
                  {existingBooking ? (
                    <button
                      onClick={() => handleCancel(existingBooking.id)}
                      disabled={busyKey === existingBooking.id}
                      className="rounded-md border border-black/10 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/10"
                    >
                      {existingBooking.status === 'waitlist' ? 'Leave waitlist' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBook(occ)}
                      disabled={busyKey === key || (full && occ.date < todayIso)}
                      className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
                    >
                      {full ? 'Join waitlist' : 'Book'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bookings</h3>
        {bookings.length === 0 ? (
          <EmptyState icon={Ticket} title="No bookings yet" hint="Book a class above and it'll show up here." />
        ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {bookings.map((b) => {
            const isPast = b.booking_date < todayIso;
            return (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {b.class?.name} — {b.booking_date}{' '}
                  <span className="text-zinc-500">
                    ({b.status}
                    {isPast && b.status === 'booked' ? `, ${b.attended ? 'attended' : 'no-show'}` : ''})
                  </span>
                </span>
                {b.status !== 'cancelled' && !isPast && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={busyKey === b.id}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    Cancel
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookClass, cancelBooking } from '@/lib/data/classes';
import { nextDateForWeekday, addDays, startOfWeek, toIsoDate } from '@/lib/utils/dates';
import type { BookingRow, ClassRow, ClientMembershipRow } from '@/lib/data/types';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ClassesArea({
  classes,
  bookings,
  creditsBalance,
  membership,
}: {
  classes: ClassRow[];
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayIso = toIsoDate(new Date());
  const nextReset = toIsoDate(addDays(startOfWeek(new Date()), 7));

  async function handleBook(classItem: ClassRow) {
    if (classItem.day_of_week == null) return;
    setBusyId(classItem.id);
    setError(null);
    try {
      const date = nextDateForWeekday(classItem.day_of_week);
      await bookClass(classItem.id, date);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(bookingId: string) {
    setBusyId(bookingId);
    setError(null);
    try {
      await cancelBooking(bookingId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setBusyId(null);
    }
  }

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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bookings</h3>
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
                    disabled={busyId === b.id}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    Cancel
                  </button>
                )}
              </li>
            );
          })}
          {bookings.length === 0 && <li className="p-3 text-sm text-zinc-500">No bookings yet.</li>}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Available classes</h3>
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {c.name} —{' '}
                {c.day_of_week != null ? WEEKDAY_LABELS[c.day_of_week] : 'Unscheduled'}
                {c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''} · capacity {c.capacity}
              </span>
              {c.day_of_week != null && (
                <button
                  onClick={() => handleBook(c)}
                  disabled={busyId === c.id}
                  className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
                >
                  Book next
                </button>
              )}
            </li>
          ))}
          {classes.length === 0 && <li className="p-3 text-sm text-zinc-500">No classes scheduled.</li>}
        </ul>
      </div>
    </div>
  );
}

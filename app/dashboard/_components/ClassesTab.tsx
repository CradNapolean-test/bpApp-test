'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookClass, cancelBooking, grantCredits } from '@/lib/data/classes';
import { nextDateForWeekday } from '@/lib/utils/dates';
import type { BookingRow, ClassRow } from '@/lib/data/types';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ClassesTab({
  clientId,
  isCoachView,
  classes,
  bookings,
  creditsBalance,
}: {
  clientId: string;
  isCoachView: boolean;
  classes: ClassRow[];
  bookings: BookingRow[];
  creditsBalance: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState(1);
  const [grantReason, setGrantReason] = useState('manual grant');
  const [granting, setGranting] = useState(false);

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

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    try {
      await grantCredits(clientId, grantAmount, grantReason);
      router.refresh();
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Credits</h3>
        <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{creditsBalance}</p>

        {isCoachView && (
          <form onSubmit={handleGrant} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Amount</label>
              <input
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(Number(e.target.value))}
                className="w-20 rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Reason</label>
              <input
                type="text"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10"
              />
            </div>
            <button
              type="submit"
              disabled={granting}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {granting ? 'Granting…' : 'Grant credits'}
            </button>
          </form>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Upcoming bookings</h3>
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {b.class?.name} — {b.booking_date}{' '}
                <span className="text-zinc-500">({b.status})</span>
              </span>
              {!isCoachView && b.status !== 'cancelled' && (
                <button
                  onClick={() => handleCancel(b.id)}
                  disabled={busyId === b.id}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
          {bookings.length === 0 && <li className="p-3 text-sm text-zinc-500">No upcoming bookings.</li>}
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
              {!isCoachView && c.day_of_week != null && (
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

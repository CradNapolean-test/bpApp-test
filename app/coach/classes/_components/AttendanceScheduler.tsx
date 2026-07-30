'use client';

import { useState } from 'react';
import { CalendarDays, UserX } from 'lucide-react';
import { ClassCalendar } from '@/app/_components/ClassCalendar';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { getRoster, markAttendance } from '@/lib/data/classes';
import type { RosterEntry, ScheduleOccurrence } from '@/lib/data/types';

export function AttendanceScheduler({ occurrences }: { occurrences: ScheduleOccurrence[] }) {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScheduleOccurrence | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function openOccurrence(occ: ScheduleOccurrence) {
    setSelected(occ);
    setLoading(true);
    try {
      const r = await getRoster(occ.classId, occ.date);
      setRoster(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the roster');
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttended(entry: RosterEntry) {
    if (!selected) return;
    const nextAttended = !entry.attended;
    setRoster((prev) =>
      prev ? prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, attended: nextAttended } : r)) : prev
    );
    // Revert the optimistic tick and say why, rather than silently snapping back.
    const revert = (message: string) => {
      setRoster((prev) =>
        prev ? prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, attended: entry.attended } : r)) : prev
      );
      toast.error(message);
    };

    try {
      const result = await markAttendance(entry.bookingId, nextAttended);
      if (!result.ok) revert(result.error);
    } catch (err) {
      revert(err instanceof Error ? err.message : 'Could not update attendance');
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setSelected(null);
            setRoster(null);
          }}
          className="text-sm text-zinc-500 hover:underline"
        >
          &larr; Back to schedule
        </button>
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">
          {selected.className} — {selected.date}
        </h3>
        {loading && <p className="text-sm text-zinc-500">Loading roster…</p>}
        {!loading && (roster ?? []).length === 0 && (
          <EmptyState icon={UserX} title="Nobody booked in" hint="No clients have booked this class occurrence." />
        )}
        {!loading && (roster ?? []).length > 0 && (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
            {(roster ?? []).map((entry) => (
              <li key={entry.bookingId} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {entry.clientName} <span className="text-zinc-500">({entry.status})</span>
                </span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={entry.attended}
                    onChange={() => toggleAttended(entry)}
                  />
                  Attended
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const dayOccurrences = occurrences.filter((o) => o.date === selectedDate);

  return (
    <div className="space-y-4">
      <ClassCalendar occurrences={occurrences} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {!selectedDate && (
        <EmptyState
          icon={CalendarDays}
          title={occurrences.length === 0 ? 'No upcoming classes' : 'Pick a day to take attendance'}
          hint={
            occurrences.length === 0
              ? 'Add a class under Manage Classes and its occurrences will appear here.'
              : 'Marked days have a class scheduled. Select one to see who booked in.'
          }
        />
      )}

      {selectedDate && (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
          {dayOccurrences.map((occ) => (
            <li key={`${occ.classId}-${occ.date}`}>
              <button
                onClick={() => openOccurrence(occ)}
                className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <span>
                  {occ.className}
                  {occ.startTime ? ` ${occ.startTime.slice(0, 5)}` : ''}
                </span>
                <span className="text-zinc-500">
                  {occ.bookedCount}/{occ.capacity} booked
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

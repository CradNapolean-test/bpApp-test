'use client';

import { useState } from 'react';
import { CalendarDays, Check, UserX, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Button } from '@/app/_components/Button';
import { ClassCalendar } from '@/app/_components/ClassCalendar';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { getRoster, markAttendanceStatus } from '@/lib/data/classes';
import type { AttendanceStatus, RosterEntry, ScheduleOccurrence } from '@/lib/data/types';

function statusOf(entry: RosterEntry): AttendanceStatus {
  if (entry.attended) return 'attended';
  if (entry.noShow) return 'no_show';
  return 'unmarked';
}

// Unmarked -> Attended -> No-show -> Unmarked, tap to advance.
const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
  unmarked: 'attended',
  attended: 'no_show',
  no_show: 'unmarked',
};

const STATUS_META: Record<AttendanceStatus, { label: string; variant: 'outline' | 'primary' | 'danger-solid' }> = {
  unmarked: { label: 'Mark', variant: 'outline' },
  attended: { label: 'Attended', variant: 'primary' },
  no_show: { label: 'No-show', variant: 'danger-solid' },
};

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

  async function cycleStatus(entry: RosterEntry) {
    if (!selected) return;
    const current = statusOf(entry);
    const next = NEXT_STATUS[current];
    const nextFields = { attended: next === 'attended', noShow: next === 'no_show' };
    setRoster((prev) =>
      prev ? prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, ...nextFields } : r)) : prev
    );
    // Revert the optimistic update and say why, rather than silently snapping back.
    const revert = (message: string) => {
      setRoster((prev) =>
        prev
          ? prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, attended: entry.attended, noShow: entry.noShow } : r))
          : prev
      );
      toast.error(message);
    };

    try {
      const result = await markAttendanceStatus(entry.bookingId, next);
      if (!result.ok) revert(result.error);
    } catch (err) {
      revert(err instanceof Error ? err.message : 'Could not update attendance');
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(null);
            setRoster(null);
          }}
        >
          &larr; Back to schedule
        </Button>
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">
          {selected.className} — {selected.date}
        </h3>
        {loading && <p className="text-sm text-zinc-500">Loading roster…</p>}
        {!loading && (roster ?? []).length === 0 && (
          <EmptyState icon={UserX} title="Nobody booked in" hint="No clients have booked this class occurrence." />
        )}
        {!loading && (roster ?? []).length > 0 && (
          <div className="space-y-2">
            {(roster ?? []).map((entry) => (
              <div
                key={entry.bookingId}
                className="flex items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={entry.clientName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.clientName}</p>
                    <p className="text-xs text-zinc-500">{entry.status}</p>
                  </div>
                </div>
                <Button variant={STATUS_META[statusOf(entry)].variant} size="sm" onClick={() => cycleStatus(entry)}>
                  {statusOf(entry) === 'attended' && <Check className="mr-1 inline h-3.5 w-3.5" />}
                  {statusOf(entry) === 'no_show' && <X className="mr-1 inline h-3.5 w-3.5" />}
                  {STATUS_META[statusOf(entry)].label}
                </Button>
              </div>
            ))}
          </div>
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
        <div className="space-y-2">
          {dayOccurrences.map((occ) => (
            <button
              key={`${occ.classId}-${occ.date}`}
              onClick={() => openOccurrence(occ)}
              className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.02)] transition-colors hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
            >
              <span className="text-sm font-semibold text-black dark:text-zinc-50">
                {occ.className}
                {occ.startTime ? ` ${occ.startTime.slice(0, 5)}` : ''}
              </span>
              <span className="text-xs text-zinc-500">
                {occ.bookedCount}/{occ.capacity} booked
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Ban, CalendarDays, Check, UserX, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Button } from '@/app/_components/Button';
import { ClassCalendar } from '@/app/_components/ClassCalendar';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { cancelClassOccurrence, getRoster, markAttendanceStatus } from '@/lib/data/classes';
import { formatClassTime } from '@/lib/utils/dates';
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

const STATUS_META: Record<AttendanceStatus, { label: string; cls: string }> = {
  unmarked: { label: 'Mark attended', cls: 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
  attended: { label: 'Attended', cls: 'bg-success/10 text-success' },
  no_show: { label: 'No-show', cls: 'bg-danger/10 text-danger' },
};

function occKey(o: ScheduleOccurrence): string {
  return `${o.classId}|${o.date}`;
}

function formatDateLabel(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Time only -- the calendar day picker already establishes the date, so a same-day occurrence
// only needs to be disambiguated by time (and name, when a day mixes different classes).
function formatOccurrenceLabel(o: ScheduleOccurrence): string {
  const timeLabel = formatClassTime(o.startTime);
  return `${o.className}${timeLabel ? ` · ${timeLabel}` : ''}`;
}

export function AttendanceScheduler({ occurrences }: { occurrences: ScheduleOccurrence[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run: runCancel, busy: cancelling } = useAction();
  // Picking a day is the primary nav (a calendar, not a flat list of every upcoming
  // occurrence across every date at once -- that wall of chips is what made this screen
  // unusable once a single class started running several times a day). Defaults to the
  // earliest upcoming date that actually has a class, so the screen isn't empty on load.
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => [...occurrences].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]?.date ?? null
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const dayOccurrences = [...occurrences]
    .filter((o) => o.date === selectedDate)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const selected = occurrences.find((o) => occKey(o) === selectedKey) ?? null;

  async function openOccurrence(occ: ScheduleOccurrence) {
    setSelectedKey(occKey(occ));
    setLoading(true);
    try {
      const r = await getRoster(occ.classId, occ.date);
      setRoster(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the roster');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedKey(null);
    setRoster(null);
    // Only one class that day -- open its roster straight away, same zero-extra-click feel
    // as before. With more than one, an explicit pick avoids guessing which time was meant.
    const dayOccs = occurrences.filter((o) => o.date === date);
    if (dayOccs.length === 1) void openOccurrence(dayOccs[0]);
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

  async function handleCancelOccurrence() {
    if (!selected) return;
    const ok = await confirm({
      title: `Cancel ${selected.className} on ${formatDateLabel(selected.date)}?`,
      body: 'Every booked client is refunded and notified. This only cancels this one date -- the rest of the recurring class is unaffected.',
      confirmLabel: 'Cancel occurrence',
      destructive: true,
    });
    if (!ok) return;
    await runCancel(
      async () => {
        const result = await cancelClassOccurrence(selected.classId, selected.date);
        if (result.ok) {
          setSelectedKey(null);
          setRoster(null);
        }
        return result;
      },
      { success: 'Occurrence cancelled' }
    );
  }

  if (occurrences.length === 0) {
    return (
      <EmptyState
        icon={UserX}
        title="No upcoming classes"
        hint="Add a class under Manage and its occurrences will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ClassCalendar occurrences={occurrences} selectedDate={selectedDate} onSelectDate={handleSelectDate} />

      {selectedDate && dayOccurrences.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {dayOccurrences.map((occ) => {
            const isActive = occKey(occ) === selectedKey;
            return (
              <button
                key={occKey(occ)}
                type="button"
                onClick={() => openOccurrence(occ)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#141414] text-white'
                    : 'border border-black/10 text-zinc-700 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
                }`}
              >
                {formatOccurrenceLabel(occ)}
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && dayOccurrences.length === 0 && (
        <EmptyState icon={CalendarDays} title="No classes that day" compact />
      )}

      {selected && !loading && (
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={handleCancelOccurrence} disabled={cancelling} className="flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Cancel this occurrence
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500">Loading roster…</p>}
      {!loading && selected && (roster ?? []).length === 0 && (
        <EmptyState icon={UserX} title="Nobody booked in" hint="No clients have booked this class occurrence." />
      )}
      {!loading && (roster ?? []).length > 0 && (
        <div className="space-y-2">
          {(roster ?? []).map((entry) => (
            <div
              key={entry.bookingId}
              className="flex items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={entry.clientName} size="sm" />
                <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => cycleStatus(entry)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${STATUS_META[statusOf(entry)].cls}`}
              >
                {statusOf(entry) === 'attended' && <Check className="mr-1 inline h-3.5 w-3.5" />}
                {statusOf(entry) === 'no_show' && <X className="mr-1 inline h-3.5 w-3.5" />}
                {STATUS_META[statusOf(entry)].label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Ban, Check, UserX, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { cancelClassOccurrence, getRoster, markAttendanceStatus } from '@/lib/data/classes';
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

function formatChipLabel(o: ScheduleOccurrence): string {
  const dateLabel = new Date(o.date + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${dateLabel} · ${o.className}`;
}

export function AttendanceScheduler({ occurrences }: { occurrences: ScheduleOccurrence[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run: runCancel, busy: cancelling } = useAction();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Auto-select the soonest upcoming occurrence so the roster is visible without an extra
  // click, matching the design (first chip shown already active). Only reacts to the
  // occurrences prop itself, not to openOccurrence's identity -- same narrow-deps exception
  // used by WorkoutTab.tsx's focusDay effect.
  useEffect(() => {
    // Reacting to an external signal (the initial occurrences list arriving), not
    // synchronizing with an external system -- the standard justified exception used
    // elsewhere in the app (see WorkoutTab.tsx's focusDay effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (occurrences.length > 0) void openOccurrence(occurrences[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrences]);

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
      title: `Cancel ${selected.className} on ${formatChipLabel(selected).split(' · ')[0]}?`,
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
      <div className="flex flex-wrap gap-2">
        {occurrences.map((occ) => {
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
              {formatChipLabel(occ)}
            </button>
          );
        })}
      </div>

      {selected && !loading && (
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={handleCancelOccurrence} disabled={cancelling} className="flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Cancel this occurrence
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500">Loading roster…</p>}
      {!loading && (roster ?? []).length === 0 && (
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

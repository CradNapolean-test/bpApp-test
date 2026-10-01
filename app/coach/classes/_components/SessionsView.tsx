'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarDays, Check, UserPlus, UserX, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { bookClassForClient, cancelClassOccurrence, getRoster, markAttendanceStatus, removeFromSession } from '@/lib/data/classes';
import { formatClassTime, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { AttendanceStatus, RosterEntry, ScheduleOccurrence } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

// The coach's live view of the gym: pick a day, see every session with how full it is, tap one to
// open its roster (mark attended / no-show, add a client, cancel that one date). Replaces the old
// separate Schedule-list + Attendance screens so there is one place to look at "what's on".

const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = { unmarked: 'attended', attended: 'no_show', no_show: 'unmarked' };

const STATUS_META: Record<AttendanceStatus, { label: string; cls: string }> = {
  unmarked: { label: 'Mark attended', cls: 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
  attended: { label: 'Attended', cls: 'bg-success/10 text-success' },
  no_show: { label: 'No-show', cls: 'bg-danger/10 text-danger' },
};

const statusOf = (e: RosterEntry): AttendanceStatus => (e.attended ? 'attended' : e.noShow ? 'no_show' : 'unmarked');
const occKey = (o: ScheduleOccurrence) => `${o.classId}|${o.date}`;
const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

function localTodayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function longDay(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function SessionsView({
  occurrences,
  clients,
  initialTarget = null,
}: {
  occurrences: ScheduleOccurrence[];
  clients: CoachClientRow[];
  // Open straight onto one session (from a dashboard link).
  initialTarget?: { date: string; classId: string } | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run: runCancel, busy: cancelling } = useAction();
  const { run: runRemove, busy: removing } = useAction();
  const [removeEntry, setRemoveEntry] = useState<RosterEntry | null>(null);
  const { run: runBook, busy: booking } = useAction();

  const todayIso = localTodayIso();
  const dates = useMemo(() => [...new Set(occurrences.map((o) => o.date))].sort(), [occurrences]);
  const [pickedDate, setPickedDate] = useState<string | null>(initialTarget?.date ?? null);
  const selectedDate = pickedDate && dates.includes(pickedDate) ? pickedDate : (dates.find((d) => d >= todayIso) ?? dates[dates.length - 1] ?? null);

  // Keep the selected day centred in the strip (it starts at the oldest session, weeks back).
  const activeChip = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeChip.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  const [openKey, setOpenKey] = useState<string | null>(initialTarget ? `${initialTarget.classId}|${initialTarget.date}` : null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(!!initialTarget);
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState('');

  const open = occurrences.find((o) => occKey(o) === openKey) ?? null;
  const daySessions = occurrences.filter((o) => o.date === selectedDate).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const needsMarking = occurrences
    .filter((o) => (o.unmarkedCount ?? 0) > 0)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));

  async function openSession(occ: ScheduleOccurrence) {
    setOpenKey(occKey(occ));
    setRoster(null);
    setAdding(false);
    setClientId('');
    setLoading(true);
    try {
      setRoster(await getRoster(occ.classId, occ.date));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the roster');
    } finally {
      setLoading(false);
    }
  }

  // Arriving from a dashboard link: the sheet starts open on that session and its roster loads once.
  useEffect(() => {
    if (!initialTarget) return;
    getRoster(initialTarget.classId, initialTarget.date)
      .then(setRoster)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not load the roster'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeSheet() {
    setOpenKey(null);
    setRoster(null);
  }

  async function cycle(entry: RosterEntry) {
    const next = NEXT_STATUS[statusOf(entry)];
    const fields = { attended: next === 'attended', noShow: next === 'no_show' };
    setRoster((prev) => prev && prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, ...fields } : r)));
    const revert = (message: string) => {
      setRoster((prev) => prev && prev.map((r) => (r.bookingId === entry.bookingId ? { ...r, attended: entry.attended, noShow: entry.noShow } : r)));
      toast.error(message);
    };
    try {
      const result = await markAttendanceStatus(entry.bookingId, next);
      if (!result.ok) revert(result.error);
    } catch (err) {
      revert(err instanceof Error ? err.message : 'Could not update attendance');
    }
  }

  async function addClient() {
    if (!open || !clientId) return;
    await runBook(
      async () => {
        const result = await bookClassForClient(open.classId, clientId, open.date);
        if (result.ok) {
          setAdding(false);
          setClientId('');
          await openSession(open);
        }
        return result;
      },
      { success: 'Client added' }
    );
  }

  async function removeMember(refund: boolean) {
    if (!removeEntry || !open) return;
    const entry = removeEntry;
    await runRemove(() => removeFromSession(entry.bookingId, refund), {
      success: refund ? `${entry.clientName} removed and refunded` : `${entry.clientName} removed`,
      onDone: async () => {
        setRemoveEntry(null);
        setRoster(await getRoster(open.classId, open.date));
      },
    });
  }

  async function cancelOccurrence() {
    if (!open) return;
    const ok = await confirm({
      title: `Cancel ${open.className} on ${longDay(open.date)}?`,
      body: 'Every booked client is refunded and notified. This only cancels this one date -- the weekly session is unaffected.',
      confirmLabel: 'Cancel this date',
      destructive: true,
    });
    if (!ok) return;
    await runCancel(() => cancelClassOccurrence(open.classId, open.date), { success: 'Session cancelled', onDone: closeSheet });
  }

  if (occurrences.length === 0) {
    return <EmptyState icon={CalendarDays} title="No upcoming sessions" hint="Add sessions under Timetable and they'll appear here." />;
  }

  const bookedIds = new Set((roster ?? []).map((r) => r.clientId));
  const addable = clients.filter((c) => !bookedIds.has(c.id));
  const isPast = (o: ScheduleOccurrence) => o.date < todayIso;

  return (
    <div className="space-y-4">
      {needsMarking.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setPickedDate(needsMarking[0].date);
            void openSession(needsMarking[0]);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-black dark:text-zinc-50">
            {needsMarking.length} past {needsMarking.length === 1 ? 'session needs' : 'sessions need'} marking
          </span>
          <span className="shrink-0 text-xs font-bold text-warning">Mark now</span>
        </button>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {dates.map((d) => {
          const dt = parseDay(d);
          const active = d === selectedDate;
          const past = d < todayIso;
          const unmarked = occurrences.some((o) => o.date === d && (o.unmarkedCount ?? 0) > 0);
          return (
            <button
              key={d}
              ref={active ? activeChip : undefined}
              type="button"
              onClick={() => setPickedDate(d)}
              aria-pressed={active}
              className={`flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-colors ${
                active
                  ? 'border-accent bg-accent text-accent-foreground'
                  : past
                    ? 'border-transparent text-zinc-400 dark:text-zinc-600'
                    : 'border-black/[.06] bg-card text-black dark:border-white/10 dark:text-zinc-100'
              }`}
            >
              <span className="text-[11px] font-bold uppercase opacity-80">{WEEKDAY_SHORT[dt.getUTCDay()]}</span>
              <span className="text-base font-black leading-none">{dt.getUTCDate()}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${unmarked ? 'bg-warning' : d === todayIso ? (active ? 'bg-accent-foreground' : 'bg-accent') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <p className="px-1 text-sm font-extrabold text-black dark:text-zinc-50">
          {selectedDate === todayIso ? 'Today · ' : ''}
          {longDay(selectedDate)}
        </p>
      )}

      <div className="space-y-2">
        {daySessions.map((o) => {
          const full = o.bookedCount >= o.capacity;
          const fill = Math.min(100, Math.round((o.bookedCount / o.capacity) * 100));
          const toMark = o.unmarkedCount ?? 0;
          return (
            <button
              key={occKey(o)}
              type="button"
              onClick={() => openSession(o)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-card p-3.5 text-left dark:border-white/10"
            >
              <span className="min-w-0">
                <span className="block text-lg font-extrabold leading-tight text-black dark:text-zinc-50">{formatClassTime(o.startTime)}</span>
                <span className="block truncate text-xs text-zinc-500">{o.className}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`text-sm font-bold ${full ? 'text-danger' : 'text-black dark:text-zinc-50'}`}>
                  {o.bookedCount}
                  <span className="font-medium text-zinc-500"> / {o.capacity}</span>
                </span>
                <span className="h-1 w-16 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <span className={`block h-full rounded-full ${full ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${fill}%` }} />
                </span>
                {toMark > 0 ? (
                  <span className="text-[11px] font-bold text-warning">{toMark} to mark</span>
                ) : isPast(o) && o.bookedCount > 0 ? (
                  <span className="text-[11px] font-semibold text-success">Marked</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {daySessions.length === 0 && <EmptyState icon={CalendarDays} title="No sessions this day" compact />}
      </div>

      {open && (
        <BottomSheet title={`${formatClassTime(open.startTime)} · ${open.className}`} onClose={closeSheet}>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">
            {longDay(open.date)} · {open.bookedCount} of {open.capacity} booked
          </p>

          {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading roster…</p>}

          {!loading && roster && roster.length === 0 && (
            <div className="py-6 text-center">
              <UserX className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
              <p className="text-sm font-semibold text-black dark:text-zinc-50">Nobody booked in</p>
            </div>
          )}

          {!loading && roster && roster.length > 0 && (
            <div className="space-y-2">
              {roster.map((entry) => {
                const st = statusOf(entry);
                const waitlisted = entry.status === 'waitlist';
                return (
                  <div key={entry.bookingId} className="flex items-center justify-between gap-2.5 rounded-xl border border-black/[.05] p-2.5 dark:border-white/10">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={entry.clientName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.clientName}</p>
                        {waitlisted && <p className="text-[11px] font-semibold text-warning">Waitlist</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${entry.clientName} from this session`}
                      onClick={() => setRemoveEntry(entry)}
                      className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:text-danger"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                    {!waitlisted && (
                      <button
                        type="button"
                        onClick={() => cycle(entry)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold ${STATUS_META[st].cls}`}
                      >
                        {st === 'attended' && <Check className="h-3.5 w-3.5" />}
                        {st === 'no_show' && <X className="h-3.5 w-3.5" />}
                        {STATUS_META[st].label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && roster && (
            <div className="mt-4 space-y-3">
              {adding ? (
                addable.length === 0 ? (
                  <p className="text-sm text-zinc-500">Every client is already booked or waitlisted.</p>
                ) : (
                  <div className="flex gap-2">
                    <select value={clientId} onChange={(e) => setClientId(e.target.value)} autoFocus className={`${inputCls} min-w-0 flex-1`}>
                      <option value="">Select a client…</option>
                      {addable.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ?? c.email}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!clientId || booking}
                      onClick={addClient}
                      className="shrink-0 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground disabled:opacity-50"
                    >
                      {booking ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground"
                >
                  <UserPlus className="h-4 w-4" /> Add a client
                </button>
              )}
              {!isPast(open) && (
                <button
                  type="button"
                  onClick={cancelOccurrence}
                  disabled={cancelling}
                  className="flex w-full items-center justify-center gap-1.5 py-1 text-sm font-semibold text-danger disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" /> Cancel this session
                </button>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {removeEntry && (
        <BottomSheet title={`Remove ${removeEntry.clientName}?`} onClose={() => setRemoveEntry(null)}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              They are taken off this session and told. Choose whether their credit goes back.
            </p>
            <button
              type="button"
              disabled={removing}
              onClick={() => removeMember(true)}
              className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
            >
              Remove and refund the credit
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={() => removeMember(false)}
              className="w-full rounded-full border border-black/10 py-3 text-sm font-bold text-zinc-700 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200"
            >
              Remove, no refund
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Ban, CalendarDays, Check, RotateCcw, UserPlus, UserX, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { bookClassForClient, cancelClassOccurrence, getRoster, markAttendanceStatus, removeFromSession, restoreClassOccurrence } from '@/lib/data/classes';
import { DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { AttendanceStatus, RosterEntry, ScheduleOccurrence } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

// The coach's live view of the gym: pick a day, see every session with how full it is, tap one to
// open its roster (mark attended / no-show, add a client, cancel that one date). Replaces the old
// separate Schedule-list + Attendance screens so there is one place to look at "what's on".

const statusOf = (e: RosterEntry): AttendanceStatus => (e.attended ? 'attended' : e.noShow ? 'no_show' : 'unmarked');
const occKey = (o: ScheduleOccurrence) => `${o.classId}|${o.date}`;
const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

function longDay(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function SessionsView({
  occurrences,
  clients,
  timezone,
  initialTarget = null,
}: {
  occurrences: ScheduleOccurrence[];
  clients: CoachClientRow[];
  // The gym's timezone, so "today" is the gym's today rather than the device's.
  timezone?: string | null;
  // Open straight onto one session (from a dashboard link).
  initialTarget?: { date: string; classId: string } | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { run: runCancel, busy: cancelling } = useAction();
  const { run: runRemove, busy: removing } = useAction();
  const [removeEntry, setRemoveEntry] = useState<RosterEntry | null>(null);
  const { run: runBook, busy: booking } = useAction();

  const todayIso = todayIsoInTz(timezone ?? DEFAULT_TIMEZONE);
  const dates = useMemo(() => [...new Set(occurrences.map((o) => o.date))].sort(), [occurrences]);
  const [pickedDate, setPickedDate] = useState<string | null>(initialTarget?.date ?? null);
  const defaultDate = dates.find((d) => d >= todayIso) ?? dates[dates.length - 1] ?? null;
  const selectedDate = pickedDate && dates.includes(pickedDate) ? pickedDate : defaultDate;

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
  const [search, setSearch] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const { run: runRestore, busy: restoring } = useAction();

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
    setSearch('');
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

  // Tap a status to set it; tap it again to clear it back to unmarked.
  async function setStatus(entry: RosterEntry, pick: 'attended' | 'no_show') {
    const next: AttendanceStatus = statusOf(entry) === pick ? 'unmarked' : pick;
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

  // Everyone still unmarked on a booked place is marked attended in one go.
  async function markAllAttended() {
    const todo = (roster ?? []).filter((r) => r.status === 'booked' && statusOf(r) === 'unmarked');
    if (todo.length === 0) return;
    setRoster((prev) => prev && prev.map((r) => (todo.some((t) => t.bookingId === r.bookingId) ? { ...r, attended: true, noShow: false } : r)));
    const results = await Promise.allSettled(todo.map((t) => markAttendanceStatus(t.bookingId, 'attended')));
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
    if (failed > 0) {
      toast.error(`${failed} could not be marked`);
      if (open) setRoster(await getRoster(open.classId, open.date));
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
          setSearch('');
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
    await runCancel(() => cancelClassOccurrence(open.classId, open.date, cancelReason), {
      success: 'Session cancelled',
      onDone: () => {
        setCancelOpen(false);
        setCancelReason('');
        closeSheet();
      },
    });
  }

  async function restoreOccurrence() {
    if (!open) return;
    const ok = await confirm({
      title: `Put ${open.className} back on ${longDay(open.date)}?`,
      body: 'Members can book it again. Anyone who was booked was refunded when it was cancelled and has to book again themselves.',
      confirmLabel: 'Restore session',
    });
    if (!ok) return;
    await runRestore(() => restoreClassOccurrence(open.classId, open.date), { success: 'Session restored', onDone: closeSheet });
  }

  if (occurrences.length === 0) {
    return <EmptyState icon={CalendarDays} title="No upcoming sessions" hint="Add sessions under Timetable and they'll appear here." />;
  }

  const active = (roster ?? []).filter((r) => r.status !== 'cancelled');
  const cancelledEntries = (roster ?? []).filter((r) => r.status === 'cancelled');
  const unmarkedBooked = active.filter((r) => r.status === 'booked' && statusOf(r) === 'unmarked').length;
  // Only today's and earlier sessions can be marked attended in bulk -- a future class has not happened yet.
  const canMarkAll = !!open && open.date <= todayIso;
  const bookedIds = new Set(active.map((r) => r.clientId));
  const addable = clients.filter((c) => !bookedIds.has(c.id));
  const chosenClient = addable.find((c) => c.id === clientId) ?? null;
  const term = search.trim().toLowerCase();
  const matches = addable
    .filter((c) => !term || (c.name ?? '').toLowerCase().includes(term) || c.email.toLowerCase().includes(term))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
    .slice(0, 20);
  const sessionFull = !!open && open.bookedCount >= open.capacity;
  const noCredits = !!open && !!chosenClient && chosenClient.balance < open.creditCost;
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
        <div className="flex items-center justify-between gap-2">
          <p className="px-1 text-sm font-extrabold text-black dark:text-zinc-50">
            {selectedDate === todayIso ? 'Today · ' : ''}
            {longDay(selectedDate)}
          </p>
          {selectedDate !== defaultDate && (
            <button type="button" onClick={() => setPickedDate(null)} className="shrink-0 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-accent dark:border-white/15">
              Today
            </button>
          )}
        </div>
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
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-card p-3.5 text-left dark:border-white/10 ${o.cancelled ? 'opacity-60' : ''}`}
            >
              <span className="min-w-0">
                <span className={`block text-lg font-extrabold leading-tight text-black dark:text-zinc-50 ${o.cancelled ? 'line-through' : ''}`}>{formatClassTime(o.startTime)}</span>
                <span className="block truncate text-xs text-zinc-500">{o.className}</span>
                {o.cancelled && o.cancelReason && <span className="mt-0.5 block truncate text-xs text-zinc-500">{o.cancelReason}</span>}
              </span>
              {o.cancelled ? (
                <span className="shrink-0 rounded-full bg-danger/10 px-3 py-1 text-xs font-bold text-danger">Cancelled</span>
              ) : (
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
              )}
            </button>
          );
        })}
        {daySessions.length === 0 && <EmptyState icon={CalendarDays} title="No sessions this day" compact />}
      </div>

      {open && (
        <BottomSheet title={`${formatClassTime(open.startTime)} · ${open.className}`} onClose={closeSheet}>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">
            {longDay(open.date)}
            {open.cancelled ? ' · Cancelled' : ` · ${open.bookedCount} of ${open.capacity} booked`}
          </p>
          {open.cancelled && open.cancelReason && <p className="mb-3 rounded-xl bg-black/5 px-3 py-2 text-sm text-zinc-700 dark:bg-white/10 dark:text-zinc-200">Reason: {open.cancelReason}</p>}

          {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading roster…</p>}

          {!loading && roster && active.length === 0 && !open.cancelled && (
            <div className="py-6 text-center">
              <UserX className="mx-auto mb-2 h-6 w-6 text-zinc-400" />
              <p className="text-sm font-semibold text-black dark:text-zinc-50">Nobody booked in</p>
            </div>
          )}

          {!loading && roster && active.length > 0 && (
            <div className="space-y-2">
              {canMarkAll && unmarkedBooked > 1 && (
                <button
                  type="button"
                  onClick={markAllAttended}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-success/40 bg-success/10 py-2.5 text-sm font-bold text-success"
                >
                  <Check className="h-4 w-4" /> Mark everyone attended ({unmarkedBooked})
                </button>
              )}
              {active.map((entry) => {
                const st = statusOf(entry);
                const waitlisted = entry.status === 'waitlist';
                return (
                  <div key={entry.bookingId} className="rounded-xl border border-black/[.05] p-2.5 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/coach/clients/${entry.clientId}`} className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={entry.clientName} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{entry.clientName}</span>
                          {waitlisted && <span className="block text-[11px] font-semibold text-warning">Waitlist</span>}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setRemoveEntry(entry)}
                        className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                    {!waitlisted && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={st === 'attended'}
                          onClick={() => setStatus(entry, 'attended')}
                          className={`flex items-center justify-center gap-1 rounded-full py-2 text-sm font-semibold ${st === 'attended' ? 'bg-success/15 text-success ring-1 ring-success/40' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}
                        >
                          <Check className="h-3.5 w-3.5" /> Attended
                        </button>
                        <button
                          type="button"
                          aria-pressed={st === 'no_show'}
                          onClick={() => setStatus(entry, 'no_show')}
                          className={`flex items-center justify-center gap-1 rounded-full py-2 text-sm font-semibold ${st === 'no_show' ? 'bg-danger/15 text-danger ring-1 ring-danger/40' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}
                        >
                          <X className="h-3.5 w-3.5" /> No-show
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && roster && cancelledEntries.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500">Cancelled ({cancelledEntries.length})</p>
              <div className="space-y-1.5">
                {cancelledEntries.map((entry) => (
                  <Link
                    key={entry.bookingId}
                    href={`/coach/clients/${entry.clientId}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    <span className="truncate">{entry.clientName}</span>
                    <span className={`shrink-0 text-xs font-bold ${entry.lateCancel ? 'text-danger' : 'text-zinc-400'}`}>{entry.lateCancel ? 'Late cancel' : 'Cancelled, refunded'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!loading && roster && open.cancelled && (
            <button
              type="button"
              onClick={restoreOccurrence}
              disabled={restoring}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Restore this session
            </button>
          )}

          {!loading && roster && !open.cancelled && (
            <div className="mt-4 space-y-3">
              {adding ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setClientId('');
                    }}
                    placeholder="Search members…"
                    className={inputCls}
                  />
                  {!chosenClient &&
                    (matches.length === 0 ? (
                      <p className="px-1 text-sm text-zinc-500">{addable.length === 0 ? 'Every member is already booked or waitlisted.' : 'No member matches.'}</p>
                    ) : (
                      <div className="max-h-52 space-y-1 overflow-y-auto">
                        {matches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClientId(c.id);
                              setSearch(c.name ?? c.email);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <span className="truncate font-semibold text-black dark:text-zinc-50">{c.name ?? c.email}</span>
                            <span className={`shrink-0 text-xs font-bold ${c.balance < open.creditCost ? 'text-danger' : 'text-zinc-500'}`}>
                              {c.balance} credit{c.balance === 1 ? '' : 's'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  {chosenClient && (
                    <>
                      {sessionFull ? (
                        <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">This session is full, so {chosenClient.name ?? 'they'} will join the waitlist (no credit is taken until a place opens).</p>
                      ) : noCredits ? (
                        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                          {chosenClient.name ?? 'They'} only {chosenClient.balance === 1 ? 'has 1 credit' : `has ${chosenClient.balance} credits`} and this session costs {open.creditCost}. Add credits from their profile first.
                        </p>
                      ) : (
                        <p className="px-1 text-xs text-zinc-500">
                          Takes {open.creditCost} credit{open.creditCost === 1 ? '' : 's'} ({chosenClient.balance} available).
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={booking || (noCredits && !sessionFull)}
                        onClick={addClient}
                        className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
                      >
                        {booking ? 'Adding…' : sessionFull ? 'Add to waitlist' : 'Add to session'}
                      </button>
                    </>
                  )}
                </div>
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
                  onClick={() => setCancelOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 py-1 text-sm font-semibold text-danger"
                >
                  <Ban className="h-4 w-4" /> Cancel this session
                </button>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {open && cancelOpen && (
        <BottomSheet title={`Cancel ${open.className}?`} onClose={() => setCancelOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {longDay(open.date)} at {formatClassTime(open.startTime)}. Everyone booked is refunded and told. This only cancels this one date; the weekly session carries on.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Reason for members (optional)</label>
              <input className={inputCls} value={cancelReason} placeholder="e.g. Coach unwell, back next week" onChange={(e) => setCancelReason(e.target.value)} />
            </div>
            <button
              type="button"
              disabled={cancelling}
              onClick={cancelOccurrence}
              className="w-full rounded-full bg-danger py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel this date'}
            </button>
          </div>
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

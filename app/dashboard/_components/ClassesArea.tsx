'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Check, Clock, Info, Ticket } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { Badge, Card, Segmented } from '@/app/_components/ui';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { bookClass, cancelBooking } from '@/lib/data/classes';
import { addDays, DEFAULT_TIMEZONE, formatClassTime, startOfWeek, todayIsoInTz, toIsoDate, WEEKDAY_SHORT } from '@/lib/utils/dates';
import { cancelDeadline, cancelNote, formatClock, nowLocalMs } from '@/lib/utils/cancelDeadline';
import { CheckInButton } from './CheckInButton';
import type { BookingRow, ClientMembershipRow, ScheduleOccurrence, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

// The member's booking screen. Two views -- "Book" (browse a day, tap a session) and "My bookings"
// (what you're in, with cancel) -- and every booking or cancellation goes through a short
// confirmation sheet that shows what it costs, what you'll have left, and the cancel-by time, so
// nothing is one accidental tap.

type View = 'book' | 'mine';

type SheetState =
  | { kind: 'book'; occ: ScheduleOccurrence }
  | { kind: 'cancel'; booking: BookingRow }
  | null;

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

// "Today", "Tomorrow", or "Wed 7 Oct".
function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  if (iso === toIsoDate(addDays(parseDay(todayIso), 1))) return 'Tomorrow';
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function longDay(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right font-semibold ${tone === 'warn' ? 'text-warning' : tone === 'good' ? 'text-success' : 'text-black dark:text-zinc-50'}`}>
        {value}
      </span>
    </div>
  );
}

export function ClassesArea({
  bookings,
  occurrences,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
}: {
  bookings: BookingRow[];
  occurrences: ScheduleOccurrence[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
}) {
  const { run, busy } = useAction();
  const [view, setView] = useState<View>('book');
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showPolicy, setShowPolicy] = useState(false);

  // Must match the timezone dashboardBundle used server-side to resolve booking/occurrence dates
  // (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` is the UTC date, which
  // disagrees with the member's local "today" for roughly half of every day outside UTC.
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const nowMs = nowLocalMs(tz);
  const nextReset = toIsoDate(addDays(startOfWeek(new Date()), 7));

  const advanceDays = membership?.package?.advance_booking_days ?? null;
  const windowDays = advanceDays ?? 13;
  const lastDate = toIsoDate(addDays(parseDay(todayIso), windowDays));

  const activeBookings = useMemo(() => bookings.filter((b) => b.status !== 'cancelled'), [bookings]);
  const bookingByKey = useMemo(() => new Map(activeBookings.map((b) => [`${b.class_id}|${b.booking_date}`, b])), [activeBookings]);
  const bookedDates = useMemo(() => new Set(activeBookings.filter((b) => b.status === 'booked').map((b) => b.booking_date)), [activeBookings]);

  const blackoutStart = occurrences[0]?.blackoutStart ?? null;
  const blackoutEnd = occurrences[0]?.blackoutEnd ?? null;
  const cutoffHours = occurrences[0]?.cutoffHours ?? 3;

  function startMs(date: string, startTime: string | null): number {
    const [h, m] = (startTime ?? '00:00').split(':').map(Number);
    return Date.parse(`${date}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
  }

  // Only sessions still ahead of us and inside this member's booking window are offered.
  const bookable = occurrences.filter((o) => startMs(o.date, o.startTime) > nowMs && o.date <= lastDate);
  const sessionDates = new Set(bookable.map((o) => o.date));
  // Every day in the window, not just days with sessions -- it reads like a calendar, and a day
  // with nothing on is shown dimmed rather than silently missing.
  const days = Array.from({ length: windowDays + 1 }, (_, i) => toIsoDate(addDays(parseDay(todayIso), i)));
  const firstWithSessions = days.find((d) => sessionDates.has(d)) ?? days[0];
  const selectedDate = pickedDate && days.includes(pickedDate) ? pickedDate : firstWithSessions;

  const dayOccurrences = bookable
    .filter((o) => o.date === selectedDate)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const morning = dayOccurrences.filter((o) => (o.startTime ?? '00:00') < '12:00');
  const evening = dayOccurrences.filter((o) => (o.startTime ?? '00:00') >= '12:00');

  const upcoming = activeBookings
    .filter((b) => b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')));

  const policyText =
    blackoutStart && blackoutEnd
      ? `Cancel at least ${cutoffHours} hours before a session to keep your credit. Overnight (${formatClock(blackoutStart.slice(0, 5))}–${formatClock(blackoutEnd.slice(0, 5))}) doesn't count, so for early-morning sessions, cancel by ${formatClock(blackoutStart.slice(0, 5))} the night before.`
      : `Cancel at least ${cutoffHours} hours before a session to keep your credit.`;

  // ---- actions --------------------------------------------------------------------------------

  async function confirmBook(occ: ScheduleOccurrence) {
    const full = occ.bookedCount >= occ.capacity;
    await run(() => bookClass(occ.classId, occ.date), {
      success: full ? `You're on the waitlist for ${formatClassTime(occ.startTime)}` : `Booked — ${dayLabel(occ.date, todayIso)} at ${formatClassTime(occ.startTime)}`,
      onDone: () => setSheet(null),
    });
  }

  async function confirmCancel(b: BookingRow) {
    await run(() => cancelBooking(b.id), {
      success: b.status === 'waitlist' ? 'Left the waitlist' : 'Booking cancelled',
      onDone: () => setSheet(null),
    });
  }

  // ---- rendering ------------------------------------------------------------------------------

  function renderSlot(occ: ScheduleOccurrence) {
    const key = `${occ.classId}|${occ.date}`;
    const existing = bookingByKey.get(key);
    const spots = occ.capacity - occ.bookedCount;
    const full = spots <= 0;
    const booked = existing?.status === 'booked';
    const waitlisted = existing?.status === 'waitlist';
    const fill = Math.min(100, Math.round((occ.bookedCount / occ.capacity) * 100));

    let action: React.ReactNode;
    if (booked && existing) {
      action = (
        <button
          type="button"
          onClick={() => setSheet({ kind: 'cancel', booking: existing })}
          className="flex items-center gap-1.5 rounded-full bg-success/15 px-3.5 py-2 text-sm font-bold text-success"
        >
          <Check className="h-4 w-4" /> Booked
        </button>
      );
    } else if (waitlisted && existing) {
      action = (
        <button
          type="button"
          onClick={() => setSheet({ kind: 'cancel', booking: existing })}
          className="rounded-full bg-warning/15 px-3.5 py-2 text-sm font-bold text-warning"
        >
          On waitlist
        </button>
      );
    } else {
      action = (
        <button
          type="button"
          onClick={() => setSheet({ kind: 'book', occ })}
          className={`rounded-full px-5 py-2 text-sm font-bold ${
            full ? 'border border-warning/40 text-warning' : 'bg-accent text-accent-foreground'
          }`}
        >
          {full ? 'Waitlist' : 'Book'}
        </button>
      );
    }

    return (
      <div
        key={key}
        className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 ${
          booked ? 'border-success/30 bg-success/5' : 'border-black/[.06] bg-card dark:border-white/10'
        }`}
      >
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight text-black dark:text-zinc-50">{formatClassTime(occ.startTime)}</p>
          <p className="truncate text-xs text-zinc-500">{occ.className}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1 w-14 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <span className={`block h-full rounded-full ${full ? 'bg-danger' : spots <= 3 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${fill}%` }} />
            </span>
            <span className={`text-xs font-semibold ${full ? 'text-danger' : spots <= 3 ? 'text-warning' : 'text-zinc-500'}`}>
              {full ? 'Full' : `${spots} left`}
            </span>
          </div>
        </div>
        {action}
      </div>
    );
  }

  const bookSheet = sheet?.kind === 'book' ? sheet.occ : null;
  const cancelSheet = sheet?.kind === 'cancel' ? sheet.booking : null;

  return (
    <div className="space-y-4">
      <Card tone="accent" className="flex items-center justify-between !px-4 !py-3">
        <div className="flex items-center gap-3">
          <Ticket className="h-5 w-5 text-accent" />
          <div>
            <p className="text-2xl font-black leading-none text-accent">{creditsBalance}</p>
            <p className="text-xs text-zinc-500">credit{creditsBalance === 1 ? '' : 's'} left</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-black dark:text-zinc-50">{membership?.package?.name ?? 'No membership'}</p>
          {membership?.package && (
            <p className="text-xs text-zinc-500">
              {membership.package.credits_per_week}/week · resets{' '}
              {parseDay(nextReset).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
            </p>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Segmented<View>
          label="Booking view"
          value={view}
          onChange={setView}
          options={[
            { value: 'book', label: 'Book a session' },
            { value: 'mine', label: upcoming.length > 0 ? `My bookings (${upcoming.length})` : 'My bookings' },
          ]}
        />
        <button
          type="button"
          onClick={() => setShowPolicy((v) => !v)}
          aria-expanded={showPolicy}
          aria-label="Cancellation policy"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-zinc-500 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {showPolicy && (
        <div className="flex gap-2.5 rounded-2xl border border-black/[.06] bg-card-muted p-3.5 text-xs leading-relaxed text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>{policyText}</p>
        </div>
      )}

      {view === 'book' && (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 px-1 text-xs font-semibold text-zinc-500">
              {parseDay(selectedDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map((d) => {
                const dt = parseDay(d);
                const active = d === selectedDate;
                const hasSessions = sessionDates.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPickedDate(d)}
                    aria-pressed={active}
                    className={`relative flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-colors ${
                      active
                        ? 'border-accent bg-accent text-accent-foreground'
                        : hasSessions
                          ? 'border-black/[.06] bg-card text-black dark:border-white/10 dark:text-zinc-100'
                          : 'border-transparent text-zinc-400 dark:text-zinc-600'
                    }`}
                  >
                    <span className="text-[11px] font-bold uppercase opacity-80">{WEEKDAY_SHORT[dt.getUTCDay()]}</span>
                    <span className="text-base font-black leading-none">{dt.getUTCDate()}</span>
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${bookedDates.has(d) ? (active ? 'bg-accent-foreground' : 'bg-accent') : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <p className="px-1 text-sm font-extrabold text-black dark:text-zinc-50">{dayLabel(selectedDate, todayIso)}</p>

          {dayOccurrences.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={occurrences.length === 0 ? 'No sessions scheduled' : 'Nothing on this day'}
              hint={occurrences.length === 0 ? 'Check back once your coach adds sessions.' : 'Pick another day above — days with sessions are brighter.'}
              compact
            />
          ) : (
            <div className="space-y-4">
              {morning.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">Morning</p>
                  {morning.map(renderSlot)}
                </div>
              )}
              {evening.length > 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">Afternoon &amp; evening</p>
                  {evening.map(renderSlot)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'mine' && (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <div className="space-y-3">
              <EmptyState icon={Ticket} title="No upcoming bookings" hint="Book a session and it will show up here." />
              <button type="button" onClick={() => setView('book')} className="mx-auto block rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground">
                Book a session
              </button>
            </div>
          ) : (
            upcoming.map((b, i) => {
              const waitlisted = b.status === 'waitlist';
              const deadline = !waitlisted && b.class ? cancelDeadline(b.booking_date, b.class.start_time, b.class.cutoff_hours, blackoutStart, blackoutEnd) : null;
              const late = deadline != null && nowMs >= deadline.deadlineMs;
              const showDay = i === 0 || upcoming[i - 1].booking_date !== b.booking_date;
              return (
                <div key={b.id}>
                  {showDay && <p className="mb-1.5 mt-3 px-1 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 first:mt-0">{dayLabel(b.booking_date, todayIso)}</p>}
                  <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-extrabold leading-tight text-black dark:text-zinc-50">{formatClassTime(b.class?.start_time)}</p>
                        <p className="truncate text-xs text-zinc-500">{b.class?.name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={waitlisted ? 'warning' : 'success'}>{waitlisted ? 'Waitlist' : 'Booked'}</Badge>
                        <button
                          type="button"
                          onClick={() => setSheet({ kind: 'cancel', booking: b })}
                          className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-bold text-zinc-700 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                        >
                          {waitlisted ? 'Leave' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                    {deadline && (
                      <p className={`mt-2 text-xs ${late ? 'text-danger' : 'text-zinc-500'}`}>
                        {late ? 'Past the cancel deadline — cancelling now forfeits your credit' : cancelNote(deadline)}
                      </p>
                    )}
                    {!waitlisted && b.booking_date === todayIso && (
                      <div className="mt-2.5">
                        <CheckInButton classRow={b.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} timezone={timezone} date={b.booking_date} attended={b.attended} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {bookSheet && (() => {
        const full = bookSheet.bookedCount >= bookSheet.capacity;
        const cost = bookSheet.creditCost;
        const enough = creditsBalance >= cost;
        const deadline = cancelDeadline(bookSheet.date, bookSheet.startTime, bookSheet.cutoffHours, bookSheet.blackoutStart, bookSheet.blackoutEnd);
        return (
          <BottomSheet title={full ? 'Join the waitlist' : 'Book this session'} onClose={() => setSheet(null)}>
            <div className="divide-y divide-black/5 dark:divide-white/10">
              <SummaryRow label="Session" value={bookSheet.className} />
              <SummaryRow label="When" value={`${longDay(bookSheet.date)} · ${formatClassTime(bookSheet.startTime)}`} />
              {!full && (
                <>
                  <SummaryRow label="Cost" value={`${cost} credit${cost === 1 ? '' : 's'}`} />
                  <SummaryRow
                    label="You'll have left"
                    value={enough ? `${creditsBalance - cost} credit${creditsBalance - cost === 1 ? '' : 's'}` : `Only ${creditsBalance}`}
                    tone={enough ? undefined : 'warn'}
                  />
                </>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              {full
                ? "This session is full. You'll be booked in automatically if a spot opens and you have a credit — nothing is used until then."
                : cancelNote(deadline)}
            </p>
            {!full && !enough && (
              <p className="mt-2 rounded-xl bg-warning/10 p-3 text-xs font-semibold text-warning">
                You don&apos;t have enough credits for this session. Ask your coach to top up.
              </p>
            )}
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="flex-1 rounded-full border border-black/10 py-3 text-sm font-bold text-zinc-700 dark:border-white/10 dark:text-zinc-300"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={busy || (!full && !enough)}
                onClick={() => confirmBook(bookSheet)}
                className="flex-[1.4] rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
              >
                {busy ? 'Working…' : full ? 'Join waitlist' : 'Confirm booking'}
              </button>
            </div>
          </BottomSheet>
        );
      })()}

      {cancelSheet && (() => {
        const waitlisted = cancelSheet.status === 'waitlist';
        const deadline = !waitlisted && cancelSheet.class
          ? cancelDeadline(cancelSheet.booking_date, cancelSheet.class.start_time, cancelSheet.class.cutoff_hours, blackoutStart, blackoutEnd)
          : null;
        const late = deadline != null && nowMs >= deadline.deadlineMs;
        return (
          <BottomSheet title={waitlisted ? 'Leave the waitlist?' : 'Cancel this booking?'} onClose={() => setSheet(null)}>
            <div className="divide-y divide-black/5 dark:divide-white/10">
              <SummaryRow label="Session" value={cancelSheet.class?.name ?? 'Session'} />
              <SummaryRow label="When" value={`${longDay(cancelSheet.booking_date)} · ${formatClassTime(cancelSheet.class?.start_time)}`} />
              {!waitlisted && <SummaryRow label="Your credit" value={late ? 'Not refunded' : 'Refunded'} tone={late ? 'warn' : 'good'} />}
            </div>
            <p className={`mt-3 text-xs leading-relaxed ${late ? 'font-semibold text-danger' : 'text-zinc-500'}`}>
              {waitlisted
                ? "You won't be charged anything."
                : late
                  ? "It's too close to the session to get your credit back. You can still cancel, but it won't be refunded."
                  : 'You can cancel now and get your credit back.'}
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="flex-1 rounded-full border border-black/10 py-3 text-sm font-bold text-zinc-700 dark:border-white/10 dark:text-zinc-300"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => confirmCancel(cancelSheet)}
                className="flex-[1.4] rounded-full bg-danger py-3 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : waitlisted ? 'Leave waitlist' : late ? 'Cancel anyway' : 'Cancel booking'}
              </button>
            </div>
          </BottomSheet>
        );
      })()}
    </div>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, MessageSquare, Ticket } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { EmptyState } from '@/app/_components/EmptyState';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { bookClass, cancelBooking, getMemberTimetable } from '@/lib/data/classes';
import { addDays, DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz, toIsoDate, WEEKDAY_SHORT } from '@/lib/utils/dates';
import { bookSheetNote, cancelDeadline, cancelNote, nowLocalMs } from '@/lib/utils/cancelDeadline';
import { cancelSummary, nextResetDate, startMs } from '@/lib/utils/booking';
import { cancellationPolicyText } from '@/lib/bookingRules';
import { CheckInButton } from './CheckInButton';
import { MemberHeader } from './MemberHeader';
import type { HeaderActions } from './MemberHeader';
import AnimatedContent from '@/app/_components/motion/AnimatedContent';
import CountUp from '@/app/_components/motion/CountUp';
import { gsap, prefersReducedMotion, useGSAP } from '@/app/_components/motion/gsap';
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

// "6:00pm" as a big "6:00" over a small "pm".
function TimeColumn({ time }: { time: string | null | undefined }) {
  const text = formatClassTime(time);
  const m = /^(.*?)\s*(am|pm)$/i.exec(text);
  const [big, half] = m ? [m[1], m[2].toLowerCase()] : [text, ''];
  return (
    <div className="w-14 shrink-0">
      <p className="text-lg font-extrabold leading-tight text-black dark:text-zinc-50">{big}</p>
      {half && <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{half}</p>}
    </div>
  );
}

export function ClassesArea({
  clientId,
  bookings,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
  gymBlackout = null,
  header,
}: {
  clientId: string;
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
  // The gym's own overnight window. Without it the screen used to read it from the first scheduled session, which is nothing when the
  // timetable is empty (L5).
  gymBlackout?: { start: string | null; end: string | null } | null;
  // The message bubble and the bell in the header.
  header?: HeaderActions;
}) {
  // The timetable is read when this screen opens (R13/M1: it was 32 KB of every dashboard page), and again after a booking or a cancel.
  const timetable = useOnDemand(() => getMemberTimetable(clientId), clientId);
  const occurrences = useMemo(() => timetable.data ?? [], [timetable.data]);
  const { run, busy } = useAction();
  const [view, setView] = useState<View>('book');
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  // The day chips pop in left to right when the timetable opens.
  const dayStrip = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      // No strip on the My bookings view: without this, the selector would look across the whole page.
      if (!dayStrip.current || prefersReducedMotion()) return;
      gsap.from('[data-chip]', { scale: 0.6, opacity: 0, duration: 0.4, ease: 'back.out(2)', stagger: 0.025, delay: 0.1, clearProps: 'transform,opacity' });
    },
    { scope: dayStrip, dependencies: [view], revertOnUpdate: true }
  );

  // Must match the timezone dashboardBundle used server-side to resolve booking/occurrence dates
  // (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` is the UTC date, which
  // disagrees with the member's local "today" for roughly half of every day outside UTC.
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const nowMs = nowLocalMs(tz);
  // Weekly credits reset on Saturday (migration 0144), the same day the Credits screen and the phone app give (BK2).
  const nextReset = nextResetDate(todayIso);

  const advanceDays = membership?.package?.advance_booking_days ?? null;
  const windowDays = advanceDays ?? 13;
  const lastDate = toIsoDate(addDays(parseDay(todayIso), windowDays));

  const activeBookings = useMemo(() => bookings.filter((b) => b.status !== 'cancelled'), [bookings]);
  const bookingByKey = useMemo(() => new Map(activeBookings.map((b) => [`${b.class_id}|${b.booking_date}`, b])), [activeBookings]);
  const bookedDates = useMemo(() => new Set(activeBookings.filter((b) => b.status === 'booked').map((b) => b.booking_date)), [activeBookings]);

  const blackoutStart = gymBlackout?.start ?? occurrences.find((o) => o.blackoutStart)?.blackoutStart ?? null;
  const blackoutEnd = gymBlackout?.end ?? occurrences.find((o) => o.blackoutEnd)?.blackoutEnd ?? null;

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

  // Each class has its own cut-off; the sentence names one number only when the sessions in front of the member all share it.
  const policyText = cancellationPolicyText({ start: blackoutStart, end: blackoutEnd }, [
    ...occurrences.map((o) => o.cutoffHours),
    ...activeBookings.map((b) => b.class?.cutoff_hours),
  ]);

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

  const tag = 'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-extrabold';
  const tagGood = `${tag} bg-accent-soft text-accent-strong`;
  const tagWarn = `${tag} bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300`;
  // Near-black on the teal: white on this teal is too faint to read.
  const tagBooked = `${tag} bg-accent text-[#041f1f]`;
  const slotBtn = 'flex h-11 shrink-0 items-center rounded-xl px-4 text-sm';
  const outlineBtn = `${slotBtn} border-[1.5px] border-black/20 font-bold text-black hover:bg-black/5 dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5`;
  const slotCard = 'rounded-[18px] border border-black/[.08] bg-card dark:border-white/10';
  const bookedCard = 'rounded-[18px] border-2 border-accent bg-accent-soft';

  function renderSlot(occ: ScheduleOccurrence) {
    const key = `${occ.classId}|${occ.date}`;
    const existing = bookingByKey.get(key);
    const spots = occ.capacity - occ.bookedCount;
    const full = spots <= 0;
    const booked = existing?.status === 'booked';
    const waitlisted = existing?.status === 'waitlist';

    let action: React.ReactNode;
    if ((booked || waitlisted) && existing) {
      action = (
        <button type="button" onClick={() => setSheet({ kind: 'cancel', booking: existing })} className={outlineBtn}>
          {waitlisted ? 'Leave' : 'Cancel'}
        </button>
      );
    } else {
      action = (
        <button type="button" onClick={() => setSheet({ kind: 'book', occ })} className={full ? outlineBtn : `${slotBtn} bg-accent font-extrabold text-[#041f1f]`}>
          {full ? 'Waitlist' : 'Book'}
        </button>
      );
    }

    return (
      <div key={key} className={`flex min-h-[70px] items-center gap-3 py-3 pl-4 pr-3 ${booked ? bookedCard : slotCard}`}>
        <TimeColumn time={occ.startTime} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-black dark:text-zinc-50">{occ.className}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {booked ? (
              <span className={tagBooked}>Booked</span>
            ) : waitlisted ? (
              <span className={tagWarn}>On the waitlist</span>
            ) : (
              <span className={full || spots <= 3 ? tagWarn : tagGood}>{full ? 'Full' : `${spots} left`}</span>
            )}
            {occ.creditCost !== 1 && <span className="text-xs text-zinc-500 dark:text-zinc-400">{occ.creditCost} credits</span>}
          </div>
        </div>
        {action}
      </div>
    );
  }

  const bookSheet = sheet?.kind === 'book' ? sheet.occ : null;
  const cancelSheet = sheet?.kind === 'cancel' ? sheet.booking : null;
  const bookedAhead = upcoming.filter((b) => b.status === 'booked').length;

  return (
    <div className="space-y-4">
      <MemberHeader
        eyebrow={parseDay(todayIso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
        title="Book a session"
        actions={header}
      >
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[.07] px-3.5 py-2.5">
          <p className="text-sm font-semibold text-zinc-200">
            <CountUp to={creditsBalance} className="text-xl font-black text-[#5fd6d6]" delay={0.15} /> credit{creditsBalance === 1 ? '' : 's'} left
          </p>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold">{membership?.package?.name ?? 'No membership'}</p>
            {membership?.package && (
              <p className="text-xs text-zinc-400">
                {membership.package.credits_per_week}/week · resets {parseDay(nextReset).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
              </p>
            )}
          </div>
        </div>

        {view === 'book' && (
          <div className="space-y-2">
            <div ref={dayStrip} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
              {days.map((d) => {
                const dt = parseDay(d);
                const active = d === selectedDate;
                const hasSessions = sessionDates.has(d);
                const isBooked = bookedDates.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPickedDate(d)}
                    aria-pressed={active}
                    aria-label={`${dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${isBooked ? ', booked' : ''}${hasSessions ? '' : ', no sessions'}`}
                    className="flex w-11 shrink-0 flex-col items-center gap-1.5"
                  >
                    <span className={`text-[11px] ${active ? 'font-bold text-zinc-100' : hasSessions ? 'font-semibold text-zinc-400' : 'font-semibold text-zinc-600'}`}>
                      {WEEKDAY_SHORT[dt.getUTCDay()]}
                    </span>
                    <span
                      data-chip
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                        active
                          ? 'bg-zinc-100 font-extrabold text-[#1d1d1b]'
                          : isBooked
                            ? 'border-2 border-accent font-bold text-[#5fd6d6]'
                            : hasSessions
                              ? 'bg-white/[.07] font-semibold text-zinc-200'
                              : 'font-semibold text-zinc-600'
                      }`}
                    >
                      {dt.getUTCDate()}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-400">
              {bookedAhead === 0 ? 'Nothing booked yet.' : `${bookedAhead} session${bookedAhead === 1 ? '' : 's'} booked. The ringed days are yours.`}
            </p>
          </div>
        )}

        <div role="group" aria-label="Booking view" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[.08] p-1">
          {(
            [
              ['book', 'Timetable'],
              ['mine', upcoming.length > 0 ? `My bookings (${upcoming.length})` : 'My bookings'],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`h-11 rounded-xl text-sm ${view === v ? 'bg-zinc-100 font-extrabold text-[#1d1d1b]' : 'font-bold text-zinc-300 hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </MemberHeader>

      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-base font-extrabold text-black dark:text-zinc-50">{view === 'book' ? dayLabel(selectedDate, todayIso) : 'My bookings'}</h2>
        <button type="button" onClick={() => setShowPolicy((v) => !v)} aria-expanded={showPolicy} className="min-h-9 text-[13px] font-bold text-accent-strong">
          Cancellation policy
        </button>
      </div>

      {showPolicy && (
        <div className="flex gap-2.5 rounded-[18px] border border-black/[.08] bg-card-muted p-3.5 text-xs leading-relaxed text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
          <p>{policyText}</p>
        </div>
      )}

      {view === 'book' &&
        (dayOccurrences.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={timetable.data == null ? (timetable.error ? 'Could not load the sessions' : 'Loading sessions…') : occurrences.length === 0 ? 'No sessions scheduled' : 'Nothing on this day'}
            hint={timetable.data == null ? (timetable.error ? 'Check your connection and open this screen again.' : undefined) : occurrences.length === 0 ? 'Check back once your coach adds sessions.' : 'Pick another day above — days with sessions are brighter.'}
            compact
          />
        ) : (
          <div className="space-y-4">
            {/* The cards rise in, one after another, each time a day is picked (the key starts them over). */}
            {morning.length > 0 && (
              <AnimatedContent key={`am-${selectedDate}`} className="space-y-2" distance={16} duration={0.45} stagger={0.05}>
                <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Morning</p>
                {morning.map(renderSlot)}
              </AnimatedContent>
            )}
            {evening.length > 0 && (
              <AnimatedContent key={`pm-${selectedDate}`} className="space-y-2" distance={16} duration={0.45} stagger={0.05} delay={morning.length > 0 ? 0.12 : 0}>
                <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Afternoon &amp; evening</p>
                {evening.map(renderSlot)}
              </AnimatedContent>
            )}
          </div>
        ))}

      {view === 'mine' && (
        <AnimatedContent className="space-y-2" distance={16} duration={0.45} stagger={0.05}>
          {upcoming.length === 0 ? (
            <div className="space-y-3">
              <EmptyState icon={Ticket} title="No upcoming bookings" hint="Book a session and it will show up here." />
              <button type="button" onClick={() => setView('book')} className="mx-auto flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-extrabold text-[#041f1f]">
                Book a session
              </button>
            </div>
          ) : (
            upcoming.map((b, i) => {
              const { waitlisted, late, deadline, refundUntilStart } = cancelSummary(b, nowMs, blackoutStart, blackoutEnd);
              const showDay = i === 0 || upcoming[i - 1].booking_date !== b.booking_date;
              return (
                <div key={b.id}>
                  {showDay && (
                    <p className="mb-1.5 mt-3 px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500 first:mt-0 dark:text-zinc-400">{dayLabel(b.booking_date, todayIso)}</p>
                  )}
                  <div className={`py-3 pl-4 pr-3 ${waitlisted ? slotCard : bookedCard}`}>
                    <div className="flex items-center gap-3">
                      <TimeColumn time={b.class?.start_time} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-black dark:text-zinc-50">{b.class?.name}</p>
                        <div className="mt-1">
                          <span className={waitlisted ? tagWarn : tagBooked}>{waitlisted ? 'On the waitlist' : 'Booked'}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSheet({ kind: 'cancel', booking: b })} className={outlineBtn}>
                        {waitlisted ? 'Leave' : 'Cancel'}
                      </button>
                    </div>
                    {deadline && (
                      <p className={`mt-2 text-xs ${late ? 'font-semibold text-danger' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {refundUntilStart
                          ? 'You came off the waitlist after the cancel deadline: cancel any time before it starts for a full refund'
                          : late
                            ? 'Past the cancel deadline — cancelling now forfeits your credit'
                            : cancelNote(deadline)}
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
        </AnimatedContent>
      )}

      {bookSheet && (() => {
        const full = bookSheet.bookedCount >= bookSheet.capacity;
        const cost = bookSheet.creditCost;
        const enough = creditsBalance >= cost;
        const note = bookSheetNote(
          cancelDeadline(bookSheet.date, bookSheet.startTime, bookSheet.cutoffHours, bookSheet.blackoutStart, bookSheet.blackoutEnd),
          nowMs
        );
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
            <p className={`mt-3 text-xs leading-relaxed ${!full && note.late ? 'font-semibold text-warning' : 'text-zinc-500'}`}>
              {full
                ? "This session is full. You'll be booked in automatically if a spot opens and you have a credit — nothing is used until then."
                : note.text}
            </p>
            {/* Top-ups are manual, so the way on is the coach (BK3). A full page load: the dashboard opens Messages from ?open=messages. */}
            {!full && !enough && (
              <div className="mt-2 rounded-xl bg-warning/10 p-3">
                <p className="text-xs font-semibold text-warning">You don&apos;t have enough credits for this session. Ask your coach to top up.</p>
                <a
                  href="/dashboard?open=messages"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-card px-4 py-2 text-xs font-bold text-black dark:text-zinc-50"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-accent" /> Message your coach
                </a>
              </div>
            )}
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="h-12 flex-1 rounded-xl border-[1.5px] border-black/20 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={busy || (!full && !enough)}
                onClick={() => confirmBook(bookSheet)}
                className="h-12 flex-[1.4] rounded-xl bg-accent text-sm font-extrabold text-accent-foreground disabled:opacity-50"
              >
                {busy ? 'Working…' : full ? 'Join waitlist' : 'Confirm booking'}
              </button>
            </div>
          </BottomSheet>
        );
      })()}

      {cancelSheet && (() => {
        const { waitlisted, late, refundUntilStart } = cancelSummary(cancelSheet, nowMs, blackoutStart, blackoutEnd);
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
                : refundUntilStart
                  ? 'You came off the waitlist after the cancel deadline, so you get your credit back if you cancel any time before it starts.'
                  : late
                    ? "It's too close to the session to get your credit back. You can still cancel, but it won't be refunded."
                    : 'You can cancel now and get your credit back.'}
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="h-12 flex-1 rounded-xl border-[1.5px] border-black/20 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => confirmCancel(cancelSheet)}
                className="h-12 flex-[1.4] rounded-xl bg-danger text-sm font-extrabold text-white disabled:opacity-50"
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

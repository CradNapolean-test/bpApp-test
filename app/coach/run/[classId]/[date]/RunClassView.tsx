'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronLeft, Tv, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { AddToSessionPanel } from '@/app/coach/classes/_components/AddToSessionPanel';
import { RosterMarkers, SessionCoachNote } from '@/app/coach/classes/_components/RosterMarkers';
import { bookClassForClient, grantCreditsAndBook, markAttendanceStatus } from '@/lib/data/classes';
import { getRunClassData, getWalkInCandidates } from '@/lib/data/runClass';
import { exerciseBlockKey, exerciseIsVisible, SECTION_TITLE, usesSections } from '@/lib/workoutSections';
import { describeHistorySets, describePastResult, pastResultsFor } from '@/lib/runClassHistory';
import { sanitiseConfig } from '@/lib/blockScoring';
import { DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz } from '@/lib/utils/dates';
import { ordinal } from '@/lib/utils/bookingWords';
import { lastWeightsOrder } from '@/lib/lastWeightsOrder';
import type { RunClassData, RunClassMember } from '@/lib/data/runClass';
import type { CoachClientRow } from '@/lib/data/coach';
import type { AttendanceStatus, WorkoutExerciseRow } from '@/lib/data/types';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';
import { SmoothScroll } from '@/app/_components/motion/SmoothScroll';
import RollingNumber from '@/app/_components/motion/RollingNumber';
import DrawnTick from '@/app/_components/motion/DrawnTick';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import { pop } from '@/app/_components/motion/gsap';

// The coach's screen while a class is on: tick people in, see who picked what, and see what each member
// lifted on the day's exercises the last few times, so the coach knows roughly what to put on the bar.

const statusOf = (m: { attended: boolean; noShow: boolean }): AttendanceStatus => (m.attended ? 'attended' : m.noShow ? 'no_show' : 'unmarked');

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function MemberHistory({ member, exercises }: { member: RunClassMember; exercises: WorkoutExerciseRow[] }) {
  const sectioned = usesSections(exercises);
  // The main lifts first, the warm-ups last (CS22).
  const rows = lastWeightsOrder(exercises.filter((e) => member.chosenKeys.length === 0 || exerciseIsVisible(e, sectioned, member.chosenKeys)));
  if (rows.length === 0) return <p className="px-1 py-2 text-sm text-zinc-500">No exercises to show yet.</p>;
  // The day's scored blocks (an AMRAP, a for-time, a score), once each, with the member's earlier results on the same block (CS18).
  const scored = new Map<string, { title: string; format: string | null; config: unknown }>();
  for (const e of rows) {
    const key = exerciseBlockKey(e);
    if (!scored.has(key) && sanitiseConfig(e.block_config).scoring !== 'none') {
      scored.set(key, { title: e.block_format ?? SECTION_TITLE[e.section ?? 'lift'], format: e.block_format, config: e.block_config });
    }
  }
  return (
    <div className="space-y-2.5 pt-2">
      {[...scored].map(([key, b]) => {
        const past = pastResultsFor(member.blockResults, key, b.format);
        return (
          <div key={`block-${key}`} className="rounded-xl bg-accent/[.06] px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-bold text-black dark:text-zinc-50">{b.title}</p>
              <p className="shrink-0 text-[11px] font-semibold uppercase text-zinc-500">Block result</p>
            </div>
            {past.length === 0 ? (
              <p className="text-xs text-zinc-500">No result on this block yet</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {past.map((r, i) => (
                  <li key={`${r.date}-${i}`} className={`flex justify-between gap-3 text-sm ${i === 0 ? 'font-semibold text-black dark:text-zinc-50' : 'text-zinc-500'}`}>
                    <span>{describePastResult(r, b.config)}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{shortDate(r.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {rows.map((e) => {
        const logged = (e.exercise_library_id ? member.history[e.exercise_library_id] : undefined) ?? member.history[e.name.trim().toLowerCase()] ?? [];
        // A session with nothing recorded on it (an empty time box, say) is left out rather than shown as blanks.
        const sessions = logged.map((s) => ({ date: s.date, text: describeHistorySets(s.sets) })).filter((s): s is { date: string; text: string } => s.text != null);
        return (
          <div key={e.id} className="rounded-xl bg-black/[.03] px-3 py-2 dark:bg-white/[.05]">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-bold text-black dark:text-zinc-50">{e.name}</p>
              <p className="shrink-0 text-[11px] font-semibold uppercase text-zinc-500">{SECTION_TITLE[e.section ?? 'lift']}</p>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-zinc-500">Not done before</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {sessions.map((s, i) => (
                  <li key={s.date} className={`flex justify-between gap-3 text-sm ${i === 0 ? 'font-semibold text-black dark:text-zinc-50' : 'text-zinc-500'}`}>
                    <span>{s.text}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{shortDate(s.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RunClassView({ classId, initial, timezone }: { classId: string; initial: RunClassData; timezone?: string | null }) {
  const toast = useToast();
  const [members, setMembers] = useState(initial.members);
  // The attendance bar fills when the page opens (GSAP), then follows each tap.
  const rosterRef = useRef<HTMLElement>(null);
  useGrowIn(rosterRef, 0.2);
  const [openId, setOpenId] = useState<string | null>(null);
  // Adding a walk-in (CS2): the member list is read when the panel first opens.
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<CoachClientRow[] | null>(null);
  const { run: runAdd, busy: addingBusy } = useAction();

  function openAdd() {
    setAdding(true);
    if (candidates) return;
    getWalkInCandidates()
      .then(setCandidates)
      .catch((err) => {
        setAdding(false);
        toast.error(err instanceof Error ? err.message : 'Could not load the members');
      });
  }

  // Books them in through the same rules as the Sessions pop-up (book_class_for_client: a credit, or the waitlist when full), then
  // reads the class again so they appear with their picks and last weights.
  // credits: a walk-in short of credits is given what they are short first, in the same step (D18).
  async function addWalkIn(clientId: string, credits = 0) {
    await runAdd(
      async () => {
        const result = credits > 0
          ? await grantCreditsAndBook(classId, clientId, initial.date, credits, `${initial.className}, ${heading}`)
          : await bookClassForClient(classId, clientId, initial.date);
        if (result.ok) {
          setAdding(false);
          setCandidates(null); // balances have changed; read them again next time
          const fresh = await getRunClassData(classId, initial.date).catch(() => null);
          if (fresh) setMembers(fresh.members);
        }
        return result;
      },
      { success: credits > 1 ? 'Credits added and booked in' : credits === 1 ? 'Credit added and booked in' : 'Added to the class', refresh: false }
    );
  }

  async function setStatus(m: RunClassMember, pick: 'attended' | 'no_show') {
    const next: AttendanceStatus = statusOf(m) === pick ? 'unmarked' : pick;
    const patch = { attended: next === 'attended', noShow: next === 'no_show' };
    setMembers((prev) => prev.map((x) => (x.bookingId === m.bookingId ? { ...x, ...patch } : x)));
    const revert = (message: string) => {
      setMembers((prev) => prev.map((x) => (x.bookingId === m.bookingId ? { ...x, attended: m.attended, noShow: m.noShow } : x)));
      toast.error(message);
    };
    try {
      const result = await markAttendanceStatus(m.bookingId, next);
      if (!result.ok) revert(result.error);
    } catch (err) {
      revert(err instanceof Error ? err.message : 'Could not update attendance');
    }
  }

  const booked = members.filter((m) => m.status === 'booked');
  // In the order people come off it (CS5): the roster is read oldest booking first, as promote_from_waitlist moves people in.
  const waitlist = members.filter((m) => m.status === 'waitlist');
  const queuePlace = new Map(waitlist.map((m, i) => [m.bookingId, i + 1]));
  const here = booked.filter((m) => m.attended).length;
  const unmarked = booked.filter((m) => statusOf(m) === 'unmarked');
  // Attendance can't be marked for a session that hasn't happened yet: it would count toward sessions done, the clubs and rewards (SV1).
  // The database refuses too; this just says so first. "Today" is the gym's own, from the page (CS19); London only when it isn't known.
  const todayIso = todayIsoInTz(timezone || DEFAULT_TIMEZONE);
  const notYetHappened = initial.date > todayIso;
  // A member can be added today or ahead, not to an earlier day (the database refuses a past date).
  const canAdd = initial.date >= todayIso;
  const heading = new Date(`${initial.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const tvHref = `/coach/run/${classId}/${initial.date}/tv`;

  return (
    // The coach's desktop sidebar too (the board); on a phone this stays the plain screen for the door.
    <div data-ui="coach" className="lg:pl-[232px]">
    <CoachSidebar />
    <SmoothScroll />
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-16 pt-4 lg:pt-8">
      {/* Back to the same day in Sessions, not today (CS2). */}
      <Link href={`/coach/classes?tab=sessions&date=${initial.date}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:underline">
        <ChevronLeft className="h-4 w-4" /> Sessions
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {heading} · {formatClassTime(initial.startTime)}
          </p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-black sm:text-[32px] dark:text-zinc-50">{initial.className}</h1>
        </div>
        <a
          href={tvHref}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
        >
          <Tv className="h-4 w-4" /> Show on TV
        </a>
      </header>

      <div className="rounded-[20px] border border-black/[.08] bg-card px-5 py-4 dark:border-white/10">
        {initial.workout ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            <b className="text-black dark:text-zinc-50">{initial.workout.dayLabel}</b> · Week {initial.workout.weekNum} · {initial.workout.programName}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No workout is set for this weekday in the programme, so last weights can&apos;t be shown.</p>
        )}
      </div>

      <SessionCoachNote note={initial.coachNote} />

      <section ref={rosterRef} className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3.5 pt-[18px]">
        <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">
          {/* The count rolls like a counter wheel as members are marked (after React Bits Counter). */}
          Roster <span className="font-semibold text-zinc-500">· <RollingNumber value={here} /> of {booked.length} here</span>
        </h2>
        {unmarked.length > 1 && (
          <button
            type="button"
            disabled={notYetHappened}
            onClick={() => unmarked.forEach((m) => void setStatus(m, 'attended'))}
            className="inline-flex h-11 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent disabled:opacity-40"
          >
            Mark everyone here
          </button>
        )}
      </div>

      {booked.length > 0 && (
        <div aria-hidden className="mx-5 mb-3.5 h-1.5 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
          <div data-grow="bar" className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.round((here / booked.length) * 100)}%` }} />
        </div>
      )}

      {notYetHappened && (
        <p className="border-t border-black/[.07] px-5 py-3 text-sm font-semibold text-zinc-500 dark:border-white/10">
          This session hasn&apos;t happened yet, so attendance can&apos;t be marked. It opens on the day.
        </p>
      )}

      {members.length === 0 && (
        <div className="border-t border-black/[.07] dark:border-white/10">
          <EmptyState icon={Check} title="Nobody booked in" compact />
        </div>
      )}

      <div>
        {[...booked, ...waitlist].map((m) => {
          const st = statusOf(m);
          const open = openId === m.bookingId;
          return (
            <Fragment key={m.bookingId}>
            {waitlist.length > 0 && m.bookingId === waitlist[0].bookingId && (
              <p className="border-t border-black/[.07] bg-black/[.02] px-5 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500 dark:border-white/10 dark:bg-white/[.03] dark:text-zinc-400">
                Waitlist, in order · {waitlist.length} waiting
              </p>
            )}
            <div className="border-t border-black/[.07] px-5 py-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <Avatar name={m.clientName} size="md" />
                <div className="min-w-0 flex-1">
                  <Link href={`/coach/clients/${m.clientId}`} className="block truncate text-[15px] font-bold text-black hover:underline dark:text-zinc-50">
                    {m.clientName}
                  </Link>
                  <p className={`truncate text-xs ${m.picks?.switched ? 'font-semibold text-accent' : 'text-zinc-500'}`}>
                    {m.status === 'waitlist'
                      ? queuePlace.has(m.bookingId)
                        ? `${ordinal(queuePlace.get(m.bookingId)!)} on the waitlist`
                        : 'Waitlist'
                      : (m.picks?.text ?? 'No block picked yet')}
                  </p>
                </div>
                {m.status === 'booked' && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      aria-label={`${m.clientName} attended`}
                      aria-pressed={st === 'attended'}
                      disabled={notYetHappened}
                      onClick={(e) => {
                        if (st !== 'attended') pop(e.currentTarget, 0.88);
                        void setStatus(m, 'attended');
                      }}
                      className={`inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold ${
                        st === 'attended' ? 'bg-accent text-accent-foreground' : 'bg-accent-soft text-accent'
                      }`}
                    >
                      <DrawnTick on={st === 'attended'} />
                      {st === 'attended' ? 'Here' : 'Mark here'}
                    </button>
                    <button
                      type="button"
                      aria-label={`${m.clientName} no-show`}
                      aria-pressed={st === 'no_show'}
                      disabled={notYetHappened}
                      onClick={() => setStatus(m, 'no_show')}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${st === 'no_show' ? 'bg-danger text-white' : 'border border-black/[.14] text-zinc-500 dark:border-white/15'}`}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
              <RosterMarkers entry={m} creditCost={initial.creditCost} />
              {initial.workout && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.bookingId)}
                    aria-expanded={open}
                    className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-sm font-bold text-accent"
                  >
                    Last weights
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <MemberHistory member={m} exercises={initial.workout.exercises} />}
                </>
              )}
            </div>
            </Fragment>
          );
        })}
      </div>

      {canAdd &&
        (adding ? (
          <div className="space-y-2 border-t border-black/[.07] px-5 py-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-black dark:text-zinc-50">Add a walk-in</p>
              <button type="button" onClick={() => setAdding(false)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-500">
                Close
              </button>
            </div>
            <AddToSessionPanel
              clients={candidates}
              excludeIds={new Set(members.map((m) => m.clientId))}
              full={booked.length >= initial.capacity}
              creditCost={initial.creditCost}
              date={initial.date}
              busy={addingBusy}
              onAdd={addWalkIn}
              onAddWithCredits={addWalkIn}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={openAdd}
            className="flex min-h-[56px] w-full items-center gap-2 border-t border-black/[.07] px-5 text-[15px] font-bold text-accent hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
          >
            <UserPlus className="h-4 w-4" /> Add a member or walk-in
          </button>
        ))}
      </section>
    </main>
    </div>
  );
}

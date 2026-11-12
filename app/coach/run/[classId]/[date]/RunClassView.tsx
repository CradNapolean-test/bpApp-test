'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronLeft, Tv, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { EmptyState } from '@/app/_components/EmptyState';
import { useToast } from '@/app/_components/ToastProvider';
import { useAction } from '@/app/_components/useAction';
import { AddToSessionPanel } from '@/app/coach/classes/_components/AddToSessionPanel';
import { bookClassForClient, grantCreditsAndBook, markAttendanceStatus } from '@/lib/data/classes';
import { getRunClassData, getWalkInCandidates } from '@/lib/data/runClass';
import { exerciseBlockKey, exerciseIsVisible, SECTION_TITLE, usesSections } from '@/lib/workoutSections';
import { describeHistorySets, describePastResult, pastResultsFor } from '@/lib/runClassHistory';
import { sanitiseConfig } from '@/lib/blockScoring';
import { DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz } from '@/lib/utils/dates';
import type { RunClassData, RunClassMember } from '@/lib/data/runClass';
import type { CoachClientRow } from '@/lib/data/coach';
import type { AttendanceStatus, WorkoutExerciseRow } from '@/lib/data/types';

// The coach's screen while a class is on: tick people in, see who picked what, and see what each member
// lifted on the day's exercises the last few times, so the coach knows roughly what to put on the bar.

const statusOf = (m: { attended: boolean; noShow: boolean }): AttendanceStatus => (m.attended ? 'attended' : m.noShow ? 'no_show' : 'unmarked');

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function MemberHistory({ member, exercises }: { member: RunClassMember; exercises: WorkoutExerciseRow[] }) {
  const sectioned = usesSections(exercises);
  const rows = exercises.filter((e) => (member.chosenKeys.length === 0 || exerciseIsVisible(e, sectioned, member.chosenKeys)));
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

export function RunClassView({ classId, initial }: { classId: string; initial: RunClassData }) {
  const toast = useToast();
  const [members, setMembers] = useState(initial.members);
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
  const waitlist = members.filter((m) => m.status === 'waitlist');
  const here = booked.filter((m) => m.attended).length;
  const unmarked = booked.filter((m) => statusOf(m) === 'unmarked');
  // Attendance can't be marked for a session that hasn't happened yet: it would count toward sessions done, the clubs and rewards (SV1).
  // The database refuses too; this just says so first. (The gym's own timezone is used when the page passes it in.)
  const todayIso = todayIsoInTz(DEFAULT_TIMEZONE);
  const notYetHappened = initial.date > todayIso;
  // A member can be added today or ahead, not to an earlier day (the database refuses a past date).
  const canAdd = initial.date >= todayIso;
  const heading = new Date(`${initial.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const tvHref = `/coach/run/${classId}/${initial.date}/tv`;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-16 pt-4">
      {/* Back to the same day in Sessions, not today (CS2). */}
      <Link href={`/coach/classes?tab=sessions&date=${initial.date}`} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-500">
        <ChevronLeft className="h-4 w-4" /> Sessions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-black dark:text-zinc-50">
            {formatClassTime(initial.startTime)} · {initial.className}
          </h1>
          <p className="text-sm text-zinc-500">{heading}</p>
        </div>
        <a
          href={tvHref}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-foreground"
        >
          <Tv className="h-4 w-4" /> Show on TV
        </a>
      </div>

      <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
        {initial.workout ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            <b className="text-black dark:text-zinc-50">{initial.workout.dayLabel}</b> · Week {initial.workout.weekNum} · {initial.workout.programName}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No workout is set for this weekday in the programme, so last weights can&apos;t be shown.</p>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-extrabold text-black dark:text-zinc-50">
          {here} of {booked.length} here
        </p>
        {unmarked.length > 1 && (
          <button
            type="button"
            disabled={notYetHappened}
            onClick={() => unmarked.forEach((m) => void setStatus(m, 'attended'))}
            className="rounded-full border border-success/40 bg-success/10 px-3.5 py-2 text-xs font-bold text-success disabled:opacity-40"
          >
            Mark everyone attended
          </button>
        )}
      </div>

      {notYetHappened && (
        <p className="px-1 text-xs font-semibold text-zinc-500">
          This session hasn&apos;t happened yet, so attendance can&apos;t be marked. It opens on the day.
        </p>
      )}

      {members.length === 0 && <EmptyState icon={Check} title="Nobody booked in" compact />}

      <div className="space-y-2">
        {[...booked, ...waitlist].map((m) => {
          const st = statusOf(m);
          const open = openId === m.bookingId;
          return (
            <div key={m.bookingId} className="rounded-2xl border border-black/[.06] bg-card p-3 dark:border-white/10">
              <div className="flex items-center gap-3">
                <Avatar name={m.clientName} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/coach/clients/${m.clientId}`} className="block truncate text-base font-bold text-black dark:text-zinc-50">
                    {m.clientName}
                  </Link>
                  <p className={`truncate text-xs ${m.picks?.switched ? 'font-semibold text-accent' : 'text-zinc-500'}`}>
                    {m.status === 'waitlist' ? 'Waitlist' : (m.picks?.text ?? 'No block picked yet')}
                  </p>
                </div>
                {m.status === 'booked' && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      aria-label={`${m.clientName} attended`}
                      aria-pressed={st === 'attended'}
                      disabled={notYetHappened}
                      onClick={() => setStatus(m, 'attended')}
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${st === 'attended' ? 'bg-success text-white' : 'bg-black/5 text-zinc-500 dark:bg-white/10'}`}
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${m.clientName} no-show`}
                      aria-pressed={st === 'no_show'}
                      disabled={notYetHappened}
                      onClick={() => setStatus(m, 'no_show')}
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${st === 'no_show' ? 'bg-danger text-white' : 'bg-black/5 text-zinc-500 dark:bg-white/10'}`}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
              {initial.workout && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.bookingId)}
                    aria-expanded={open}
                    className="mt-2 flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-xs font-bold text-accent"
                  >
                    Last weights
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <MemberHistory member={m} exercises={initial.workout.exercises} />}
                </>
              )}
            </div>
          );
        })}
      </div>

      {canAdd &&
        (adding ? (
          <div className="space-y-2 rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
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
              busy={addingBusy}
              onAdd={addWalkIn}
              onAddWithCredits={addWalkIn}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-accent py-3 text-sm font-extrabold text-accent"
          >
            <UserPlus className="h-4 w-4" /> Add a walk-in
          </button>
        ))}
    </main>
  );
}

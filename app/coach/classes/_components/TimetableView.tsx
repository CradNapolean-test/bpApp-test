'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { createClass, deleteClass, getClassBookingSummary, retireClass, updateClass, type ClassBookingSummary } from '@/lib/data/classes';
import { firstFailure } from '@/lib/data/result';
import { useActiveGymId } from '@/app/coach/_components/CoachGymsContext';
import { checkSessionEdit, isPastSessionDate, retireWording } from '@/lib/sessionEdit';
import { useToast } from '@/app/_components/ToastProvider';
import { formatClock } from '@/lib/utils/cancelDeadline';
import { DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';
import {
  DAY_ORDER,
  DURATION,
  HOUR_H,
  dowOf,
  hourRows,
  isoAdd,
  mondayOf,
  newSessionStart,
  phoneDayFor,
  timeAtY,
  toMin,
  yOfMinute,
  type NewSessionStart,
} from '@/lib/timetableGrid';
import { classNameChoices, classNameKey, matchClassName, nearClassName, newClassNameQuestion, tidyClassName } from '@/lib/classNameMatch';
import type { ClassRow, ScheduleOccurrence } from '@/lib/data/types';

// The timetable as a real week calendar: weekly recurring slots repeat every week, one-off sessions
// appear only on their date. Tap a block to edit, tap an empty slot to add one there (CS7).
// On a phone it shows one day at a time, with a day picker (CS11). The days drawn are Monday first, and Sunday only if something is
// actually scheduled on it.

// The class picker's "type a new name" choice (CS10).
const NEW_NAME = '__new__';

type Draft = {
  id: string | null; // null = new slot
  name: string;
  // Typing a new class name rather than picking one of the gym's (CS10).
  newName: boolean;
  dayOfWeek: number;
  kind: 'weekly' | 'once';
  date: string; // one-off sessions: YYYY-MM-DD
  // New sessions only: every weekday this should repeat on (each becomes one weekly slot).
  repeatDays: number[];
  startTime: string; // HH:MM
  capacity: number;
  creditCost: number;
  cutoffHours: number;
  note: string;
};

function toDraft(c: ClassRow): Draft {
  return {
    id: c.id,
    name: c.name,
    newName: false,
    dayOfWeek: c.day_of_week ?? 1,
    kind: c.specific_date ? 'once' : 'weekly',
    date: c.specific_date ?? '',
    repeatDays: [c.day_of_week ?? 1],
    startTime: c.start_time?.slice(0, 5) ?? '06:00',
    capacity: c.capacity,
    creditCost: c.credit_cost,
    cutoffHours: c.cutoff_hours,
    note: c.coach_note ?? '',
  };
}

// Distinct hues so different classes are told apart at a glance. A gym with one class type keeps the accent colour.
const HUES = [172, 36, 280, 340, 210, 100, 15];

// "6:45" -- the am/pm suffix would not fit in a narrow day column; the hour labels carry it.
const shortTime = (t: string | null) => {
  const m = toMin(t);
  const h12 = Math.floor(m / 60) % 12 === 0 ? 12 : Math.floor(m / 60) % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')}`;
};

// Side-by-side lanes for sessions in one day that overlap in time.
function layoutDay(rows: ClassRow[]): { row: ClassRow; lane: number; lanes: number }[] {
  const laneEnds: number[] = [];
  const placed = rows.map((row) => {
    const start = toMin(row.start_time);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = start + DURATION;
    return { row, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p, lanes }));
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-500">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function TimetableView({ classes, occurrences, timezone }: { classes: ClassRow[]; occurrences: ScheduleOccurrence[]; timezone?: string | null }) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const gymId = useActiveGymId();
  const isoToday = () => todayIsoInTz(tz);
  // The gym's current minute of the day, refreshed every minute, for the "now" line.
  const nowMin = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
  };
  const [now, setNow] = useState(nowMin);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  // What the open session has booked, for the retire / edit confirmations (R26, CH2). Null until it has loaded.
  const [summary, setSummary] = useState<ClassBookingSummary | null>(null);
  const openSessionId = draft?.id ?? null;
  useEffect(() => {
    if (!openSessionId) return;
    let cancelled = false;
    getClassBookingSummary(openSessionId, todayIsoInTz(tz))
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
      setSummary(null);
    };
  }, [openSessionId, tz]);
  const [day, setDay] = useState<number>(1);
  const [copying, setCopying] = useState(false);
  const [copyTo, setCopyTo] = useState<Set<number>>(new Set());
  // The empty slot under the mouse on the week grid, drawn as a faint "+ 6:15" so it is clear a click adds there (CS7).
  const [hover, setHover] = useState<{ d: number; time: string } | null>(null);
  // The day the phone's one-day view shows once the coach has picked one; null = today (or Monday in another week). CS11.
  const [phoneChosen, setPhoneChosen] = useState<number | null>(null);

  // The gym's class names, one per name whatever its case or spacing, for the session form's picker (CS10).
  const choices = useMemo(() => classNameChoices(classes.map((c) => c.name)), [classes]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(isoToday()));
  // The week's classes settle in when the timetable opens and when another week is shown (GSAP).
  const timetableRef = useRef<HTMLDivElement>(null);
  useStaggerIn(timetableRef, '[data-stagger]', weekStart);
  const todayIso = isoToday();
  const dateFor = (d: number) => isoAdd(weekStart, (d + 6) % 7);
  const byTime = (a: ClassRow, b: ClassRow) => (a.start_time ?? '').localeCompare(b.start_time ?? '');
  // What's actually on a weekday of the week being shown: weekly slots plus that date's one-offs.
  const daySlots = (d: number) =>
    classes.filter((c) => (c.specific_date ? c.specific_date === dateFor(d) : c.day_of_week === d)).sort(byTime);
  // Weekly slots only -- what "copy a day" duplicates.
  const weeklySlots = (d: number) => classes.filter((c) => !c.specific_date && c.day_of_week === d).sort(byTime);
  const days = DAY_ORDER.filter((d) => d !== 0 || daySlots(0).length > 0);
  const phoneDay = phoneDayFor(weekStart, todayIso, phoneChosen, days);
  const slots = weeklySlots(day);
  const fmtShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = `${fmtShort(weekStart)} – ${fmtShort(isoAdd(weekStart, 6))}`;
  // Hours worth drawing: those with a session in them, one either side, and the rest folded away.
  const rows = useMemo(() => hourRows(classes.map((c) => c.start_time)), [classes]);
  const gridH = rows.total;
  const yOf = (min: number) => yOfMinute(rows.rows, min);

  const classNames = useMemo(() => [...new Set(classes.map((c) => c.name))].sort(), [classes]);
  const hueFor = (name: string) => (classNames.length > 1 ? HUES[classNames.indexOf(name) % HUES.length] : null);
  // How full each session is. A date inside the loaded window with no entry was cancelled for that day.
  const occMap = useMemo(() => new Map(occurrences.map((o) => [`${o.classId}|${o.date}`, o])), [occurrences]);
  const winFrom = isoAdd(todayIso, -28);
  const winTo = isoAdd(todayIso, 20);

  // A new session's form, on the day and time it starts (CS7), copying the class, places, credits and cut-off from the last session
  // on that weekday (or any session). With no classes yet the name is typed; otherwise it is picked from the gym's classes (CS10).
  function newSlot(start: NewSessionStart) {
    const template = weeklySlots(start.dayOfWeek)[weeklySlots(start.dayOfWeek).length - 1] ?? classes[0];
    setHover(null);
    setDraft({
      id: null,
      name: template ? (matchClassName(template.name, choices) ?? template.name) : '',
      newName: choices.length === 0,
      dayOfWeek: start.dayOfWeek,
      kind: 'weekly',
      date: start.date,
      repeatDays: [start.dayOfWeek],
      startTime: start.startTime,
      capacity: template?.capacity ?? 12,
      creditCost: template?.credit_cost ?? 1,
      cutoffHours: template?.cutoff_hours ?? 3,
      note: '',
    });
  }

  // One click or tap on an empty part of a day column opens the form there, on the quarter hour (CS7). A folded band adds nothing.
  function addAt(d: number, e: React.MouseEvent<HTMLDivElement>) {
    const time = timeAtY(rows.rows, e.clientY - e.currentTarget.getBoundingClientRect().top);
    if (time) newSlot(newSessionStart(weekStart, todayIso, { day: d, time }));
  }

  function trackHover(d: number, e: React.MouseEvent<HTMLDivElement>) {
    const overBlock = (e.target as HTMLElement).closest('button') !== null;
    const time = overBlock ? null : timeAtY(rows.rows, e.clientY - e.currentTarget.getBoundingClientRect().top);
    const next = time ? { d, time } : null;
    if (next?.d !== hover?.d || next?.time !== hover?.time) setHover(next);
  }

  async function save() {
    if (!draft) return;
    const once = draft.kind === 'once';
    // A typed name that is one of the gym's classes, ignoring case and extra spaces, is saved as that class (CS10).
    const typedName = tidyClassName(draft.name);
    const existingName = matchClassName(typedName, choices);
    const fields = {
      name: existingName ?? typedName,
      day_of_week: once ? dowOf(draft.date) : draft.dayOfWeek,
      specific_date: once ? draft.date : null,
      start_time: draft.startTime,
      capacity: draft.capacity,
      credit_cost: draft.creditCost,
      cutoff_hours: draft.cutoffHours,
      coach_note: draft.note.trim() || null,
    };
    const repeat = [...new Set(draft.repeatDays)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    if (!draft.id && !once && repeat.length === 0) return;
    if (!draft.id && once && isPastSessionDate(draft.date, todayIso)) {
      toast.error('A one-off session can\u2019t be in the past.');
      return;
    }
    // A name that is none of the gym's classes makes a new class type, with its own colour and its own lines in the reports: only on
    // purpose (CS10).
    if (!existingName) {
      const question = newClassNameQuestion(typedName, choices);
      if (question && !(await confirm(question))) return;
    }
    if (draft.id) {
      const before = classes.find((c) => c.id === draft.id);
      if (before) {
        const booked = summary ?? (await getClassBookingSummary(draft.id, todayIso));
        const check = checkSessionEdit(
          { dayOfWeek: before.day_of_week, specificDate: before.specific_date, startTime: before.start_time, capacity: before.capacity },
          { dayOfWeek: fields.day_of_week, specificDate: fields.specific_date, startTime: fields.start_time, capacity: fields.capacity },
          booked
        );
        if (check.kind === 'blocked') {
          toast.error(check.message);
          return;
        }
        if (check.kind === 'notify' && !(await confirm({ title: 'Tell booked members?', body: check.message, confirmLabel: 'Save and notify' }))) return;
      }
    }
    // Skip anything already in the timetable at this time with this name, so saving twice never doubles up.
    const sameSlot = (c: ClassRow) => c.start_time?.slice(0, 5) === draft.startTime && classNameKey(c.name) === classNameKey(fields.name);
    const toCreate: (number | null)[] = once
      ? classes.some((c) => c.specific_date === draft.date && sameSlot(c))
        ? []
        : [null]
      : repeat.filter((d) => !weeklySlots(d).some(sameSlot));
    await run(
      () =>
        draft.id
          ? updateClass(draft.id, fields, gymId)
          : Promise.all(toCreate.map((d) => createClass(d === null ? fields : { ...fields, day_of_week: d }, gymId))).then((results) => firstFailure(results) ?? results),
      {
        success: draft.id
          ? 'Session updated'
          : toCreate.length === 0
            ? 'Already in the timetable'
            : toCreate.length === 1
              ? 'Session added'
              : `Added to ${toCreate.length} days`,
        onDone: () => {
          if (once) setWeekStart(mondayOf(draft.date));
          else setDay(draft.dayOfWeek);
          // The phone's one-day view moves to the day the session is on, so it can be seen.
          setPhoneChosen(once ? dowOf(draft.date) : draft.id ? draft.dayOfWeek : (repeat[0] ?? draft.dayOfWeek));
          setDraft(null);
        },
      }
    );
  }

  // A session with bookings is RETIRED, never deleted (D15): members booked on upcoming dates are refunded and told, and all history
  // stays. One nobody ever booked can simply be deleted.
  async function remove() {
    if (!draft?.id) return;
    const id = draft.id;
    let booked: ClassBookingSummary;
    try {
      booked = summary ?? (await getClassBookingSummary(id, todayIso));
    } catch {
      toast.error('Could not check the bookings for that session. Try again.');
      return;
    }
    const wording = retireWording(draft.name, booked);
    const ok = await confirm({ title: wording.title, body: wording.body, confirmLabel: wording.confirmLabel, destructive: true });
    if (!ok) return;
    if (wording.action === 'delete') {
      await run(() => deleteClass(id, gymId), { success: 'Session deleted', onDone: () => setDraft(null) });
      return;
    }
    let refunded = 0;
    let cancelled = 0;
    await run(
      async () => {
        const result = await retireClass(id, gymId);
        if (result.ok) {
          refunded = result.refundedCredits;
          cancelled = result.cancelled;
        }
        return result;
      },
      {
        onDone: () => {
          toast.success(cancelled === 0 ? 'Session retired' : `Session retired. ${cancelled} booking${cancelled === 1 ? '' : 's'} cancelled, ${refunded} credit${refunded === 1 ? '' : 's'} refunded.`);
          setDraft(null);
        },
      }
    );
  }

  async function copyDay() {
    const targets = [...copyTo].filter((d) => d !== day);
    if (slots.length === 0 || targets.length === 0) return;
    const jobs: Promise<unknown>[] = [];
    for (const target of targets) {
      const existing = new Set(weeklySlots(target).map((c) => `${c.start_time?.slice(0, 5)}|${classNameKey(c.name)}`));
      for (const s of slots) {
        if (existing.has(`${s.start_time?.slice(0, 5)}|${classNameKey(s.name)}`)) continue;
        jobs.push(
          createClass({
            name: s.name,
            day_of_week: target,
            start_time: s.start_time,
            capacity: s.capacity,
            credit_cost: s.credit_cost,
            cutoff_hours: s.cutoff_hours,
            coach_note: s.coach_note,
          }, gymId)
        );
      }
    }
    await run(() => Promise.all(jobs).then((results) => firstFailure(results) ?? results), {
      success: `Copied ${WEEKDAY_LABELS[day]} to ${targets.map((d) => WEEKDAY_SHORT[d]).join(', ')}`,
      onDone: () => {
        setCopying(false);
        setCopyTo(new Set());
      },
    });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  // One day's column of the calendar. `big` is the phone's one-day view: a full-width column with text big enough to read (CS11).
  function dayColumn(d: number, big: boolean) {
    const placed = layoutDay(daySlots(d));
    const date = dateFor(d);
    return (
      <div
        key={d}
        className={`relative cursor-pointer border-l border-black/[.06] dark:border-white/10 ${date === todayIso ? 'bg-accent/[.06]' : ''}`}
        style={{ height: gridH }}
        onClick={(e) => addAt(d, e)}
        onMouseMove={big ? undefined : (e) => trackHover(d, e)}
        onMouseLeave={big ? undefined : () => setHover(null)}
      >
        {rows.rows.map((r) => (
          <div
            key={r.top}
            className={`absolute inset-x-0 border-t border-black/[.07] dark:border-white/10 ${r.hour === null ? 'bg-black/[.03] dark:bg-white/[.03]' : ''}`}
            style={{ top: r.top, height: r.height }}
          />
        ))}
        {date === todayIso && rows.rows.some((r) => r.hour === Math.floor(now / 60)) && (
          <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: yOf(now) }}>
            <span className="-ml-1 h-2 w-2 rounded-full bg-danger" />
            <span className="h-px flex-1 bg-danger" />
          </div>
        )}
        {!big && hover?.d === d && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0.5 flex items-center justify-center gap-0.5 rounded-lg border border-dashed border-accent/70 bg-accent/[.06] text-[11px] font-bold text-accent"
            style={{ top: yOf(toMin(hover.time)) + 1, height: (DURATION * HOUR_H) / 60 - 2 }}
          >
            <Plus className="h-3 w-3" />
            {shortTime(hover.time)}
          </span>
        )}
        {placed.map(({ row, lane, lanes }) => {
          const start = toMin(row.start_time);
          const occ = occMap.get(`${row.id}|${date}`);
          const off = occ ? !!occ.cancelled : date >= winFrom && date < winTo;
          const hue = hueFor(row.name);
          const color = hue === null ? undefined : `hsl(${hue} 65% 48%)`;
          const full = !!occ && occ.bookedCount >= row.capacity;
          return (
            <button
              key={row.id}
              data-stagger
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHover(null);
                setDraft(toDraft(row));
              }}
              aria-label={`${row.name} ${formatClassTime(row.start_time)} on ${WEEKDAY_LABELS[d]}${occ && !occ.cancelled ? `, ${occ.bookedCount} of ${row.capacity} booked` : ''}${off ? ', cancelled for this date' : ''}`}
              className={`absolute overflow-hidden rounded-lg text-left ${big ? 'px-2 py-0.5' : 'px-1 py-0.5'} ${hue === null ? 'border-accent bg-accent/20 ring-accent/40 hover:bg-accent/30' : ''} ${
                row.specific_date ? 'border border-dashed' : 'ring-1 ring-inset'
              } ${off ? 'opacity-40' : ''}`}
              style={{
                top: yOf(start) + 1,
                height: (DURATION * HOUR_H) / 60 - 2,
                left: `calc(${(lane / lanes) * 100}% + 1px)`,
                width: `calc(${100 / lanes}% - 2px)`,
                ...(hue === null
                  ? {}
                  : { backgroundColor: `hsl(${hue} 65% 48% / .2)`, borderColor: color, ['--tw-ring-color' as string]: `hsl(${hue} 65% 48% / .5)` }),
              }}
            >
              {big ? (
                <>
                  <span className="flex min-w-0 items-baseline gap-1.5 text-[14px] leading-[18px]">
                    <span className="shrink-0 font-extrabold text-accent" style={{ color }}>
                      {formatClassTime(row.start_time)}
                    </span>
                    <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">{row.name}</span>
                  </span>
                  <span className={`block truncate text-[13px] leading-4 ${full ? 'font-bold text-danger' : 'text-zinc-600 dark:text-zinc-300'}`}>
                    {off ? 'Off this date' : occ ? `${occ.bookedCount} of ${row.capacity} booked` : `${row.capacity} places`}
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-[11px] font-bold leading-tight text-accent" style={{ color }}>
                    {shortTime(row.start_time)}
                  </span>
                  {hue !== null && <span className="block truncate text-[10px] font-semibold leading-tight text-zinc-700 dark:text-zinc-200">{row.name}</span>}
                  <span className={`block text-[10px] leading-tight ${full ? 'font-bold text-danger' : 'text-zinc-500'}`}>
                    {off ? 'Off' : occ ? `${occ.bookedCount}/${row.capacity}` : `max ${row.capacity}`}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // The hour labels down the left of the calendar.
  const hourLabels = (big: boolean) => (
    <div className="relative" style={{ height: gridH }}>
      {rows.rows.map((r) => (
        <span
          key={r.top}
          className={`absolute right-1.5 -translate-y-1/2 text-zinc-400 ${big ? 'text-xs' : 'text-[11px]'}`}
          style={{ top: r.top + (r.top === 0 ? 6 : r.hour === null ? r.height / 2 : 0) }}
        >
          {r.hour === null ? '···' : formatClock(`${String(r.hour).padStart(2, '0')}:00`)}
        </span>
      ))}
    </div>
  );

  // "25 sessions · 300 places a week": the sessions that repeat weekly and the places they offer.
  const weekly = classes.filter((c) => !c.specific_date);
  const weeklySpots = weekly.reduce((n, c) => n + c.capacity, 0);
  const nameMatch = draft?.newName ? matchClassName(draft.name, choices) : null;
  const nameNear = draft?.newName ? nearClassName(draft.name, choices) : null;
  return (
    <div ref={timetableRef} className="space-y-4">
      <section className="space-y-4 rounded-[20px] border border-black/[.08] bg-card px-4 pb-4 pt-[18px] sm:px-5 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Every week</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {weekly.length} session{weekly.length === 1 ? '' : 's'} · {weeklySpots} places a week
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => newSlot(newSessionStart(weekStart, todayIso))}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Add session
          </button>
          <DropdownMenu
            variant="header"
            triggerLabel="More timetable actions"
            items={[{ label: 'Copy a day to other days', disabled: classes.length === 0, onSelect: () => setCopying(true) }]}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => isoAdd(w, -7))}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-black/[.14] text-zinc-700 hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-[9rem] text-center text-[15px] font-bold text-black dark:text-zinc-50">{weekLabel}</p>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => isoAdd(w, 7))}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-black/[.14] text-zinc-700 hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {weekStart !== mondayOf(todayIso) && (
          <button
            type="button"
            onClick={() => {
              setWeekStart(mondayOf(todayIso));
              setPhoneChosen(null);
            }}
            className="min-h-11 text-sm font-bold text-accent"
          >
            This week
          </button>
        )}
      </div>

      {classes.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No sessions yet" hint="Add your first session, or tap any slot on the calendar once you have one." compact />
      ) : (
        <>
          {/* A phone: one day at a time, picked from the week's days (CS11). */}
          <div className="space-y-3 sm:hidden">
            <div role="group" aria-label="Day to show" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((d) => {
                const on = d === phoneDay;
                const isToday = dateFor(d) === todayIso;
                const count = daySlots(d).length;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${WEEKDAY_LABELS[d]} ${Number(dateFor(d).slice(8))}${isToday ? ', today' : ''}, ${count} session${count === 1 ? '' : 's'}`}
                    onClick={() => setPhoneChosen(d)}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-xl ${
                      on ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black dark:border-white/15 dark:text-zinc-50'
                    }`}
                  >
                    <span className={`text-xs font-bold uppercase ${on ? '' : isToday ? 'text-accent' : 'text-zinc-500'}`}>{WEEKDAY_SHORT[d]}</span>
                    <span className="text-[15px] font-extrabold leading-5">{Number(dateFor(d).slice(8))}</span>
                    <span aria-hidden className={`mt-0.5 h-1 w-1 rounded-full ${count > 0 ? (on ? 'bg-current' : 'bg-accent') : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
            <p className="text-[15px] font-bold text-black dark:text-zinc-50">
              {WEEKDAY_LABELS[phoneDay]} {fmtShort(dateFor(phoneDay))}
              {dateFor(phoneDay) === todayIso ? ' · today' : ''}
            </p>
            <div className="overflow-hidden rounded-[20px] border border-black/[.08] dark:border-white/10" style={{ display: 'grid', gridTemplateColumns: '2.75rem minmax(0, 1fr)' }}>
              {hourLabels(true)}
              {dayColumn(phoneDay, true)}
            </div>
          </div>

          {/* Wider screens: the whole week. */}
          <div className="hidden overflow-x-auto rounded-[20px] border border-black/[.08] sm:block dark:border-white/10">
            <div className="min-w-[21rem]" style={{ display: 'grid', gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(3rem, 1fr))` }}>
              <div className="border-b border-black/[.06] dark:border-white/10" />
              {days.map((d) => (
                <div key={d} className="border-b border-l border-black/[.06] py-2 text-center dark:border-white/10">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500">{WEEKDAY_SHORT[d]}</p>
                  <p
                    className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      dateFor(d) === todayIso ? 'bg-accent text-accent-foreground' : 'text-black dark:text-zinc-100'
                    }`}
                  >
                    {Number(dateFor(d).slice(8))}
                  </p>
                </div>
              ))}
              {hourLabels(false)}
              {days.map((d) => dayColumn(d, false))}
            </div>
          </div>
        </>
      )}

      </section>
      {/* One line instead of the old five sentences (CS7); what the blocks mean is in the key below. */}
      <p className="px-1 text-xs text-zinc-500">Tap an empty slot to add a session there, or a session to change it.</p>
      {classes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
          <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span aria-hidden className="h-2.5 w-3.5 rounded-[3px] bg-accent/20 ring-1 ring-inset ring-accent/60" />
            Every week
          </span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span aria-hidden className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-accent" />
            One-off
          </span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span aria-hidden className="h-2.5 w-3.5 rounded-[3px] bg-accent/20 opacity-40 ring-1 ring-inset ring-accent/60" />
            Faded: off that date
          </span>
          {classNames.length > 1 &&
            classNames.map((n) => (
              <span key={n} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(${hueFor(n)} 65% 48%)` }} />
                {n}
              </span>
            ))}
        </div>
      )}

      {draft && (
        <BottomSheet title={draft.id ? 'Edit session' : 'New session'} onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-3"
          >
            {draft.id ? (
              <div className="grid grid-cols-2 gap-2">
                {draft.kind === 'once' ? (
                  <Field label="Date">
                    <input type="date" required className={inputCls} value={draft.date} onChange={(e) => set('date', e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Day">
                    <select className={inputCls} value={draft.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
                      {DAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Start time">
                  <input type="time" required className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
              </div>
            ) : (
              <>
                <div className="flex gap-1 rounded-xl bg-black/[.06] p-1 dark:bg-white/10">
                  {([['weekly', 'Repeats weekly'], ['once', 'One-off']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={draft.kind === key}
                      onClick={() => set('kind', key)}
                      className={`min-h-9 flex-1 rounded-lg text-sm font-bold ${draft.kind === key ? 'bg-card text-black shadow-sm dark:text-zinc-50' : 'text-zinc-600 hover:text-black dark:text-zinc-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Field label="Start time">
                  <input type="time" required className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
                {draft.kind === 'once' ? (
                  <Field label="Date">
                    <input type="date" required min={todayIso} className={inputCls} value={draft.date} onChange={(e) => set('date', e.target.value)} />
                  </Field>
                ) : (
                <Field label="Repeats every week on">
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_ORDER.map((d) => {
                      const on = draft.repeatDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set('repeatDays', on ? draft.repeatDays.filter((x) => x !== d) : [...draft.repeatDays, d])}
                          className={`h-11 min-w-11 rounded-xl px-3 text-sm font-bold ${
                            on ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
                          }`}
                        >
                          {WEEKDAY_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs font-semibold text-accent">
                    <button type="button" onClick={() => set('repeatDays', [1, 2, 3, 4, 5])}>
                      Weekdays
                    </button>
                    <button type="button" onClick={() => set('repeatDays', [...DAY_ORDER])}>
                      Every day
                    </button>
                    <button type="button" onClick={() => set('repeatDays', [draft.dayOfWeek])}>
                      Just {WEEKDAY_SHORT[draft.dayOfWeek]}
                    </button>
                  </div>
                </Field>
                )}
              </>
            )}
            {draft.id && draft.kind === 'weekly' && (
              <p className="rounded-xl bg-black/5 px-3 py-2 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                This is a weekly slot, so changes apply to every {WEEKDAY_LABELS[draft.dayOfWeek]}, not just this week. To change a single date, use Sessions.
              </p>
            )}
            {/* The class is picked from the gym's classes, or typed as a new one on purpose, so a slip never makes a new class type
                (CS10). A gym with no classes yet just types its first. */}
            {choices.length > 0 && !draft.newName ? (
              <Field label="Class" htmlFor="session-class">
                <select
                  id="session-class"
                  required
                  className={inputCls}
                  value={matchClassName(draft.name, choices) ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((d) => (d ? (value === NEW_NAME ? { ...d, newName: true, name: '' } : { ...d, name: value }) : d));
                  }}
                >
                  {!matchClassName(draft.name, choices) && (
                    <option value="" disabled>
                      Pick a class
                    </option>
                  )}
                  {choices.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={NEW_NAME}>New class…</option>
                </select>
              </Field>
            ) : (
              <Field
                label={choices.length > 0 ? 'New class name' : 'Class'}
                htmlFor="session-class"
                hint={
                  nameMatch ? (
                    <>That&apos;s your {nameMatch} class, so the session goes in {nameMatch}.</>
                  ) : nameNear ? (
                    <>
                      Did you mean{' '}
                      <button type="button" onClick={() => setDraft((d) => (d ? { ...d, newName: false, name: nameNear } : d))} className="font-bold text-accent underline">
                        {nameNear}
                      </button>
                      ?
                    </>
                  ) : choices.length > 0 ? (
                    'A new class gets its own colour on the timetable and its own lines in the reports.'
                  ) : undefined
                }
              >
                <input
                  id="session-class"
                  required
                  autoFocus={choices.length > 0}
                  className={inputCls}
                  placeholder="e.g. Strength"
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                />
                {choices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => (d ? { ...d, newName: false, name: matchClassName(d.name, choices) ?? choices[0] } : d))}
                    className="min-h-9 text-xs font-bold text-accent"
                  >
                    Pick one of your classes instead
                  </button>
                )}
              </Field>
            )}
            {/* The labels say what each number is (BK17, CS12); a two-line label keeps the boxes level. */}
            <div className="space-y-1">
              <div className="grid grid-cols-3 items-end gap-2">
                <Field label="Places" htmlFor="session-capacity">
                  <input id="session-capacity" type="number" min={1} className={inputCls} value={draft.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
                </Field>
                <Field label="Credits per booking" htmlFor="session-credits">
                  <input id="session-credits" type="number" min={0} className={inputCls} value={draft.creditCost} onChange={(e) => set('creditCost', Number(e.target.value))} />
                </Field>
                <Field label="Cancel by (hours before)" htmlFor="session-cutoff">
                  <input id="session-cutoff" type="number" min={0} className={inputCls} value={draft.cutoffHours} onChange={(e) => set('cutoffHours', Number(e.target.value))} />
                </Field>
              </div>
              <p className="text-xs text-zinc-500">A member who cancels later than that doesn&apos;t get the credit back.</p>
            </div>
            <Field label="Coach note" htmlFor="session-note" hint="For coaches only. Members aren't shown this note.">
              <input id="session-note" className={inputCls} value={draft.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            <button
              type="submit"
              disabled={busy || !draft.name.trim() || (!draft.id && draft.kind === 'weekly' && draft.repeatDays.length === 0)}
              className="h-12 w-full rounded-xl bg-accent text-[15px] font-extrabold text-accent-foreground disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save session'}
            </button>
            {draft.id && (
              <button type="button" onClick={remove} className="block w-full py-1 text-sm font-semibold text-danger">
                {summary == null ? 'Remove this session' : summary.totalBookings === 0 ? 'Delete this session' : 'Retire this session'}
              </button>
            )}
          </form>
        </BottomSheet>
      )}

      {copying && (
        <BottomSheet title="Copy a day" onClose={() => setCopying(false)}>
          <p className="mb-2 text-xs font-medium text-zinc-500">From</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDay(d);
                  setCopyTo((prev) => {
                    const next = new Set(prev);
                    next.delete(d);
                    return next;
                  });
                }}
                className={`h-11 min-w-11 rounded-xl px-3 text-sm font-bold ${
                  d === day ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
                }`}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-medium text-zinc-500">
            To ({slots.length} session{slots.length === 1 ? '' : 's'} will be copied)
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {days
              .filter((d) => d !== day)
              .map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setCopyTo((prev) => {
                      const next = new Set(prev);
                      if (next.has(d)) next.delete(d);
                      else next.add(d);
                      return next;
                    })
                  }
                  className={`h-11 min-w-11 rounded-xl px-3 text-sm font-bold ${
                    copyTo.has(d) ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
                  }`}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
          </div>
          <p className="mb-4 text-xs text-zinc-500">Sessions already at the same time on that day are skipped.</p>
          <button
            type="button"
            disabled={busy || copyTo.size === 0}
            onClick={copyDay}
            className="h-12 w-full rounded-xl bg-accent text-[15px] font-extrabold text-accent-foreground disabled:opacity-50"
          >
            {busy ? 'Copying…' : 'Copy sessions'}
          </button>
        </BottomSheet>
      )}
    </div>
  );
}

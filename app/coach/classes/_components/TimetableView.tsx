'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { createClass, deleteClass, updateClass } from '@/lib/data/classes';
import { formatClock } from '@/lib/utils/cancelDeadline';
import { formatClassTime, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { ClassRow } from '@/lib/data/types';

// The timetable as a real week calendar: weekly recurring slots repeat every week, one-off sessions
// appear only on their date. Tap a block to edit, tap an empty slot to add.

// Monday first, and Sunday only if something is actually scheduled on it.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = {
  id: string | null; // null = new slot
  name: string;
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

const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const mondayOf = (iso: string) => isoAdd(iso, -((dowOf(iso) + 6) % 7));
function isoToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function toDraft(c: ClassRow): Draft {
  return {
    id: c.id,
    name: c.name,
    dayOfWeek: c.day_of_week ?? 1,
    kind: c.specific_date ? 'once' : 'weekly',
    date: c.specific_date ?? isoToday(),
    repeatDays: [c.day_of_week ?? 1],
    startTime: c.start_time?.slice(0, 5) ?? '06:00',
    capacity: c.capacity,
    creditCost: c.credit_cost,
    cutoffHours: c.cutoff_hours,
    note: c.coach_note ?? '',
  };
}

// A session has no stored length, so the calendar draws each as a 45-minute block.
const DURATION = 45;
const HOUR_H = 56;

const toMin = (t: string | null) => {
  const [h, m] = (t ?? '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
};

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

export function TimetableView({ classes }: { classes: ClassRow[] }) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [day, setDay] = useState<number>(1);
  const [copying, setCopying] = useState(false);
  const [copyTo, setCopyTo] = useState<Set<number>>(new Set());

  const names = useMemo(() => [...new Set(classes.map((c) => c.name))].sort(), [classes]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(isoToday()));
  const todayIso = isoToday();
  const dateFor = (d: number) => isoAdd(weekStart, (d + 6) % 7);
  const byTime = (a: ClassRow, b: ClassRow) => (a.start_time ?? '').localeCompare(b.start_time ?? '');
  // What's actually on a weekday of the week being shown: weekly slots plus that date's one-offs.
  const daySlots = (d: number) =>
    classes.filter((c) => (c.specific_date ? c.specific_date === dateFor(d) : c.day_of_week === d)).sort(byTime);
  // Weekly slots only -- what "copy a day" duplicates.
  const weeklySlots = (d: number) => classes.filter((c) => !c.specific_date && c.day_of_week === d).sort(byTime);
  const days = DAY_ORDER.filter((d) => d !== 0 || daySlots(0).length > 0);
  const slots = weeklySlots(day);
  const fmtShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = `${fmtShort(weekStart)} – ${fmtShort(isoAdd(weekStart, 6))}`;
  const startMins = classes.filter((c) => c.start_time).map((c) => toMin(c.start_time));
  const firstHour = startMins.length ? Math.min(5, Math.floor(Math.min(...startMins) / 60)) : 5;
  const lastHour = startMins.length ? Math.max(20, Math.ceil((Math.max(...startMins) + DURATION) / 60)) : 20;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  function newSlot(forDay: number = day, time = '06:00') {
    const template = weeklySlots(forDay)[weeklySlots(forDay).length - 1] ?? classes[0];
    setDraft({
      id: null,
      name: template?.name ?? '',
      dayOfWeek: forDay,
      kind: 'weekly',
      date: dateFor(forDay),
      repeatDays: [forDay],
      startTime: time,
      capacity: template?.capacity ?? 12,
      creditCost: template?.credit_cost ?? 1,
      cutoffHours: template?.cutoff_hours ?? 3,
      note: '',
    });
  }

  async function save() {
    if (!draft) return;
    const once = draft.kind === 'once';
    const fields = {
      name: draft.name.trim(),
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
    // Skip anything already in the timetable at this time with this name, so saving twice never doubles up.
    const sameSlot = (c: ClassRow) => c.start_time?.slice(0, 5) === draft.startTime && c.name === fields.name;
    const toCreate: (number | null)[] = once
      ? classes.some((c) => c.specific_date === draft.date && sameSlot(c))
        ? []
        : [null]
      : repeat.filter((d) => !weeklySlots(d).some(sameSlot));
    await run(
      () =>
        draft.id
          ? updateClass(draft.id, fields)
          : Promise.all(toCreate.map((d) => createClass(d === null ? fields : { ...fields, day_of_week: d }))),
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
          setDraft(null);
        },
      }
    );
  }

  async function remove() {
    if (!draft?.id) return;
    const ok = await confirm({
      title: 'Delete this session?',
      body: draft.kind === 'once' ? 'Every booking for this session is removed too. This cannot be undone.' : 'Every booking for this weekly slot is removed too. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await run(() => deleteClass(draft.id!), { success: 'Session deleted', onDone: () => setDraft(null) });
  }

  async function copyDay() {
    const targets = [...copyTo].filter((d) => d !== day);
    if (slots.length === 0 || targets.length === 0) return;
    const jobs: Promise<unknown>[] = [];
    for (const target of targets) {
      const existing = new Set(weeklySlots(target).map((c) => `${c.start_time?.slice(0, 5)}|${c.name}`));
      for (const s of slots) {
        if (existing.has(`${s.start_time?.slice(0, 5)}|${s.name}`)) continue;
        jobs.push(
          createClass({
            name: s.name,
            day_of_week: target,
            start_time: s.start_time,
            capacity: s.capacity,
            credit_cost: s.credit_cost,
            cutoff_hours: s.cutoff_hours,
            coach_note: s.coach_note,
          })
        );
      }
    }
    await run(() => Promise.all(jobs), {
      success: `Copied ${WEEKDAY_LABELS[day]} to ${targets.map((d) => WEEKDAY_SHORT[d]).join(', ')}`,
      onDone: () => {
        setCopying(false);
        setCopyTo(new Set());
      },
    });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="px-1 text-sm font-extrabold text-black dark:text-zinc-50">
          Timetable
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => newSlot(1)}
            className="flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Add session
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-[8.5rem] text-center text-sm font-bold text-black dark:text-zinc-50">{weekLabel}</p>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => isoAdd(w, 7))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {weekStart !== mondayOf(todayIso) && (
          <button type="button" onClick={() => setWeekStart(mondayOf(todayIso))} className="text-sm font-semibold text-accent">
            This week
          </button>
        )}
      </div>

      {classes.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No sessions yet" hint="Add your first session, or tap any slot on the calendar once you have one." compact />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
          <div className="min-w-[21rem]" style={{ display: 'grid', gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(3rem, 1fr))` }}>
            <div className="border-b border-black/[.06] dark:border-white/10" />
            {days.map((d) => (
              <div key={d} className="border-b border-l border-black/[.06] py-2 text-center dark:border-white/10">
                <p className="text-[11px] font-bold uppercase text-zinc-500">{WEEKDAY_SHORT[d]}</p>
                <p
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    dateFor(d) === todayIso ? 'bg-accent text-accent-foreground' : 'text-black dark:text-zinc-100'
                  }`}
                >
                  {Number(dateFor(d).slice(8))}
                </p>
              </div>
            ))}

            <div className="relative" style={{ height: hours.length * HOUR_H }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[11px] text-zinc-400" style={{ top: i * HOUR_H + (i === 0 ? 6 : 0) }}>
                  {formatClock(`${String(h).padStart(2, '0')}:00`)}
                </span>
              ))}
            </div>

            {days.map((d) => {
              const placed = layoutDay(daySlots(d));
              return (
                <div
                  key={d}
                  role="button"
                  tabIndex={0}
                  aria-label={`Add a session on ${WEEKDAY_LABELS[d]}`}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const snapped = Math.floor((((e.clientY - rect.top) / HOUR_H) * 60) / 15) * 15;
                    const total = firstHour * 60 + snapped;
                    newSlot(d, `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && newSlot(d)}
                  className="relative cursor-pointer border-l border-black/[.06] dark:border-white/10"
                  style={{
                    height: hours.length * HOUR_H,
                    backgroundImage: 'linear-gradient(to bottom, transparent calc(100% - 1px), rgba(128,128,128,.18) 0)',
                    backgroundSize: `100% ${HOUR_H}px`,
                  }}
                >
                  {placed.map(({ row, lane, lanes }) => {
                    const start = toMin(row.start_time);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraft(toDraft(row));
                        }}
                        aria-label={`${row.name} ${formatClassTime(row.start_time)} on ${WEEKDAY_LABELS[d]}`}
                        className={`absolute overflow-hidden rounded-lg bg-accent/20 px-1 py-0.5 text-left hover:bg-accent/30 ${
                          row.specific_date ? 'border border-dashed border-accent' : 'ring-1 ring-inset ring-accent/40'
                        }`}
                        style={{
                          top: ((start - firstHour * 60) * HOUR_H) / 60 + 1,
                          height: (DURATION * HOUR_H) / 60 - 2,
                          left: `calc(${(lane / lanes) * 100}% + 1px)`,
                          width: `calc(${100 / lanes}% - 2px)`,
                        }}
                      >
                        <span className="block text-[11px] font-bold leading-tight text-accent">{shortTime(row.start_time)}</span>
                        <span className="block text-[11px] leading-tight text-zinc-500">max {row.capacity}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="px-1 text-xs text-zinc-500">
        Solid blocks repeat every week; dashed blocks are one-off sessions. Times are the gym&apos;s local time. To cancel a single date (for example a bank holiday), use Sessions.
      </p>

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
                <div className="flex gap-1 rounded-full border border-black/10 p-0.5 dark:border-white/10">
                  {([['weekly', 'Repeats weekly'], ['once', 'One-off']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={draft.kind === key}
                      onClick={() => set('kind', key)}
                      className={`flex-1 rounded-full py-2 text-sm font-bold ${draft.kind === key ? 'bg-accent text-accent-foreground' : 'text-zinc-500'}`}
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
                    <input type="date" required className={inputCls} value={draft.date} onChange={(e) => set('date', e.target.value)} />
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
                          className={`rounded-full px-3.5 py-2 text-sm font-bold ${
                            on ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
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
            <Field label="Class">
              <input required list="class-names" className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              <datalist id="class-names">
                {names.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Capacity">
                <input type="number" min={1} className={inputCls} value={draft.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
              </Field>
              <Field label="Credits">
                <input type="number" min={0} className={inputCls} value={draft.creditCost} onChange={(e) => set('creditCost', Number(e.target.value))} />
              </Field>
              <Field label="Cancel (h)">
                <input type="number" min={0} className={inputCls} value={draft.cutoffHours} onChange={(e) => set('cutoffHours', Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Coach note">
              <input className={inputCls} value={draft.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            <button
              type="submit"
              disabled={busy || !draft.name.trim() || (!draft.id && draft.kind === 'weekly' && draft.repeatDays.length === 0)}
              className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save session'}
            </button>
            {draft.id && (
              <button type="button" onClick={remove} className="block w-full py-1 text-sm font-semibold text-danger">
                Delete this session
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
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  d === day ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
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
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    copyTo.has(d) ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
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
            className="w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
          >
            {busy ? 'Copying…' : 'Copy sessions'}
          </button>
        </BottomSheet>
      )}
    </div>
  );
}

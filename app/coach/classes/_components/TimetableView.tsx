'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
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

// The weekly timetable: every class row is one slot (a day, a time, a class). Pick a weekday, see
// its sessions as cards, tap one to edit it in a sheet. Same look as the Sessions tab.

// Monday first, and Sunday only if something is actually scheduled on it.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = {
  id: string | null; // null = new slot
  name: string;
  dayOfWeek: number;
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
    dayOfWeek: c.day_of_week ?? 1,
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
  const days = useMemo(() => DAY_ORDER.filter((d) => d !== 0 || classes.some((c) => c.day_of_week === 0)), [classes]);
  const daySlots = (d: number) =>
    classes.filter((c) => c.day_of_week === d).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  const slots = daySlots(day);
  const startMins = classes.filter((c) => c.start_time).map((c) => toMin(c.start_time));
  const firstHour = startMins.length ? Math.min(5, Math.floor(Math.min(...startMins) / 60)) : 5;
  const lastHour = startMins.length ? Math.max(20, Math.ceil((Math.max(...startMins) + DURATION) / 60)) : 20;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  function newSlot(forDay: number = day, time = '06:00') {
    const template = daySlots(forDay)[daySlots(forDay).length - 1] ?? classes[0];
    setDraft({
      id: null,
      name: template?.name ?? '',
      dayOfWeek: forDay,
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
    const fields = {
      name: draft.name.trim(),
      day_of_week: draft.dayOfWeek,
      start_time: draft.startTime,
      capacity: draft.capacity,
      credit_cost: draft.creditCost,
      cutoff_hours: draft.cutoffHours,
      coach_note: draft.note.trim() || null,
    };
    const repeat = [...new Set(draft.repeatDays)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    if (!draft.id && repeat.length === 0) return;
    // Skip a day that already has this class at this time, so repeating twice never doubles up.
    const isDup = (d: number) => daySlots(d).some((c) => c.start_time?.slice(0, 5) === draft.startTime && c.name === fields.name);
    const toCreate = repeat.filter((d) => !isDup(d));
    await run(
      () =>
        draft.id
          ? updateClass(draft.id, fields)
          : Promise.all(toCreate.map((d) => createClass({ ...fields, day_of_week: d }))),
      {
        success: draft.id
          ? 'Session updated'
          : toCreate.length === 0
            ? 'Already in the timetable'
            : toCreate.length === 1
              ? 'Session added'
              : `Added to ${toCreate.length} days`,
        onDone: () => {
          setDay(draft.dayOfWeek);
          setDraft(null);
        },
      }
    );
  }

  async function remove() {
    if (!draft?.id) return;
    const ok = await confirm({
      title: 'Delete this session?',
      body: 'Every booking for this weekly slot is removed too. This cannot be undone.',
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
      const existing = new Set(daySlots(target).map((c) => `${c.start_time?.slice(0, 5)}|${c.name}`));
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
          Weekly timetable · {classes.length} session{classes.length === 1 ? '' : 's'}
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

      {classes.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No sessions yet" hint="Add your first session, or tap any slot on the calendar once you have one." compact />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.06] bg-card dark:border-white/10">
          <div className="min-w-[21rem]" style={{ display: 'grid', gridTemplateColumns: `2.5rem repeat(${days.length}, minmax(3rem, 1fr))` }}>
            <div className="border-b border-black/[.06] dark:border-white/10" />
            {days.map((d) => (
              <div key={d} className="border-b border-l border-black/[.06] py-2 text-center dark:border-white/10">
                <p className="text-[11px] font-bold uppercase text-zinc-500">{WEEKDAY_SHORT[d]}</p>
                <p className="text-[11px] text-zinc-400">{daySlots(d).length}</p>
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
                        className="absolute overflow-hidden rounded-lg bg-accent/20 px-1 py-0.5 text-left ring-1 ring-inset ring-accent/40 hover:bg-accent/30"
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
        Times are the gym&apos;s local time. To cancel a single date (for example a bank holiday), use Sessions.
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
                <Field label="Day">
                  <select className={inputCls} value={draft.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
                    {DAY_ORDER.map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Start time">
                  <input type="time" required className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
              </div>
            ) : (
              <>
                <Field label="Start time">
                  <input type="time" required className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </Field>
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
              disabled={busy || !draft.name.trim() || (!draft.id && draft.repeatDays.length === 0)}
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

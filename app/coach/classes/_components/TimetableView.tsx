'use client';

import { useMemo, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { Card } from '@/app/_components/ui';
import { createClass, deleteClass, updateClass } from '@/lib/data/classes';
import { formatClassTime, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { ClassRow } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';

// The weekly timetable: every class row is one slot (a day, a time, a class). Shown as a
// Monday-to-Saturday grid on desktop and a day-by-day list on a phone, with per-slot editing.
// (The "By class" view in ClassManager still edits a recurring class as a group.)


// Monday first, and Sunday only if something is actually scheduled on it.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = {
  id: string | null; // null = new slot
  name: string;
  dayOfWeek: number;
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
    startTime: c.start_time?.slice(0, 5) ?? '06:00',
    capacity: c.capacity,
    creditCost: c.credit_cost,
    cutoffHours: c.cutoff_hours,
    note: c.coach_note ?? '',
  };
}

function SlotEditor({
  draft,
  names,
  onChange,
  onSave,
  onDelete,
  onCancel,
  saving,
}: {
  draft: Draft;
  names: string[];
  onChange: (d: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="space-y-3"
      >
        <p className="text-sm font-bold text-black dark:text-zinc-50">{draft.id ? 'Edit session' : 'New session'}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Day</label>
            <select className={inputCls} value={draft.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))}>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>{WEEKDAY_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Start time</label>
            <input type="time" required className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Class</label>
          <input required list="class-names" className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
          <datalist id="class-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Capacity</label>
            <input type="number" min={1} className={inputCls} value={draft.capacity} onChange={(e) => set('capacity', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Credits</label>
            <input type="number" min={0} className={inputCls} value={draft.creditCost} onChange={(e) => set('creditCost', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Cancel cutoff (h)</label>
            <input type="number" min={0} className={inputCls} value={draft.cutoffHours} onChange={(e) => set('cutoffHours', Number(e.target.value))} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Coach note</label>
          <input className={inputCls} value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={saving || !draft.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {draft.id && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function TimetableView({ classes }: { classes: ClassRow[] }) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mobileDay, setMobileDay] = useState<number>(1);
  const [copying, setCopying] = useState(false);
  const [copyTo, setCopyTo] = useState<Set<number>>(new Set());

  const names = useMemo(() => [...new Set(classes.map((c) => c.name))].sort(), [classes]);
  const days = useMemo(() => DAY_ORDER.filter((d) => d !== 0 || classes.some((c) => c.day_of_week === 0)), [classes]);
  const times = useMemo(
    () => [...new Set(classes.filter((c) => c.start_time).map((c) => c.start_time!.slice(0, 5)))].sort(),
    [classes]
  );
  const slotAt = (day: number, time: string) => classes.filter((c) => c.day_of_week === day && c.start_time?.slice(0, 5) === time);
  const daySlots = (day: number) =>
    classes.filter((c) => c.day_of_week === day).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));

  function newSlot(day: number, time = '06:00') {
    const template = daySlots(day)[0] ?? classes[0];
    setDraft({
      id: null,
      name: template?.name ?? '',
      dayOfWeek: day,
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
    await run(() => (draft.id ? updateClass(draft.id, fields) : createClass(fields)), {
      success: draft.id ? 'Session updated' : 'Session added',
      onDone: () => setDraft(null),
    });
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
    const source = daySlots(mobileDay);
    const targets = [...copyTo].filter((d) => d !== mobileDay);
    if (source.length === 0 || targets.length === 0) return;
    const jobs: Promise<void>[] = [];
    for (const target of targets) {
      const existing = new Set(daySlots(target).map((c) => `${c.start_time?.slice(0, 5)}|${c.name}`));
      for (const s of source) {
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
      success: `Copied ${WEEKDAY_LABELS[mobileDay]} to ${targets.map((d) => WEEKDAY_SHORT[d]).join(', ')}`,
      onDone: () => {
        setCopying(false);
        setCopyTo(new Set());
      },
    });
  }

  const editor = draft && (
    <SlotEditor draft={draft} names={names} onChange={setDraft} onSave={save} onDelete={remove} onCancel={() => setDraft(null)} saving={busy} />
  );

  if (classes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">No sessions yet. Add your first one to start the timetable.</p>
        {editor ?? (
          <Button variant="primary" onClick={() => newSlot(1)}>
            <Plus className="mr-1 h-4 w-4" /> Add session
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {editor}

      {/* Desktop: times down the side, days across the top. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-black/[.06] bg-card md:block dark:border-white/10">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="w-20 p-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Time</th>
              {days.map((d) => (
                <th key={d} className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {WEEKDAY_SHORT[d]}
                  <span className="ml-1 font-normal normal-case text-zinc-400">{daySlots(d).length}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="whitespace-nowrap p-2.5 font-semibold text-black dark:text-zinc-50">{formatClassTime(time)}</td>
                {days.map((d) => {
                  const slots = slotAt(d, time);
                  return (
                    <td key={d} className="p-1.5 align-top">
                      {slots.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => newSlot(d, time)}
                          aria-label={`Add a session on ${WEEKDAY_LABELS[d]} at ${formatClassTime(time)}`}
                          className="flex h-full min-h-9 w-full items-center justify-center rounded-lg text-zinc-300 hover:bg-black/5 hover:text-accent dark:text-zinc-700 dark:hover:bg-white/5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        slots.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setDraft(toDraft(s))}
                            className="mb-1 block w-full rounded-lg bg-accent/15 px-2 py-1.5 text-left text-xs font-semibold text-accent hover:bg-accent/25"
                          >
                            <span className="block truncate">{s.name}</span>
                            <span className="font-normal opacity-80">max {s.capacity}</span>
                          </button>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: pick a day, see its sessions. */}
      <div className="space-y-3 md:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setMobileDay(d);
                setCopying(false);
              }}
              className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 ${
                mobileDay === d
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-black/[.06] text-zinc-600 dark:border-white/10 dark:text-zinc-300'
              }`}
            >
              <span className="text-[11px] font-bold uppercase">{WEEKDAY_SHORT[d]}</span>
              <span className="text-base font-black">{daySlots(d).length}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {daySlots(mobileDay).length === 0 && <p className="text-sm text-zinc-500">Nothing scheduled on {WEEKDAY_LABELS[mobileDay]}.</p>}
          {daySlots(mobileDay).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setDraft(toDraft(s))}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-card p-3.5 text-left dark:border-white/10"
            >
              <span className="min-w-0">
                <span className="block font-bold text-black dark:text-zinc-50">{s.start_time ? formatClassTime(s.start_time) : '—'}</span>
                <span className="block truncate text-sm text-zinc-500">{s.name}</span>
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                max {s.capacity} · {s.credit_cost} credit{s.credit_cost === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => newSlot(mobileDay)}>
          <Plus className="mr-1 h-4 w-4" /> Add session
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCopying((c) => !c)}>
          <Copy className="mr-1 h-4 w-4" /> Copy {WEEKDAY_SHORT[mobileDay]} to other days
        </Button>
      </div>

      {copying && (
        <Card>
          <p className="mb-2 text-sm font-semibold text-black dark:text-zinc-50">
            Copy {WEEKDAY_LABELS[mobileDay]}&apos;s {daySlots(mobileDay).length} sessions to:
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {days
              .filter((d) => d !== mobileDay)
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
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    copyTo.has(d) ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                  }`}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
          </div>
          <p className="mb-3 text-xs text-zinc-500">Sessions already at the same time on that day are skipped.</p>
          <Button variant="primary" size="sm" disabled={busy || copyTo.size === 0} onClick={copyDay}>
            {busy ? 'Copying…' : 'Copy'}
          </Button>
        </Card>
      )}

      <p className="text-xs text-zinc-500">
        Members can book each session up to its capacity; times are the gym&apos;s local time. To cancel a single date
        (for example a bank holiday), use Sessions.
      </p>
    </div>
  );
}

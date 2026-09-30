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

  function newSlot() {
    const template = slots[slots.length - 1] ?? classes[0];
    setDraft({
      id: null,
      name: template?.name ?? '',
      dayOfWeek: day,
      startTime: '06:00',
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
      onDone: () => {
        setDay(draft.dayOfWeek);
        setDraft(null);
      },
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
          {WEEKDAY_LABELS[day]} · {slots.length} session{slots.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newSlot}
            className="flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Add session
          </button>
          <DropdownMenu
            variant="header"
            triggerLabel="More timetable actions"
            items={[{ label: `Copy ${WEEKDAY_SHORT[day]} to other days`, disabled: slots.length === 0, onSelect: () => setCopying(true) }]}
          />
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((d) => {
          const n = daySlots(d).length;
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={active}
              className={`flex w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-colors ${
                active
                  ? 'border-accent bg-accent text-accent-foreground'
                  : n > 0
                    ? 'border-black/[.06] bg-card text-black dark:border-white/10 dark:text-zinc-100'
                    : 'border-transparent text-zinc-400 dark:text-zinc-600'
              }`}
            >
              <span className="text-[11px] font-bold uppercase opacity-80">{WEEKDAY_SHORT[d]}</span>
              <span className="text-base font-black leading-none">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {slots.length === 0 && (
          <EmptyState icon={CalendarDays} title={`Nothing on ${WEEKDAY_LABELS[day]}`} hint="Add a session, or copy another day across from its ⋯ menu." compact />
        )}
        {slots.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setDraft(toDraft(s))}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-card p-3.5 text-left dark:border-white/10"
          >
            <span className="min-w-0">
              <span className="block text-lg font-extrabold leading-tight text-black dark:text-zinc-50">{s.start_time ? formatClassTime(s.start_time) : '—'}</span>
              <span className="block truncate text-xs text-zinc-500">{s.name}</span>
            </span>
            <span className="shrink-0 text-right text-xs text-zinc-500">
              <span className="block">max {s.capacity}</span>
              <span className="block">
                {s.credit_cost} credit{s.credit_cost === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        ))}
      </div>

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
              disabled={busy || !draft.name.trim()}
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
        <BottomSheet title={`Copy ${WEEKDAY_LABELS[day]}`} onClose={() => setCopying(false)}>
          <p className="mb-3 text-sm text-zinc-500">
            Copy its {slots.length} session{slots.length === 1 ? '' : 's'} to:
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

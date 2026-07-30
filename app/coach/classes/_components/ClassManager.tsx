'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createClasses, deleteClass } from '@/lib/data/classes';
import type { ClassRow } from '@/lib/data/types';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type OccurrenceRow = { id: number; dayOfWeek: number; startTime: string };

let nextRowId = 1;

export function ClassManager({ initialClasses }: { initialClasses: ClassRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [name, setName] = useState('');
  const [occurrenceRows, setOccurrenceRows] = useState<OccurrenceRow[]>([
    { id: nextRowId++, dayOfWeek: 1, startTime: '06:00' },
  ]);
  const [capacity, setCapacity] = useState(10);
  const [creditCost, setCreditCost] = useState(1);
  const [cutoffHours, setCutoffHours] = useState(12);
  const [note, setNote] = useState('');

  function addOccurrenceRow() {
    setOccurrenceRows((rows) => [...rows, { id: nextRowId++, dayOfWeek: 1, startTime: '06:00' }]);
  }

  function removeOccurrenceRow(id: number) {
    setOccurrenceRows((rows) => rows.filter((r) => r.id !== id));
  }

  function updateOccurrenceRow(id: number, patch: Partial<OccurrenceRow>) {
    setOccurrenceRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createClasses(
          { name, capacity, credit_cost: creditCost, cutoff_hours: cutoffHours, coach_note: note || null },
          occurrenceRows.map((r) => ({ day_of_week: r.dayOfWeek, start_time: r.startTime }))
        ),
      {
        success: occurrenceRows.length > 1 ? `${occurrenceRows.length} classes added` : 'Class added',
        onDone: () => {
          setName('');
          setOccurrenceRows([{ id: nextRowId++, dayOfWeek: 1, startTime: '06:00' }]);
        },
      }
    );
  }

  async function handleDelete(id: string, className: string) {
    const ok = await confirm({
      title: `Delete “${className}”?`,
      body: 'Every booking for this class is removed too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteClass(id), { success: 'Class deleted' });
  }

  const inputCls =
    'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';
  const smallInputCls =
    'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <label className="text-xs font-medium text-zinc-500">Name</label>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Capacity</label>
            <input type="number" className={inputCls} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Credits per booking</label>
            <input type="number" min={0} className={inputCls} value={creditCost} onChange={(e) => setCreditCost(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Cutoff (hours)</label>
            <input type="number" className={inputCls} value={cutoffHours} onChange={(e) => setCutoffHours(Number(e.target.value))} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-500">Days &amp; times</label>
          {occurrenceRows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <select
                className={`${smallInputCls} flex-1`}
                value={row.dayOfWeek}
                onChange={(e) => updateOccurrenceRow(row.id, { dayOfWeek: Number(e.target.value) })}
              >
                {WEEKDAY_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <input
                type="time"
                className={smallInputCls}
                value={row.startTime}
                onChange={(e) => updateOccurrenceRow(row.id, { startTime: e.target.value })}
              />
              {occurrenceRows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOccurrenceRow(row.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addOccurrenceRow} className="text-xs font-medium text-zinc-500 hover:underline">
            + Add another day/time
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Note</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? 'Adding…' : occurrenceRows.length > 1 ? `Add ${occurrenceRows.length} classes` : 'Add class'}
        </button>
      </form>

      {initialClasses.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes yet"
          hint="Add your first recurring class above — it'll then show up on the schedule for clients to book."
        />
      ) : (
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {initialClasses.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {c.name} — {c.day_of_week != null ? WEEKDAY_LABELS[c.day_of_week] : '—'}{' '}
              {c.start_time?.slice(0, 5)} · capacity {c.capacity} · {c.credit_cost} credit{c.credit_cost === 1 ? '' : 's'} ·{' '}
              {c.cutoff_hours}h cutoff
            </span>
            <button
              onClick={() => handleDelete(c.id, c.name)}
              className="text-xs text-red-600 hover:underline dark:text-red-400"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

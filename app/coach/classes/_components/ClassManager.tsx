'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createClass, deleteClass } from '@/lib/data/classes';
import type { ClassRow } from '@/lib/data/types';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ClassManager({ initialClasses }: { initialClasses: ClassRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [name, setName] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('06:00');
  const [capacity, setCapacity] = useState(10);
  const [cutoffHours, setCutoffHours] = useState(12);
  const [note, setNote] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createClass({
          name,
          day_of_week: dayOfWeek,
          start_time: startTime,
          capacity,
          cutoff_hours: cutoffHours,
          coach_note: note || null,
        }),
      { success: 'Class added', onDone: () => setName('') }
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10 sm:grid-cols-3">
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Day</label>
          <select className={inputCls} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Start time</label>
          <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Capacity</label>
          <input type="number" className={inputCls} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Cutoff (hours)</label>
          <input type="number" className={inputCls} value={cutoffHours} onChange={(e) => setCutoffHours(Number(e.target.value))} />
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-3">
          <label className="text-xs font-medium text-zinc-500">Note</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50 sm:col-span-3"
        >
          {saving ? 'Adding…' : 'Add class'}
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
              {c.start_time?.slice(0, 5)} · capacity {c.capacity} · {c.cutoff_hours}h cutoff
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

'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createClasses, deleteClass, updateClass } from '@/lib/data/classes';
import type { ClassRow } from '@/lib/data/types';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type OccurrenceRow = { id: number; dayOfWeek: number; startTime: string };

let nextRowId = 1;

// Links this recurring class to a workout-program "day position" (see lib/utils/checkin.ts)
// so a client can self-check-in and land straight in the matching week's version of that day.
// Not part of the creation form -- usually decided once the program structure exists, not
// while first setting up the class schedule.
function LinkedDayPositionInput({ classId, initial }: { classId: string; initial: number | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial != null ? String(initial) : '');

  async function handleBlur() {
    const parsed = value === '' ? null : Number(value);
    if (parsed === initial) return;
    await run(() => updateClass(classId, { linked_day_position: parsed }));
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      Day #
      <input
        type="number"
        title="Linked day position -- links this class to a workout day slot"
        className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
    </label>
  );
}

// "Edit class" bottom sheet -- Schedule/Capacity/Credit cost/Coach note + Save/Delete/Cancel,
// matching the prototype's tap-a-row-to-edit pattern instead of the row only offering delete.
function EditClassSheet({
  classRow,
  onClose,
  onDelete,
}: {
  classRow: ClassRow;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { run, busy: saving } = useAction();
  const [name, setName] = useState(classRow.name);
  const [dayOfWeek, setDayOfWeek] = useState(classRow.day_of_week ?? 1);
  const [startTime, setStartTime] = useState(classRow.start_time?.slice(0, 5) ?? '06:00');
  const [capacity, setCapacity] = useState(classRow.capacity);
  const [creditCost, setCreditCost] = useState(classRow.credit_cost);
  const [cutoffHours, setCutoffHours] = useState(classRow.cutoff_hours);
  const [note, setNote] = useState(classRow.coach_note ?? '');

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateClass(classRow.id, {
          name,
          day_of_week: dayOfWeek,
          start_time: startTime,
          capacity,
          credit_cost: creditCost,
          cutoff_hours: cutoffHours,
          coach_note: note || null,
        }),
      { success: 'Class updated', onDone: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit class"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">Edit class</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Name</label>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Schedule</label>
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                {WEEKDAY_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Capacity</label>
              <input type="number" className={inputCls} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Credit cost</label>
              <input type="number" min={0} className={inputCls} value={creditCost} onChange={(e) => setCreditCost(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Cutoff (h)</label>
              <input type="number" className={inputCls} value={cutoffHours} onChange={(e) => setCutoffHours(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Coach note</label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="danger" onClick={() => onDelete(classRow.id, classRow.name)}>
              Delete
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ClassManager({ initialClasses }: { initialClasses: ClassRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [addingClass, setAddingClass] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
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
          setAddingClass(false);
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
    await runDelete(() => deleteClass(id), { success: 'Class deleted', onDone: () => setEditingClassId(null) });
  }

  const inputCls =
    'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';
  const smallInputCls =
    'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      {addingClass ? (
        <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <label className="text-xs font-medium text-zinc-500">Name</label>
              <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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
                  <Button type="button" variant="danger" size="sm" onClick={() => removeOccurrenceRow(row.id)}>
                    Remove
                  </Button>
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

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {saving ? 'Adding…' : occurrenceRows.length > 1 ? `Add ${occurrenceRows.length} classes` : 'Add class'}
            </button>
            <Button type="button" variant="ghost" onClick={() => setAddingClass(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingClass(true)}
          className="w-full rounded-2xl border-[1.5px] border-dashed border-black/15 py-3 text-sm font-semibold text-zinc-500 dark:border-white/15"
        >
          + Add class
        </button>
      )}

      {initialClasses.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes yet"
          hint="Add your first recurring class above — it'll then show up on the schedule for clients to book."
        />
      ) : (
      <>
      <p className="text-xs text-zinc-500">
        <strong className="font-medium">Linked day #</strong> connects a class to a slot in a
        client&apos;s programme — whatever a coach numbered as Day 1, 2, 3… when building that
        client&apos;s programme (see the day-position field on each workout day). Once linked,
        a client booked into that class can self-check-in straight into logging that day&apos;s
        workout.
      </p>
      <div className="space-y-2">
        {initialClasses.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
          >
            <button type="button" onClick={() => setEditingClassId(c.id)} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-black dark:text-zinc-50">{c.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {c.day_of_week != null ? WEEKDAY_LABELS[c.day_of_week] : '—'} {c.start_time?.slice(0, 5)} · cap{' '}
                {c.capacity} · {c.credit_cost} credit{c.credit_cost === 1 ? '' : 's'} · {c.cutoff_hours}h cutoff
              </p>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <LinkedDayPositionInput classId={c.id} initial={c.linked_day_position} />
            </div>
          </div>
        ))}
      </div>
      </>
      )}

      {editingClassId && (
        <EditClassSheet
          classRow={initialClasses.find((c) => c.id === editingClassId)!}
          onClose={() => setEditingClassId(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

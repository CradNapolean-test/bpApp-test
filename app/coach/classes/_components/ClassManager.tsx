'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createClass, createClasses, deleteClass, updateClass } from '@/lib/data/classes';
import { formatClassTime, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/utils/dates';
import type { ClassRow } from '@/lib/data/types';

type OccurrenceRow = { rowId: number; classId: string | null; dayOfWeek: number; startTime: string };

let nextRowId = 1;

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

// One design "class" (e.g. "Strength Circuit, Mon/Wed/Fri 6am") is actually several ClassRow
// occurrences sharing a name, one per {day_of_week, start_time} -- see createClasses' comment
// in lib/data/classes.ts. Grouping here is purely a display/edit concern; the DB stays
// occurrence-per-row so attendance and bookings keep working per specific day.
type ClassGroup = {
  name: string;
  capacity: number;
  creditCost: number;
  cutoffHours: number;
  coachNote: string | null;
  occurrences: ClassRow[];
};

function groupClasses(classes: ClassRow[]): ClassGroup[] {
  const order: string[] = [];
  const map = new Map<string, ClassRow[]>();
  for (const c of classes) {
    if (!map.has(c.name)) {
      order.push(c.name);
      map.set(c.name, []);
    }
    map.get(c.name)!.push(c);
  }
  return order.map((name) => {
    const occurrences = map.get(name)!;
    const first = occurrences[0];
    return {
      name,
      capacity: first.capacity,
      creditCost: first.credit_cost,
      cutoffHours: first.cutoff_hours,
      coachNote: first.coach_note,
      occurrences,
    };
  });
}

function formatScheduleSummary(group: ClassGroup): string {
  const days = group.occurrences.map((o) => (o.day_of_week != null ? WEEKDAY_SHORT[o.day_of_week] : '—')).join('/');
  const times = new Set(group.occurrences.map((o) => o.start_time));
  const timeLabel =
    times.size <= 1 ? formatClassTime(group.occurrences[0].start_time) : group.occurrences.map((o) => formatClassTime(o.start_time)).join('/');
  return `${days} · ${timeLabel} · Cap ${group.capacity} · ${group.creditCost} credit${group.creditCost === 1 ? '' : 's'}`;
}

// Shared occurrence-row editor (day + time, add/remove) used by both the Add form and the
// group Edit form.
function OccurrenceRowsEditor({
  rows,
  onChange,
}: {
  rows: OccurrenceRow[];
  onChange: (rows: OccurrenceRow[]) => void;
}) {
  function update(rowId: number, patch: Partial<OccurrenceRow>) {
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, { rowId: nextRowId++, classId: null, dayOfWeek: 1, startTime: '06:00' }]);
  }
  function remove(rowId: number) {
    onChange(rows.filter((r) => r.rowId !== rowId));
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-zinc-500">Days &amp; times</label>
      {rows.map((row) => (
        <div key={row.rowId} className="flex items-center gap-2">
          <select
            className={`${inputCls} flex-1`}
            value={row.dayOfWeek}
            onChange={(e) => update(row.rowId, { dayOfWeek: Number(e.target.value) })}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
          <input
            type="time"
            className={inputCls}
            value={row.startTime}
            onChange={(e) => update(row.rowId, { startTime: e.target.value })}
          />
          {rows.length > 1 && (
            <Button type="button" variant="danger" size="sm" onClick={() => remove(row.rowId)}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-medium text-zinc-500 hover:underline">
        + Add another day/time
      </button>
    </div>
  );
}

// Inline edit -- replaces the group's own row with an editable form in place, matching the
// design's desktop pattern (plenty of width for this instead of a mobile bottom sheet).
// Reconciles the occurrence list against the DB on save: existing rows get updated in place,
// newly-added day/times become new ClassRow occurrences, removed ones get deleted.
function EditClassGroup({
  group,
  onClose,
  onDelete,
}: {
  group: ClassGroup;
  onClose: () => void;
  onDelete: (group: ClassGroup) => void;
}) {
  const { run, busy: saving } = useAction();
  const [name, setName] = useState(group.name);
  const [capacity, setCapacity] = useState(group.capacity);
  const [creditCost, setCreditCost] = useState(group.creditCost);
  const [cutoffHours, setCutoffHours] = useState(group.cutoffHours);
  const [note, setNote] = useState(group.coachNote ?? '');
  const [occurrenceRows, setOccurrenceRows] = useState<OccurrenceRow[]>(
    group.occurrences.map((o) => ({
      rowId: nextRowId++,
      classId: o.id,
      dayOfWeek: o.day_of_week ?? 1,
      startTime: o.start_time?.slice(0, 5) ?? '06:00',
    }))
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const shared = { name, capacity, credit_cost: creditCost, cutoff_hours: cutoffHours, coach_note: note || null };
    const keptIds = new Set(occurrenceRows.map((r) => r.classId).filter((id): id is string => id != null));
    const removedIds = group.occurrences.map((o) => o.id).filter((id) => !keptIds.has(id));

    await run(
      () =>
        Promise.all([
          ...occurrenceRows.map((row) =>
            row.classId
              ? updateClass(row.classId, { ...shared, day_of_week: row.dayOfWeek, start_time: row.startTime })
              : createClass({ ...shared, day_of_week: row.dayOfWeek, start_time: row.startTime })
          ),
          ...removedIds.map((id) => deleteClass(id)),
        ]),
      { success: 'Class updated', onDone: onClose }
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <OccurrenceRowsEditor rows={occurrenceRows} onChange={setOccurrenceRows} />

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
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={saving || occurrenceRows.length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="danger" onClick={() => onDelete(group)}>
            Delete
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function AddClassForm({ onDone }: { onDone: () => void }) {
  const { run: runCreate, busy: saving } = useAction();
  const [name, setName] = useState('');
  const [occurrenceRows, setOccurrenceRows] = useState<OccurrenceRow[]>([
    { rowId: nextRowId++, classId: null, dayOfWeek: 1, startTime: '06:00' },
  ]);
  const [capacity, setCapacity] = useState(10);
  const [creditCost, setCreditCost] = useState(1);
  const [cutoffHours, setCutoffHours] = useState(12);
  const [note, setNote] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createClasses(
          { name, capacity, credit_cost: creditCost, cutoff_hours: cutoffHours, coach_note: note || null },
          occurrenceRows.map((r) => ({ day_of_week: r.dayOfWeek, start_time: r.startTime }))
        ),
      { success: 'Class added', onDone }
    );
  }

  return (
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

      <OccurrenceRowsEditor rows={occurrenceRows} onChange={setOccurrenceRows} />

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Note</label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving || occurrenceRows.length === 0}>
          {saving ? 'Adding…' : occurrenceRows.length > 1 ? `Add ${occurrenceRows.length} classes` : 'Add class'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ClassManager({ initialClasses }: { initialClasses: ClassRow[] }) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [addingClass, setAddingClass] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);

  async function handleDeleteGroup(group: ClassGroup) {
    const ok = await confirm({
      title: `Delete “${group.name}”?`,
      body: 'Every occurrence and booking for this class is removed too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => Promise.all(group.occurrences.map((o) => deleteClass(o.id))), {
      success: 'Class deleted',
      onDone: () => setEditingName(null),
    });
  }

  const groups = groupClasses(initialClasses);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        A client booked into a class gets an automatic check-in button when their programme has
        a workout day set for that same day of the week — no separate linking step needed.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingClass(true)}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + Add class
        </button>
      </div>

      {addingClass && <AddClassForm onDone={() => setAddingClass(false)} />}

      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes yet"
          hint="Add your first recurring class above — it'll then show up on the schedule for clients to book."
        />
      ) : (
        <div className="space-y-2">
          {groups.map((group) =>
            editingName === group.name ? (
              <EditClassGroup key={group.name} group={group} onClose={() => setEditingName(null)} onDelete={handleDeleteGroup} />
            ) : (
              <div
                key={group.name}
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-bold text-black dark:text-zinc-50">{group.name}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">{formatScheduleSummary(group)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingName(group.name)}
                    className="text-sm font-semibold text-black hover:underline dark:text-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(group)}
                    className="text-sm font-semibold text-danger hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

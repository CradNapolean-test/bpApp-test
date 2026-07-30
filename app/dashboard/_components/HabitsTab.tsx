'use client';

import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createHabit, deleteHabit, toggleHabitLog } from '@/lib/data/habits';
import { adherencePercent } from '@/lib/utils/habitStats';
import { toIsoDate } from '@/lib/utils/dates';
import type { HabitWithLogs } from '@/lib/data/types';

export function HabitsTab({
  clientId,
  isCoachView,
  habits,
}: {
  clientId: string;
  isCoachView: boolean;
  habits: HabitWithLogs[];
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const today = toIsoDate(new Date());
  const [newHabitName, setNewHabitName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createHabit(clientId, newHabitName), {
      success: 'Habit added',
      onDone: () => setNewHabitName(''),
    });
  }

  async function handleDelete(habitId: string, name: string) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: 'The habit and its whole completion history are removed.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteHabit(habitId), { success: 'Habit deleted' });
  }

  async function handleToggleToday(habit: HabitWithLogs) {
    const todaysLog = habit.logs.find((l) => l.log_date === today);
    setBusyId(habit.id);
    try {
      await runMutate(() => toggleHabitLog(habit.id, today, !(todaysLog?.completed ?? false)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {isCoachView && (
        <form onSubmit={handleCreate} className="flex items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-zinc-500">New habit</label>
            <input
              required
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              placeholder="e.g. 10,000 steps"
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {creating ? 'Adding…' : 'Add habit'}
          </button>
        </form>
      )}

      {habits.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No habits assigned yet"
          hint={isCoachView ? 'Add one above — clients tick it off from their own dashboard.' : 'Check back once your coach adds some.'}
        />
      ) : (
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {habits.map((habit) => {
          const todaysLog = habit.logs.find((l) => l.log_date === today);
          const doneToday = todaysLog?.completed ?? false;
          return (
            <li key={habit.id} className="flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-3">
                {!isCoachView && (
                  <input
                    type="checkbox"
                    checked={doneToday}
                    disabled={busyId === habit.id}
                    onChange={() => handleToggleToday(habit)}
                  />
                )}
                <span>{habit.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">{adherencePercent(habit.logs)}% (30d)</span>
                {isCoachView && (
                  <button
                    onClick={() => handleDelete(habit.id, habit.name)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { setDefaultCheckinReminderDays } from '@/lib/data/coachSettings';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 14];

export function DefaultCheckinReminderForm({ initialDays }: { initialDays: number }) {
  const { run, busy } = useAction();
  const [days, setDays] = useState(initialDays);

  async function handleChange(value: number) {
    setDays(value);
    await run(() => setDefaultCheckinReminderDays(value), {
      success: value === 0 ? 'Default reminders turned off' : `Default set to ${value} days`,
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Default check-in reminder</h3>
      <p className="text-xs text-zinc-500">
        How long a new client can go without logging before they get a nudge. Applied when a client&apos;s
        Setup is first saved — you can still override it per client from their Credits tab.
      </p>
      <select
        value={days}
        disabled={busy}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      >
        <option value={0}>Off</option>
        {DAY_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d} {d === 1 ? 'day' : 'days'}
          </option>
        ))}
      </select>
    </div>
  );
}

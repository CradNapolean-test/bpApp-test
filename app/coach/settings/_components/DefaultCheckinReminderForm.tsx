'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { setDefaultCheckinReminderDays } from '@/lib/data/coachSettings';
import { inputCls } from '@/app/_components/ui';

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
        How long a new member can go without logging before they get a nudge. It applies when a member&apos;s details are
        first saved. You can change it for one member under their Profile → Credits &amp; plan.
      </p>
      <select
        value={days}
        disabled={busy}
        onChange={(e) => handleChange(Number(e.target.value))}
        className={inputCls}
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

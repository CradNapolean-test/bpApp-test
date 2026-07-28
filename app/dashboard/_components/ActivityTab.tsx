'use client';

import { useMemo, useState } from 'react';
import { equivalentMinutesForActivity, stepTargetForWeek } from '@/lib/calculations';
import type { ActivityRow } from '@/lib/data/types';

export function ActivityTab({
  activities,
  bodyWeightKg,
  programWeek,
}: {
  activities: ActivityRow[];
  bodyWeightKg: number | null;
  programWeek: number;
}) {
  const [weight, setWeight] = useState(bodyWeightKg ?? 70);
  const [minutesPer1000, setMinutesPer1000] = useState(10);
  const [stepTarget, setStepTarget] = useState(stepTargetForWeek(programWeek));

  const rows = useMemo(
    () =>
      activities
        .map((a) => ({
          ...a,
          minutes: equivalentMinutesForActivity(stepTarget, minutesPer1000, weight, a.met),
        }))
        .sort((a, b) => a.minutes - b.minutes),
    [activities, stepTarget, minutesPer1000, weight]
  );

  const inputCls =
    'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Minutes to walk 1000 steps</label>
          <input type="number" step="0.5" className={inputCls} value={minutesPer1000}
            onChange={(e) => setMinutesPer1000(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Step target</label>
          <input type="number" className={inputCls} value={stepTarget}
            onChange={(e) => setStepTarget(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Bodyweight (kg)</label>
          <input type="number" step="0.1" className={inputCls} value={weight}
            onChange={(e) => setWeight(Number(e.target.value))} />
        </div>
      </div>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between p-3 text-sm">
            <span>{row.name}</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {row.minutes.toFixed(1)} min
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

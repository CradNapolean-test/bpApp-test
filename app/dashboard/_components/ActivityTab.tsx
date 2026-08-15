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
    'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10';
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-zinc-500';

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Min per 1000 steps</label>
            <input type="number" step="0.5" className={inputCls} value={minutesPer1000}
              onChange={(e) => setMinutesPer1000(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Step target</label>
            <input type="number" className={inputCls} value={stepTarget}
              onChange={(e) => setStepTarget(Number(e.target.value))} />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Bodyweight (kg)</label>
          <input type="number" step="0.1" className={inputCls} value={weight}
            onChange={(e) => setWeight(Number(e.target.value))} />
        </div>
      </div>

      <ul className="divide-y divide-black/5 rounded-2xl border border-black/[.05] dark:divide-white/5 dark:border-white/10">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between p-3.5 text-sm">
            <span className="text-black dark:text-zinc-50">{row.name}</span>
            <span className="font-bold text-black dark:text-zinc-50">
              {row.minutes.toFixed(1)} min
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

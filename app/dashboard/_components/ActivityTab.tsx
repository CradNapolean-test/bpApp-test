'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { equivalentMinutesForActivity, STANDARD_STEP_TARGET } from '@/lib/calculations';
import { Card, inputCls } from '@/app/_components/ui';
import type { ActivityRow } from '@/lib/data/types';

// "Step swap": what the step target is worth in other activities. The maths is
// equivalentMinutesForActivity (validated against the coach's spreadsheet) -- this screen only
// presents it. Bodyweight is passed through to that function but doesn't change the answer (it
// cancels out of the ratio), so it isn't offered as an input.

const CATEGORIES = ['All', 'Walking', 'Running', 'Cycling', 'Swimming', 'Gym'] as const;
type Category = (typeof CATEGORIES)[number];

function categoryOf(name: string): Exclude<Category, 'All'> {
  const first = name.split(/[ ,]/)[0].toLowerCase();
  if (first === 'walking') return 'Walking';
  if (first === 'running') return 'Running';
  if (first === 'bicycling') return 'Cycling';
  if (first === 'swimming') return 'Swimming';
  return 'Gym';
}

// "running, 10 mph (6 min/mile) / 16.1 kph" -> title "Running", detail "10 mph (6 min/mile) / 16.1 kph".
function splitName(name: string): { title: string; detail: string | null } {
  const [head, ...rest] = name.split(/,\s*/);
  const title = head.toLowerCase() === 'bicycling' ? 'Cycling' : head.charAt(0).toUpperCase() + head.slice(1);
  return { title, detail: rest.length > 0 ? rest.join(', ') : null };
}

export function ActivityTab({
  activities,
  bodyWeightKg,
}: {
  activities: ActivityRow[];
  bodyWeightKg: number | null;
}) {
  const [minutesPer1000, setMinutesPer1000] = useState<number | ''>(10);
  const [stepTarget, setStepTarget] = useState<number | ''>(STANDARD_STEP_TARGET);
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');

  const steps = stepTarget === '' ? 0 : stepTarget;
  const mp1000 = minutesPer1000 === '' ? 0 : minutesPer1000;
  const walkingMinutes = Math.round((mp1000 * steps) / 1000);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities
      .map((a) => ({ ...a, minutes: equivalentMinutesForActivity(steps, mp1000, bodyWeightKg ?? 70, a.met), ...splitName(a.name), category: categoryOf(a.name) }))
      .filter((r) => (category === 'All' || r.category === category) && (q === '' || r.name.toLowerCase().includes(q)))
      .sort((a, b) => a.minutes - b.minutes);
  }, [activities, steps, mp1000, bodyWeightKg, category, query]);

  const numberField = (label: string, hint: string, value: number | '', set: (v: number | '') => void, step?: string) => (
    <label className="block space-y-1">
      <span className="block text-xs font-bold text-black dark:text-zinc-50">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        className={`${inputCls} text-base font-semibold`}
        value={value}
        onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))}
      />
      <span className="block text-[11px] leading-snug text-zinc-500">{hint}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <Card tone="accent" className="space-y-3">
        <div>
          <p className="text-base font-extrabold text-black dark:text-zinc-50">Can&apos;t get your steps in?</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Swap them for another activity. Each row shows how long gives you the same effort as your step target.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {numberField('Minutes per 1,000 steps', 'How long you take to walk 1,000 steps', minutesPer1000, setMinutesPer1000, '0.5')}
          {numberField('Step target', 'Our standard daily goal', stepTarget, setStepTarget)}
        </div>
        <p className="rounded-xl bg-black/[.04] px-3 py-2 text-sm text-zinc-700 dark:bg-white/[.06] dark:text-zinc-300">
          <span className="font-bold text-black dark:text-zinc-50">{steps.toLocaleString()} steps</span> is about{' '}
          <span className="font-bold text-black dark:text-zinc-50">{walkingMinutes} minutes</span> of walking.
        </p>
      </Card>

      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Search activities"
            className={`${inputCls} pl-10`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                category === c
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-black/[.08] bg-card text-zinc-700 dark:border-white/[.12] dark:text-zinc-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No activities match.</p>
      ) : (
        <ul className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/[.06] bg-card dark:divide-white/5 dark:border-white/10">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-bold text-black dark:text-zinc-50">{row.title}</span>
                {row.detail && <span className="block text-xs text-zinc-500">{row.detail}</span>}
              </span>
              <span className="shrink-0 whitespace-nowrap text-right">
                <span className="text-lg font-black text-accent">{Math.round(row.minutes)}</span>
                <span className="ml-1 text-xs font-semibold text-zinc-500">min</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { NO_TARGETS_YET, PLAN_BEING_SET_UP } from '@/lib/onboarding';
import CountUp from '@/app/_components/motion/CountUp';

// The member's day of food at a glance (the November 2026 mock-ups): one calorie ring with what is left, then protein, carbs and fat as
// bars. Used on the Coach tab and at the top of the food diary. Rings and bars carry data-grow, so a screen that calls useGrowIn fills
// them up when it opens.

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1">
      {/* The numbers sit under the label: side by side, three of these do not fit a narrow phone and the bars stop lining up. */}
      <p className="text-[13px] font-bold leading-tight text-black dark:text-zinc-50">{label}</p>
      <p className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
        {Math.round(value)} / {Math.round(target)} g
      </p>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${Math.round(value)} of ${Math.round(target)} grams of ${label.toLowerCase()}`}>
        <div data-grow="bar" className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CalorieRing({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, pct)) * c;
  return (
    <svg className="shrink-0" width="72" height="72" viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="9" className="stroke-black/10 dark:stroke-white/15" />
      {/* Nothing eaten yet: no arc at all (a rounded line of no length still draws a dot). */}
      {filled > 0 && (
        <circle data-grow="ring" data-circumference={c} cx="36" cy="36" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="var(--accent)" strokeDasharray={`${filled} ${c}`} transform="rotate(-90 36 36)" />
      )}
    </svg>
  );
}

export function NutritionDayCard({
  totals,
  target,
  held = false,
  eatenLabel = 'eaten',
  children,
}: {
  totals: Macros;
  // The day's own target (a calorie-cycling member's high day has the high one); null while there is none.
  target: Macros | null;
  // The plan is waiting for the coach: a message stands where the numbers would be (M8).
  held?: boolean;
  eatenLabel?: string;
  // Buttons or a control under the numbers (Log food, the high-day switch).
  children?: ReactNode;
}) {
  const left = target ? Math.round(target.calories - totals.calories) : 0;
  return (
    <div className="space-y-3.5 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
      {target ? (
        <>
          <div className="flex items-center gap-3.5">
            <CalorieRing pct={totals.calories / target.calories} />
            <div className="min-w-0">
              <p className={`text-[15px] font-bold ${left < 0 ? 'text-warning' : 'text-black dark:text-zinc-50'}`}>
                <CountUp to={Math.abs(left)} className="text-[28px] font-black leading-none" delay={0.2} /> kcal {left < 0 ? 'over' : 'left'}
              </p>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                {Math.round(totals.calories).toLocaleString('en-GB')} of {Math.round(target.calories).toLocaleString('en-GB')} {eatenLabel}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <MacroBar label="Protein" value={totals.protein} target={target.protein} />
            <MacroBar label="Carbs" value={totals.carbs} target={target.carbs} />
            <MacroBar label="Fat" value={totals.fat} target={target.fat} />
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold leading-snug text-zinc-600 dark:text-zinc-400">
          {held ? `${PLAN_BEING_SET_UP}. Your targets will appear here once they have been checked.` : NO_TARGETS_YET}
        </p>
      )}
      {children}
    </div>
  );
}

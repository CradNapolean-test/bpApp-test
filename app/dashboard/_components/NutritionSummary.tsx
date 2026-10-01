'use client';

import { ProgressRing } from '@/app/_components/ProgressRing';

type Macros = { calories: number; protein: number; carbs: number; fat: number };

// The top of Food Tracking: calories left as a ring, and each macro against its daily target.
// Without a target (profile not finished) it falls back to plain totals.
export function NutritionSummary({ totals, target }: { totals: Macros; target: Macros | null }) {
  const eaten = Math.round(totals.calories);
  const remaining = target ? Math.round(target.calories) - eaten : null;
  const over = remaining != null && remaining < 0;

  const bar = (label: string, value: number, goal: number | null) => {
    const pct = goal && goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
    return (
      <div key={label}>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="font-semibold text-black dark:text-zinc-50">{label}</span>
          <span className="text-zinc-500">
            <span className="font-semibold text-black dark:text-zinc-50">{Math.round(value)}</span>
            {goal != null && ` / ${Math.round(goal)}`} g
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10">
      <div className="relative shrink-0">
        <ProgressRing value={totals.calories} target={target?.calories ?? 0} label="kcal" size={104} strokeWidth={9} hideValue />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-xl font-black leading-none ${over ? 'text-warning' : 'text-black dark:text-zinc-50'}`}>
            {(remaining != null ? Math.abs(remaining) : eaten).toLocaleString()}
          </span>
          <span className="mt-0.5 text-[11px] leading-tight text-zinc-500">
            {remaining == null ? 'kcal eaten' : over ? 'kcal over' : 'kcal left'}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {bar('Protein', totals.protein, target?.protein ?? null)}
        {bar('Carbs', totals.carbs, target?.carbs ?? null)}
        {bar('Fat', totals.fat, target?.fat ?? null)}
        {target && (
          <p className="pt-0.5 text-[11px] text-zinc-500">
            {eaten.toLocaleString()} of {Math.round(target.calories).toLocaleString()} kcal
          </p>
        )}
      </div>
    </div>
  );
}

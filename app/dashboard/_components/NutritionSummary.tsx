'use client';

import { ProgressRing } from '@/app/_components/ProgressRing';
import { Card } from '@/app/_components/ui';

type Macros = { calories: number; protein: number; carbs: number; fat: number };

function MacroRing({ label, unit, value, target }: { label: string; unit: string; value: number; target: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <ProgressRing value={value} target={target ?? 0} label="" size={64} strokeWidth={6} hideValue />
      <p className="text-sm font-black leading-none text-black dark:text-zinc-50">
        {Math.round(value)}
        <span className="text-[11px] font-bold text-zinc-500">{unit}</span>
      </p>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-[11px] text-zinc-400">{target != null ? `of ${Math.round(target)}${unit}` : '—'}</p>
    </div>
  );
}

// The four rings from the owner's "My coaching" overview: calories, protein, carbs and fats, each
// with what's been eaten and its daily target. Shared so Food Tracking and the overview match.
export function TargetRings({ totals, target }: { totals: Macros; target: Macros | null }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <MacroRing label="Calories" unit="" value={totals.calories} target={target?.calories ?? null} />
      <MacroRing label="Protein" unit="g" value={totals.protein} target={target?.protein ?? null} />
      <MacroRing label="Carbs" unit="g" value={totals.carbs} target={target?.carbs ?? null} />
      <MacroRing label="Fats" unit="g" value={totals.fat} target={target?.fat ?? null} />
    </div>
  );
}

// The top of Food Tracking: the same "targets" card as the My coaching overview.
export function NutritionSummary({ totals, target, title, dateLabel }: { totals: Macros; target: Macros | null; title: string; dateLabel: string }) {
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-bold text-black dark:text-zinc-50">{title}</p>
        <p className="text-xs text-zinc-500">{dateLabel}</p>
      </div>
      <TargetRings totals={totals} target={target} />
    </Card>
  );
}

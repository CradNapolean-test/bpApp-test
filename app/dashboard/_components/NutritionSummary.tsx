'use client';

import { ProgressRing } from '@/app/_components/ProgressRing';
import { Card } from '@/app/_components/ui';
import { PLAN_BEING_SET_UP } from '@/lib/onboarding';

type Macros = { calories: number; protein: number; carbs: number; fat: number };

// Ring colours from the owner's My coaching mockup: teal, purple, amber, green.
const RING_COLORS = { calories: 'var(--accent)', protein: '#a07aff', carbs: '#e8a020', fat: '#2ecc71' } as const;

function MacroRing({ label, unit, value, target, color }: { label: string; unit: string; value: number; target: number | null; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="relative">
        <ProgressRing value={value} target={target ?? 0} label="" size={64} strokeWidth={6} color={color} hideValue />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black leading-none text-black dark:text-zinc-50">
          {Math.round(value).toLocaleString()}
          {unit}
        </span>
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-[11px] text-zinc-400">{target != null ? `of ${Math.round(target).toLocaleString()}${unit}` : '—'}</p>
    </div>
  );
}

// The four rings from the owner's "My coaching" overview: calories, protein, carbs and fats, each
// with what's been eaten and its daily target. Shared so Food Tracking and the overview match.
// `held`: the member's plan is still waiting for their coach, so no target is shown (M8); a line says why.
export function TargetRings({ totals, target, held = false }: { totals: Macros; target: Macros | null; held?: boolean }) {
  return (
    <div className="space-y-2">
    <div className="grid grid-cols-4 gap-2">
      <MacroRing label="Calories" unit="" value={totals.calories} target={target?.calories ?? null} color={RING_COLORS.calories} />
      <MacroRing label="Protein" unit="g" value={totals.protein} target={target?.protein ?? null} color={RING_COLORS.protein} />
      <MacroRing label="Carbs" unit="g" value={totals.carbs} target={target?.carbs ?? null} color={RING_COLORS.carbs} />
      <MacroRing label="Fats" unit="g" value={totals.fat} target={target?.fat ?? null} color={RING_COLORS.fat} />
    </div>
    {held && <p className="text-center text-xs font-semibold text-zinc-500">{PLAN_BEING_SET_UP}. Your targets will appear here once they have been checked.</p>}
    </div>
  );
}

// The top of Food Tracking: the same "targets" card as the My coaching overview.
export function NutritionSummary({ totals, target, title, dateLabel, held = false }: { totals: Macros; target: Macros | null; title: string; dateLabel: string; held?: boolean }) {
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-bold text-black dark:text-zinc-50">{title}</p>
        <p className="text-xs text-zinc-500">{dateLabel}</p>
      </div>
      <TargetRings totals={totals} target={target} held={held} />
    </Card>
  );
}

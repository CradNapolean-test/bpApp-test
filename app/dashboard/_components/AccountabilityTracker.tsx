'use client';

import { useState } from 'react';
import { Droplets, Footprints, Minus, Moon, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trafficLight } from '@/lib/utils/accountability';
import type { TrackerMetric, TrafficLight } from '@/lib/utils/accountability';

// Sleep / steps / water card from the owner's BP mockup (07-accountability-tracker): big value,
// green/amber/red status, slider for quick large changes, and always-visible -/+ buttons for
// fine adjustment. The buttons deliberately use fixed colours (not hover-dependent) -- the
// owner flagged that the original -/+ were invisible until hovered.

const CONFIG: Record<TrackerMetric, {
  label: string; icon: LucideIcon; min: number; max: number; step: number; unit: string; hint: string; stepHint: string;
}> = {
  sleep: { label: 'Sleep', icon: Moon, min: 0, max: 12, step: 0.5, unit: 'hrs', hint: '7.5h+ · 6–7.5h · <6h', stepHint: '±0.5 hr steps' },
  steps: { label: 'Steps', icon: Footprints, min: 0, max: 20000, step: 500, unit: 'steps', hint: '8k+ · 4k–8k · <4k', stepHint: '±500 step increments' },
  water: { label: 'Water', icon: Droplets, min: 0, max: 5, step: 0.25, unit: 'L', hint: '2.5L+ · 1–2.5L · <1L', stepHint: '±0.25L steps' },
};

const LIGHT_STYLES: Record<TrafficLight, { badge: string; label: string; bar: string }> = {
  green: { badge: 'bg-success/15 text-success border-success/30', label: 'On track ✓', bar: 'var(--success)' },
  amber: { badge: 'bg-warning/15 text-warning border-warning/30', label: 'Getting there', bar: 'var(--warning)' },
  red: { badge: 'bg-danger/15 text-danger border-danger/30', label: 'Needs work', bar: 'var(--danger)' },
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function AccountabilityTracker({
  metric,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  metric: TrackerMetric;
  value: number | null;
  disabled: boolean;
  // Live value while dragging (state only)...
  onChange: (v: number) => void;
  // ...and the final value once the interaction ends, which is when to persist.
  onCommit: (v: number) => void;
}) {
  const cfg = CONFIG[metric];
  const [waterUnit, setWaterUnit] = useState<'L' | 'mL'>('L');
  const current = value ?? 0;
  const logged = value != null;
  const light = logged ? trafficLight(metric, current) : null;
  const styles = light ? LIGHT_STYLES[light] : null;
  const pct = ((current - cfg.min) / (cfg.max - cfg.min)) * 100;
  const Icon = cfg.icon;

  const display =
    metric === 'sleep' ? current.toFixed(1)
    : metric === 'steps' ? current.toLocaleString()
    : waterUnit === 'L' ? current.toFixed(2)
    : String(Math.round(current * 1000));
  const unit = metric === 'water' ? waterUnit : cfg.unit;

  function nudge(dir: 1 | -1) {
    const next = clamp(+(current + dir * cfg.step).toFixed(2), cfg.min, cfg.max);
    onChange(next);
    onCommit(next);
  }

  return (
    <div className="rounded-2xl border border-black/[.06] bg-[var(--background)] p-3.5 dark:border-white/10">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[13px] font-extrabold text-black dark:text-zinc-50">{cfg.label}</p>
            <p className="text-[10px] text-zinc-500">
              <span className="text-success">●</span> <span className="text-warning">●</span> <span className="text-danger">●</span>{' '}
              {cfg.hint}
            </p>
          </div>
        </div>
        {styles ? (
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${styles.badge}`}>{styles.label}</span>
        ) : (
          <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] font-bold text-zinc-500 dark:border-white/15">
            Not logged
          </span>
        )}
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <p className="leading-none">
          <span className="text-[32px] font-black text-black dark:text-zinc-50">{logged ? display : '—'}</span>
          <span className="ml-1 text-sm font-semibold text-zinc-500">{unit}</span>
        </p>
        {metric === 'water' && (
          <div className="flex gap-0.5 rounded-full border border-black/10 p-0.5 dark:border-white/10">
            {(['L', 'mL'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setWaterUnit(u)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                  waterUnit === u ? 'bg-accent text-accent-foreground' : 'text-zinc-500'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        type="range"
        aria-label={cfg.label}
        className="bp-range mb-2.5"
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        value={current}
        disabled={disabled}
        style={{
          background: `linear-gradient(to right, ${styles?.bar ?? 'var(--accent)'} ${pct}%, rgb(127 127 127 / 0.25) ${pct}%)`,
        }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${cfg.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => nudge(-1)}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-zinc-300 text-zinc-900 disabled:opacity-40"
        >
          <Minus className="h-6 w-6" strokeWidth={3} />
        </button>
        <p className="flex-1 text-center text-[11px] text-zinc-500">{cfg.stepHint}</p>
        <button
          type="button"
          aria-label={`Increase ${cfg.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => nudge(1)}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground disabled:opacity-40"
        >
          <Plus className="h-6 w-6" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

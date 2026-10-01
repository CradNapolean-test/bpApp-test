'use client';

import { useState } from 'react';
import { Droplets, Footprints, Minus, Moon, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trafficLight } from '@/lib/utils/accountability';
import type { TrackerMetric, TrafficLight } from '@/lib/utils/accountability';

// Sleep / steps / water card from the owner's BP mockup (07-accountability-tracker): big value,
// green/amber/red status, slider for quick large changes, and always-visible -/+ buttons for
// fine adjustment. The buttons deliberately use fixed colours (not hover-dependent) -- the
// owner flagged that the original -/+ were invisible until hovered. The big number is also a
// text box, so an exact figure can be typed instead of dragged.

const CONFIG: Record<TrackerMetric, {
  label: string; icon: LucideIcon; min: number; max: number; step: number; unit: string; stepHint: string;
  // Hard limits for a typed value (the slider only covers the usual range).
  typedMax: number;
  bands: [TrafficLight, string][];
}> = {
  sleep: {
    label: 'Sleep', icon: Moon, min: 0, max: 12, step: 0.5, unit: 'hrs', stepHint: '±0.5 hr steps', typedMax: 24,
    bands: [['green', '7.5h+'], ['amber', '6–7.5h'], ['red', '<6h']],
  },
  steps: {
    label: 'Steps', icon: Footprints, min: 0, max: 20000, step: 500, unit: 'steps', stepHint: '±500 step increments', typedMax: 100000,
    bands: [['green', '8k+'], ['amber', '4k–8k'], ['red', '<4k']],
  },
  water: {
    label: 'Water', icon: Droplets, min: 0, max: 5, step: 0.25, unit: 'L', stepHint: '±0.25L steps', typedMax: 10,
    bands: [['green', '2.5L+'], ['amber', '1–2.5L'], ['red', '<1L']],
  },
};

const LIGHT_STYLES: Record<TrafficLight, { badge: string; pill: string; label: string; bar: string }> = {
  green: { badge: 'bg-success/15 text-success border-success/30', pill: 'bg-success/15 text-success border-success/30', label: 'On track ✓', bar: 'var(--success)' },
  amber: { badge: 'bg-warning/15 text-warning border-warning/30', pill: 'bg-warning/15 text-warning border-warning/30', label: 'Getting there', bar: 'var(--warning)' },
  red: { badge: 'bg-danger/15 text-danger border-danger/30', pill: 'bg-danger/15 text-danger border-danger/30', label: 'Needs work', bar: 'var(--danger)' },
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
  // null = not typing; otherwise the text currently in the box.
  const [draft, setDraft] = useState<string | null>(null);
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
  // The figure as plain text for editing (no thousands separators).
  const editable = metric === 'water' && waterUnit === 'mL' ? String(Math.round(current * 1000)) : String(current);

  function nudge(dir: 1 | -1) {
    const next = clamp(+(current + dir * cfg.step).toFixed(2), cfg.min, cfg.max);
    onChange(next);
    onCommit(next);
  }

  // A typed figure: strips commas, reads it in the chosen unit, keeps it inside sensible limits.
  function commitDraft() {
    const text = (draft ?? '').replace(/,/g, '').trim();
    setDraft(null);
    if (text === '') return;
    const typed = Number(text);
    if (!Number.isFinite(typed) || typed < 0) return;
    let next = metric === 'water' && waterUnit === 'mL' ? typed / 1000 : typed;
    next = clamp(next, 0, cfg.typedMax);
    next = metric === 'steps' ? Math.round(next) : +next.toFixed(2);
    if (next === value) return;
    onChange(next);
    onCommit(next);
  }

  const shown = draft ?? (logged ? display : '');

  return (
    <div className="rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">{cfg.label}</p>
        </div>
        {styles ? (
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${styles.badge}`}>{styles.label}</span>
        ) : (
          <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-bold text-zinc-500 dark:border-white/15">
            Not logged
          </span>
        )}
      </div>

      {/* The three bands as colour-coded pills; once a value is in, the band it falls in stands out. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {cfg.bands.map(([band, text]) => (
          <span
            key={band}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold transition-opacity ${LIGHT_STYLES[band].pill} ${
              light && light !== band ? 'opacity-40' : ''
            } ${light === band ? 'ring-2 ring-current/40' : ''}`}
          >
            {text}
          </span>
        ))}
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-baseline leading-none">
          {disabled ? (
            <span className="text-[32px] font-black text-black dark:text-zinc-50">{logged ? display : '—'}</span>
          ) : (
            <input
              type="text"
              inputMode={metric === 'steps' ? 'numeric' : 'decimal'}
              aria-label={`${cfg.label} (type a value)`}
              placeholder="—"
              value={shown}
              onFocus={(e) => {
                setDraft(logged ? editable : '');
                // Select the whole figure so typing replaces it instead of adding to it.
                const box = e.target;
                setTimeout(() => box.select(), 0);
              }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setDraft(null);
              }}
              style={{ width: `${Math.max(2, shown.length + 0.5)}ch` }}
              className="min-w-[2ch] max-w-[10ch] rounded-lg border-0 bg-transparent p-0 text-[32px] font-black leading-none text-black outline-none ring-0 placeholder:text-zinc-400 focus:bg-black/[.04] focus:ring-2 focus:ring-accent/50 dark:text-zinc-50 dark:focus:bg-white/[.06]"
            />
          )}
          <span className="ml-1.5 text-sm font-semibold text-zinc-500">{unit}</span>
        </p>
        {metric === 'water' && (
          <div className="flex gap-0.5 rounded-full border border-black/10 p-0.5 dark:border-white/10">
            {(['L', 'mL'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setWaterUnit(u)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                  waterUnit === u ? 'bg-accent text-accent-foreground' : 'text-zinc-500'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* A coach (or anyone read-only) just sees the value and status -- greyed-out controls that
          can't be used only add noise. */}
      {!disabled && (
        <>
          <input
            type="range"
            aria-label={cfg.label}
            className="bp-range mb-2.5"
            min={cfg.min}
            max={cfg.max}
            step={cfg.step}
            value={Math.min(current, cfg.max)}
            disabled={disabled}
            style={{
              background: `linear-gradient(to right, ${styles?.bar ?? 'var(--accent)'} ${Math.min(100, pct)}%, rgb(127 127 127 / 0.25) ${Math.min(100, pct)}%)`,
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
            <p className="flex-1 text-center text-[11px] text-zinc-500">{cfg.stepHint} · or tap the number to type</p>
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
        </>
      )}
    </div>
  );
}

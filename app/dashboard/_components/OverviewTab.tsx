'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { Segmented } from '@/app/_components/ui';
import { WEEKLY_METRICS, buildWeeklyAverages, formatMetric, weekChange } from '@/lib/weeklyAverages';
import type { WeekAverages, WeeklyMetric } from '@/lib/weeklyAverages';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

// Plain inline SVG (same custom-SVG-over-a-charting-library precedent as ProgressRing). Shows the
// weekly averages as a line with dots, the high/low values on the left and the week dates below.
export function TrendChart({
  values,
  labels,
  color,
  formatter,
  emptyText = 'Needs a second week of data for a trend',
}: {
  values: number[];
  labels: string[];
  color: string;
  formatter: (v: number) => string;
  emptyText?: string;
}) {
  if (values.length < 2) {
    return <div className="flex h-16 items-center text-xs text-zinc-400">{emptyText}</div>;
  }
  const width = 280;
  const height = 96;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((v, i) => ({
    x: 6 + (i / (values.length - 1)) * (width - 12),
    y: height - ((v - min) / range) * (height - 16) - 8,
  }));
  const points = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-11 shrink-0 flex-col justify-between py-1 text-[10px] font-medium text-zinc-400">
          <span>{formatter(max)}</span>
          <span>{formatter(min)}</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
          <line x1="0" x2={width} y1="8" y2="8" stroke="currentColor" strokeOpacity={0.08} />
          <line x1="0" x2={width} y1={height - 8} y2={height - 8} stroke="currentColor" strokeOpacity={0.08} />
          <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={last.x} cy={last.y} r={4} fill={color} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-[52px] text-[10px] text-zinc-400">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

// One card with a tab per measure: the weekly average as a chart, the change on the previous week, and a
// week-by-week list underneath. Protein, sleep and water join weight, calories and steps.
function WeeklyAverages({ weeks }: { weeks: WeekAverages[] }) {
  const [metric, setMetric] = useState<WeeklyMetric>('bodyweight');
  const info = WEEKLY_METRICS.find((m) => m.key === metric)!;
  const withValue = weeks.filter((w) => w.avg[metric] != null);
  const points = withValue.map((w) => w.avg[metric] as number);
  const labels = withValue.map((w) => shortDate(w.weekStart));
  const current = points.length ? points[points.length - 1] : null;
  const delta = weekChange(weeks, metric);
  const favorable = info.better && delta != null ? (info.better === 'down' ? delta < 0 : delta > 0) : null;
  const fmt = (v: number) => formatMetric(v, info);
  const recent = [...withValue].reverse().slice(0, 6);

  return (
    <div className={cardCls}>
      <Segmented<WeeklyMetric>
        label="Weekly average of"
        value={metric}
        onChange={setMetric}
        options={WEEKLY_METRICS.map((m) => ({ value: m.key, label: m.tab }))}
      />
      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="font-bold text-black dark:text-zinc-50">{info.title}</h3>
        {delta != null && Math.abs(delta) > 0.001 && (
          <span className={`text-sm font-bold ${favorable == null ? 'text-zinc-500' : favorable ? 'text-success' : 'text-danger'}`}>
            {delta > 0 ? '+' : '-'}
            {fmt(Math.abs(delta))}
            {info.unit}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold text-black dark:text-zinc-50">
        {current != null ? fmt(current) : '—'}
        {info.unit && current != null ? info.unit : null}
      </p>
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Nothing logged for {info.title.toLowerCase()} yet.</p>
      ) : (
        <>
          <div className="mt-3">
            <TrendChart values={points} labels={labels} color="var(--chart-1)" formatter={fmt} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Weekly average{points.length >= 2 ? ` · last ${points.length} weeks` : ''}
            {delta != null ? ' · change vs the week before' : ''}
          </p>
          <div className="mt-3 divide-y divide-black/[.05] dark:divide-white/10">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>Week of</span>
              <span className="w-12 text-right">Days</span>
              <span className="w-20 text-right">Average</span>
            </div>
            {recent.map((w) => (
              <div key={w.weekStart} className="grid grid-cols-[1fr_auto_auto] gap-3 py-1.5 text-sm">
                <span className="text-zinc-500">{shortDate(w.weekStart)}</span>
                <span className="w-12 text-right text-zinc-500">{w.days[metric]}</span>
                <span className="w-20 text-right font-semibold text-black dark:text-zinc-50">
                  {fmt(w.avg[metric] as number)}
                  {info.unit}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Start -> now -> goal for bodyweight, from the profile's start/goal weights and the latest logged weight.
function WeightGoalCard({ profile, latest, coachView }: { profile: ClientProfileRow | null; latest: number | null; coachView: boolean }) {
  const start = profile?.start_weight ?? null;
  const goal = profile?.goal_weight ?? null;
  if (start == null || goal == null || start === goal) return null;
  const now = latest ?? start;
  const total = Math.abs(start - goal);
  const done = Math.max(0, Math.min(total, (start - now) * (start > goal ? 1 : -1)));
  const pct = Math.round((done / total) * 100);
  const toGo = Math.max(0, Math.abs(now - goal) * (((now - goal) * (start - goal)) > 0 ? 1 : 0));
  return (
    <div className={cardCls}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold text-black dark:text-zinc-50">{coachView ? 'Goal' : 'Your goal'}</h3>
        <span className="text-sm font-bold text-accent">{pct}% there</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Start</p>
          <p className="font-bold text-black dark:text-zinc-50">{start}kg</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Now</p>
          <p className="font-bold text-black dark:text-zinc-50">{latest != null ? `${latest.toFixed(1)}kg` : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Goal</p>
          <p className="font-bold text-black dark:text-zinc-50">{goal}kg</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {toGo > 0 ? `${toGo.toFixed(1)}kg to go.` : coachView ? 'Goal weight reached.' : 'Goal weight reached — nice work.'}
      </p>
    </div>
  );
}

export function OverviewTab({ historyLogs, profile, isCoachView = false }: { historyLogs: DailyLogRow[]; profile: ClientProfileRow | null; isCoachView?: boolean }) {
  const weeks = buildWeeklyAverages(historyLogs).slice(-8);
  const latestWeight = [...historyLogs].reverse().find((l) => l.bodyweight != null)?.bodyweight ?? null;

  if (weeks.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trends yet"
        hint="Log a few days in Weekly Log and your bodyweight, calorie and step trends will build up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <WeightGoalCard profile={profile} latest={latestWeight} coachView={isCoachView} />
      <WeeklyAverages weeks={weeks} />
    </div>
  );
}

'use client';

import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { isoWeekKey } from '@/lib/utils/dates';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { dayCalories } from '@/lib/calculations';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

interface WeekPoint {
  weekStart: string;
  avgBodyweight: number | null;
  avgCalories: number | null;
  avgSteps: number | null;
  loggedDays: number;
}

function buildWeeklyTrend(logs: DailyLogRow[]): WeekPoint[] {
  const byWeek = new Map<string, DailyLogRow[]>();
  for (const log of logs.filter(hasLoggedData)) {
    const week = isoWeekKey(log.log_date);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(log);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, weekLogs]) => {
      const bw = weekLogs.filter((l) => l.bodyweight != null).map((l) => l.bodyweight as number);
      const withMacros = weekLogs.filter((l) => l.protein != null || l.carbs != null || l.fat != null);
      const steps = weekLogs.filter((l) => l.steps != null).map((l) => l.steps as number);
      return {
        weekStart,
        avgBodyweight: bw.length ? bw.reduce((a, b) => a + b, 0) / bw.length : null,
        avgCalories: withMacros.length
          ? withMacros.reduce((sum, l) => sum + dayCalories(l.protein ?? 0, l.carbs ?? 0, l.fat ?? 0), 0) /
            withMacros.length
          : null,
        avgSteps: steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : null,
        loggedDays: weekLogs.length,
      };
    });
}

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

function TrendCard({
  weeks, title, dataKey, color, unit, formatter, lowerIsBetter,
}: {
  weeks: WeekPoint[];
  title: string;
  dataKey: 'avgBodyweight' | 'avgCalories' | 'avgSteps';
  color: string;
  unit: string;
  formatter: (v: number) => string;
  // Colors the delta green/red by direction -- only meaningful for a metric with an
  // unambiguous "better" direction (bodyweight, in a fat-loss-focused app). Omitted for
  // Calories/Steps, where trending up or down isn't inherently good or bad.
  lowerIsBetter?: boolean;
}) {
  const withValue = weeks.filter((w) => w[dataKey] != null);
  const points = withValue.map((w) => w[dataKey] as number);
  const labels = withValue.map((w) => shortDate(w.weekStart));
  const current = points.length ? points[points.length - 1] : null;
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  const delta = current != null && prev != null ? current - prev : null;
  const favorable = lowerIsBetter != null && delta != null ? (lowerIsBetter ? delta < 0 : delta > 0) : null;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-black dark:text-zinc-50">{title}</h3>
        {delta != null && Math.abs(delta) > 0.001 && (
          <span
            className={`text-sm font-bold ${
              favorable == null ? 'text-zinc-500' : favorable ? 'text-success' : 'text-danger'
            }`}
          >
            {delta > 0 ? '+' : '-'}
            {formatter(Math.abs(delta))}
            {unit}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold text-black dark:text-zinc-50">
        {current != null ? formatter(current) : '—'}
        {unit && current != null ? unit : null}
      </p>
      <div className="mt-3">
        <TrendChart values={points} labels={labels} color={color} formatter={formatter} />
      </div>
      <p className="mt-1 text-xs text-zinc-500">Weekly average{points.length >= 2 ? ` · last ${points.length} weeks` : ''}{delta != null ? ' · change vs the week before' : ''}</p>
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
  const weeks = buildWeeklyTrend(historyLogs).slice(-8);
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
      <TrendCard
        weeks={weeks}
        title="Bodyweight"
        dataKey="avgBodyweight"
        color="var(--chart-1)"
        unit="kg"
        formatter={(v) => v.toFixed(1)}
        lowerIsBetter
      />
      <TrendCard
        weeks={weeks}
        title="Calories"
        dataKey="avgCalories"
        color="var(--chart-2)"
        unit="kcal"
        formatter={(v) => Math.round(v).toString()}
      />
      <TrendCard
        weeks={weeks}
        title="Steps"
        dataKey="avgSteps"
        color="var(--chart-3)"
        unit=""
        formatter={(v) => Math.round(v).toString()}
      />
    </div>
  );
}

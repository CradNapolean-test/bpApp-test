'use client';

import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { isoWeekKey } from '@/lib/utils/dates';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { dayCalories } from '@/lib/calculations';
import type { DailyLogRow } from '@/lib/data/types';

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

const cardCls = 'rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

// Plain inline SVG instead of a full Recharts axis/tooltip chart -- a compact "how's the trend
// looking" glance, same custom-SVG-over-a-charting-library precedent as ProgressRing.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="flex h-12 items-center text-xs text-zinc-400">Not enough data yet</div>;
  }
  const width = 280;
  const height = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-12 w-full">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  const points = weeks.map((w) => w[dataKey]).filter((v): v is number => v != null);
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
        <Sparkline values={points} color={color} />
      </div>
      <p className="mt-1 text-xs text-zinc-500">8-week average trend</p>
    </div>
  );
}

export function OverviewTab({ historyLogs }: { historyLogs: DailyLogRow[] }) {
  const weeks = buildWeeklyTrend(historyLogs);

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

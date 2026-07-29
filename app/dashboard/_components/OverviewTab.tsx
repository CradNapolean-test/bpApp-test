'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

function formatWeekLabel(weekStart: string): string {
  return new Date(weekStart + 'T00:00:00Z').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function CustomTooltip({
  active, payload, label, dataKey, unit, formatter,
}: {
  active?: boolean;
  payload?: { payload: WeekPoint }[];
  label?: string;
  dataKey: 'avgBodyweight' | 'avgCalories' | 'avgSteps';
  unit: string;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length || !label) return null;
  const point = payload[0].payload;
  const value = point[dataKey];
  return (
    <div className="rounded-md border border-black/10 bg-[var(--background)] p-2 text-xs shadow-sm dark:border-white/10">
      <p className="font-medium text-black dark:text-zinc-50">{formatWeekLabel(label)}</p>
      <p className="text-zinc-500">{value != null ? `${formatter(value)} ${unit}` : 'No data'}</p>
      <p className="text-zinc-500">{point.loggedDays} logged days</p>
    </div>
  );
}

function TrendChart({
  weeks, title, dataKey, color, unit, formatter,
}: {
  weeks: WeekPoint[];
  title: string;
  dataKey: 'avgBodyweight' | 'avgCalories' | 'avgSteps';
  color: string;
  unit: string;
  formatter: (v: number) => string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
      <div className="mt-2 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weeks} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={formatWeekLabel}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
              axisLine={{ opacity: 0.1 }}
              tickLine={false}
            />
            <YAxis
              width={40}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
              axisLine={{ opacity: 0.1 }}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip dataKey={dataKey} unit={unit} formatter={formatter} />} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function OverviewTab({ historyLogs }: { historyLogs: DailyLogRow[] }) {
  const weeks = buildWeeklyTrend(historyLogs);

  if (weeks.length === 0) {
    return <p className="text-sm text-zinc-500">No logged days yet — trends will appear once you log some.</p>;
  }

  return (
    <div className="space-y-4">
      <TrendChart
        weeks={weeks}
        title="Bodyweight"
        dataKey="avgBodyweight"
        color="var(--chart-1)"
        unit="kg"
        formatter={(v) => v.toFixed(1)}
      />
      <TrendChart
        weeks={weeks}
        title="Calories"
        dataKey="avgCalories"
        color="var(--chart-2)"
        unit="kcal"
        formatter={(v) => Math.round(v).toString()}
      />
      <TrendChart
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

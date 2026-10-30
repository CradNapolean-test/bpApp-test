'use client';

import { useEffect, useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { Segmented } from '@/app/_components/ui';
import { weeklyTarget } from '@/lib/calculations';
import { getDailyLogs } from '@/lib/data/dailyLogs';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import {
  METRICS,
  RANGES,
  chartDomain,
  dailyPoints,
  formatMetricValue,
  movingAverage,
  needsMoreHistory,
  rangeStart,
  streakStats,
  summarize,
  weeklyAverages,
  weeklyTotals,
  type DayPoint,
  type MetricInfo,
  type MetricKey,
  type RangeKey,
} from '@/lib/utils/metrics';
import { useTodayIso } from './useTodayIso';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';

// The measures in three rows, so twelve of them do not sit in one scrolling strip.
const MEASURE_GROUPS: { label: string; keys: MetricKey[] }[] = [
  { label: 'Body and food', keys: ['bodyweight', 'calories', 'protein', 'steps', 'sleep', 'water'] },
  { label: 'How you feel', keys: ['hunger', 'energy', 'motivation', 'stress'] },
  { label: 'Consistency', keys: ['sessions', 'foodDays'] },
];

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';

const WIDTH = 320;
const HEIGHT = 200;
const PAD = { left: 40, right: 10, top: 10, bottom: 22 };
const DAY_MS = 86_400_000;

const dayNo = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY_MS;
const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// One metric over time as dots (every logged day) with a smooth 7-day average through them, or as weekly averages. A dashed line marks
// the target when there is one. Touch or hover along the chart to read any day. Plain inline SVG, like the Overview trend line.
function MetricChart({
  info,
  points,
  line,
  target,
  weekly,
}: {
  info: MetricInfo;
  points: DayPoint[];
  line: DayPoint[];
  target: number | null;
  weekly: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const first = dayNo(points[0].date);
  const last = dayNo(points[points.length - 1].date);
  const span = Math.max(1, last - first);
  const domain = chartDomain(
    [...points.map((p) => p.value), ...line.map((p) => p.value)],
    target
  );
  const x = (date: string) => PAD.left + ((dayNo(date) - first) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - domain.min) / (domain.max - domain.min)) * (HEIGHT - PAD.top - PAD.bottom);
  const fmt = (v: number) => formatMetricValue(v, { digits: info.digits, unit: '' });
  const ticks = [domain.max, (domain.max + domain.min) / 2, domain.min];

  function pick(clientX: number, rect: DOMRect) {
    const svgX = ((clientX - rect.left) / rect.width) * WIDTH;
    const wanted = first + ((svgX - PAD.left) / (WIDTH - PAD.left - PAD.right)) * span;
    let best = points[0];
    for (const p of points) if (Math.abs(dayNo(p.date) - wanted) < Math.abs(dayNo(best.date) - wanted)) best = p;
    setSelected(best.date);
  }

  const shown = points.find((p) => p.date === selected) ?? points[points.length - 1];
  const smooth = line.find((p) => p.date === shown.date);
  const summary = summarize(points, info.better);
  const description = `${info.label}, ${points.length} ${weekly ? 'weeks' : 'days'} from ${shortDate(points[0].date)} to ${shortDate(points[points.length - 1].date)}. Latest ${
    summary.latest != null ? formatMetricValue(summary.latest, info) : 'none'
  }, lowest ${formatMetricValue(summary.min ?? 0, info)}, highest ${formatMetricValue(summary.max ?? 0, info)}.`;

  return (
    <div>
      <p className="min-h-10 text-sm text-zinc-500" aria-live="polite">
        <span className="font-semibold text-black dark:text-zinc-50">
          {weekly ? `Week of ${shortDate(shown.date)}` : longDate(shown.date)}
        </span>
        {' · '}
        <span className="font-bold text-black dark:text-zinc-50">{formatMetricValue(shown.value, info)}</span>
        {!weekly && smooth && points.length > 1 && <span> · 7-day average {formatMetricValue(smooth.value, info)}</span>}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={description}
        className="w-full touch-pan-y select-none"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={PAD.left - 5} y={y(t) + 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.5}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {target != null && (
          <g>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(target)} y2={y(target)} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="4 3" />
            <text x={WIDTH - PAD.right} y={y(target) - 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.6}>
              {info.key === 'bodyweight' ? 'Goal' : 'Target'} {fmt(target)}
            </text>
          </g>
        )}
        {line.length > 1 && (
          <polyline
            points={line.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={weekly ? 3 : 2.2} fill="var(--chart-1)" fillOpacity={weekly ? 1 : 0.4} />
        ))}
        <line x1={x(shown.date)} x2={x(shown.date)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="currentColor" strokeOpacity={0.25} />
        <circle cx={x(shown.date)} cy={y(shown.value)} r={4.5} fill="var(--chart-1)" stroke="var(--card, #fff)" strokeWidth={1.5} />
        <text x={PAD.left} y={HEIGHT - 6} fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {shortDate(points[0].date)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {shortDate(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-black/[.03] px-3 py-2 dark:bg-white/[.04]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`text-base font-extrabold ${tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-black dark:text-zinc-50'}`}>{value}</p>
    </div>
  );
}

// Progress > Metrics: any of the daily numbers over 4 weeks to everything logged, daily or by week, against the member's target. The coach
// sees the same charts on a member's page.
export function MetricsTab({
  clientId,
  historyLogs,
  profile,
  programWeek,
  isCoachView,
}: {
  clientId: string;
  historyLogs: DailyLogRow[];
  profile: ClientProfileRow | null;
  programWeek: number;
  isCoachView: boolean;
}) {
  const today = useTodayIso(profile?.timezone ?? DEFAULT_TIMEZONE);
  const [metric, setMetric] = useState<MetricKey>('bodyweight');
  const [range, setRange] = useState<RangeKey>('12w');
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');

  // The page carries the last 12 weeks; a longer range reads the rest once, the first time it is asked for.
  const [fullHistory, setFullHistory] = useState<DailyLogRow[] | null>(null);
  const wantsMore = needsMoreHistory(range);
  useEffect(() => {
    if (!wantsMore || fullHistory) return;
    let live = true;
    getDailyLogs(clientId, '2000-01-01', today)
      .then((rows) => {
        if (live) setFullHistory(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wantsMore, fullHistory, clientId, today]);
  const loadingMore = wantsMore && !fullHistory;
  const logs = wantsMore && fullHistory ? fullHistory : historyLogs;

  const info = METRICS.find((m) => m.key === metric)!;
  const from = rangeStart(today, range);
  const daily = useMemo(() => dailyPoints(logs, metric, from, today), [logs, metric, from, today]);
  // Sessions and days with food logged are counts per week, so they only make sense by week and are added up, not averaged.
  const totalsOnly = !!info.weeklyTotal;
  const weekly = useMemo(() => (totalsOnly ? weeklyTotals(daily) : weeklyAverages(daily)), [totalsOnly, daily]);
  const shownMode = totalsOnly ? 'weekly' : mode;
  const points = shownMode === 'daily' ? daily : weekly;
  const line = useMemo(() => (shownMode === 'daily' ? movingAverage(daily) : weekly), [shownMode, daily, weekly]);
  const summary = summarize(points, info.better);

  // Days with anything logged: the streak now, and the longest run inside the chosen range.
  const streaks = useMemo(() => {
    const dates = logs.filter(hasLoggedData).map((l) => l.log_date);
    const inRange = from == null ? dates : dates.filter((d) => d >= from);
    return { current: streakStats(dates, today).current, best: streakStats(inRange, today).best };
  }, [logs, from, today]);

  // The goal weight, and today's calorie and protein target (the same one the food diary shows against).
  const target = useMemo(() => {
    if (metric === 'bodyweight') return profile?.goal_weight ?? null;
    const engine = toMemberEngineProfile(profile, isCoachView);
    const day = engine ? weeklyTarget(engine, programWeek)?.dailyFlat : null;
    if (!day) return null;
    return metric === 'calories' ? day.calories : metric === 'protein' ? day.protein : null;
  }, [metric, profile, programWeek, isCoachView]);

  const change = summary.change;
  const changeTone = summary.favourable == null ? undefined : summary.favourable ? 'good' : 'bad';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Logging streak" value={`${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`} />
        <Tile label="Best streak in range" value={`${streaks.best} ${streaks.best === 1 ? 'day' : 'days'}`} />
      </div>
      <div className={`${cardCls} space-y-3`}>
        {MEASURE_GROUPS.map((g) => (
          <Segmented<MetricKey>
            key={g.label}
            label={g.label}
            value={metric}
            onChange={setMetric}
            options={g.keys.map((k) => ({ value: k, label: METRICS.find((m) => m.key === k)!.label }))}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <Segmented<RangeKey> label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} />
          {!totalsOnly && (
            <Segmented<'daily' | 'weekly'>
              label="Daily or weekly"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
              ]}
            />
          )}
        </div>
      </div>

      {loadingMore ? (
        <p className="px-1 text-sm text-zinc-500">Loading your history…</p>
      ) : points.length < 2 ? (
        <EmptyState
          icon={LineChart}
          title="Not enough data for this chart yet"
          hint={`Log ${info.label.toLowerCase()} on a couple of days (or pick a longer time range) and it will show up here.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Latest" value={summary.latest != null ? formatMetricValue(summary.latest, info) : '—'} />
            <Tile
              label="Change"
              value={change == null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatMetricValue(Math.abs(change), info)}`}
              tone={changeTone}
            />
            <Tile label={totalsOnly ? 'Average per week' : 'Average'} value={summary.average != null ? formatMetricValue(summary.average, info) : '—'} />
            <Tile
              label="Lowest – highest"
              value={summary.min != null && summary.max != null ? `${formatMetricValue(summary.min, { ...info, unit: '' })} – ${formatMetricValue(summary.max, info)}` : '—'}
            />
          </div>
          <div className={cardCls}>
            <MetricChart key={`${metric}:${shownMode}:${range}`} info={info} points={points} line={line} target={target} weekly={shownMode === 'weekly'} />
            <p className="mt-2 text-xs text-zinc-500">
              {totalsOnly
                ? `Each dot is ${info.key === 'sessions' ? 'the sessions you ticked off' : 'the days you logged food'} in that week (Monday to Sunday). The first and current weeks may be part weeks. Touch or hover the chart to read any week.`
                : mode === 'daily'
                  ? 'Each dot is a day you logged; the line is the 7-day average. Touch or hover the chart to read any day.'
                  : 'Each dot is the average of the days you logged that week. Touch or hover the chart to read any week.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

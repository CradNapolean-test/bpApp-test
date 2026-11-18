'use client';

import { useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { Segmented } from '@/app/_components/ui';
import { WEEKLY_METRICS, buildWeeklyAverages, formatMetric, weekChange } from '@/lib/weeklyAverages';
import { weightGoalProgress } from '@/lib/weightGoal';
import type { WeekAverages, WeeklyMetric } from '@/lib/weeklyAverages';
import type { ClientProfileRow, DailyLogRow } from '@/lib/data/types';
import { weeklyTarget } from '@/lib/calculations';
import { dayTargetFor, isCyclingTarget } from '@/lib/utils/dayTarget';
import { toMemberEngineProfile } from '@/lib/utils/clientProfile';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import { useReveal } from '@/app/_components/motion/useReveal';
import CountUp from '@/app/_components/motion/CountUp';

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10';
const headCls = 'text-base font-extrabold text-black dark:text-zinc-50';

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
  // The line draws in from the left when the chart shows, and again when it is given other numbers (another measure).
  const plot = useRef<HTMLDivElement>(null);
  useReveal(plot, values.join(','));
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
  // One sentence for a screen reader: where the line starts, where it ends and the change.
  const change = values[values.length - 1] - values[0];
  const summary = `Trend from ${labels[0]} to ${labels[labels.length - 1]}: ${formatter(values[0])} to ${formatter(values[values.length - 1])}, ${change === 0 ? 'no change' : `${change > 0 ? 'up' : 'down'} ${formatter(Math.abs(change))}`}. Lowest ${formatter(min)}, highest ${formatter(max)}.`;
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-11 shrink-0 flex-col justify-between py-1 text-[10px] font-medium text-zinc-400">
          <span>{formatter(max)}</span>
          <span>{formatter(min)}</span>
        </div>
        {/* The line is stretched to the width of the card (preserveAspectRatio none); the dot is drawn on top as an ordinary element so it stays round. */}
        <div ref={plot} className="relative h-24 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={summary} className="h-24 w-full overflow-visible">
          <line x1="0" x2={width} y1="8" y2="8" stroke="currentColor" strokeOpacity={0.08} />
          <line x1="0" x2={width} y1={height - 8} y2={height - 8} stroke="currentColor" strokeOpacity={0.08} />
          <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${(last.x / width) * 100}%`, top: `${(last.y / height) * 100}%`, backgroundColor: color }}
        />
        </div>
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
        <h3 className="text-[15px] font-extrabold text-black dark:text-zinc-50">{info.title}</h3>
        {delta != null && Math.abs(delta) > 0.001 && (
          <span className={`text-sm font-bold ${favorable == null ? 'text-zinc-500' : favorable ? 'text-success' : 'text-danger'}`}>
            {delta > 0 ? '+' : '-'}
            {fmt(Math.abs(delta))}
            {info.unit}
          </span>
        )}
      </div>
      <p className="mt-1 text-[28px] font-black leading-tight text-black dark:text-zinc-50">
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
          <div className="mt-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 pb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span>Week of</span>
              <span className="w-12 text-right">Days</span>
              <span className="w-20 text-right">Average</span>
            </div>
            {recent.map((w, i) => (
              <div
                key={w.weekStart}
                className={`grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg px-2 py-2 text-sm ${i === 0 ? 'bg-accent-soft font-bold' : 'border-t border-black/[.06] dark:border-white/10'}`}
              >
                <span className={i === 0 ? 'text-black dark:text-zinc-50' : 'text-zinc-500'}>{shortDate(w.weekStart)}</span>
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

// Start -> now -> goal for bodyweight, from the profile's start/goal weights and the latest logged weight. "Now" says the day that
// weight was logged (MX13): a month-old weigh-in read as today's weight.
function WeightGoalCard({
  profile,
  latest,
  latestDate,
  coachView,
  programWeek,
}: {
  profile: ClientProfileRow | null;
  latest: number | null;
  latestDate: string | null;
  coachView: boolean;
  programWeek?: number;
}) {
  const start = profile?.start_weight ?? null;
  const goal = profile?.goal_weight ?? null;
  if (start == null || goal == null || start === goal) return null;
  const now = latest ?? start;
  const total = Math.abs(start - goal);
  const done = Math.max(0, Math.min(total, (start - now) * (start > goal ? 1 : -1)));
  const pct = Math.round((done / total) * 100);
  const toGo = Math.max(0, Math.abs(now - goal) * (((now - goal) * (start - goal)) > 0 ? 1 : 0));
  // The coach is told when the member is further from the goal than at the start, instead of a quiet "0% there" (CR3).
  const away = coachView && latest != null ? weightGoalProgress(start, goal, latest) : null;
  const way = start > goal ? 'down' : 'up';
  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-black dark:text-zinc-50">
            {/* Counts from the start weight to today's, so the change is seen as well as read. */}
            <CountUp to={now} from={start} decimals={1} delay={0.15} className="text-[28px] font-black leading-none" /> kg{' '}
            {latest != null ? 'now' : 'at the start'}
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {latest != null ? `Started at ${start} kg${latestDate ? ` · weighed ${shortDate(latestDate)}` : ''}` : 'No weigh-in logged yet'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{coachView ? 'Goal' : 'Your goal'}</p>
          <p className="text-[17px] font-extrabold text-black dark:text-zinc-50">{goal} kg</p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${pct}% of the way to the goal weight`}>
        <div data-grow="bar" className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {away?.movingAway ? (
        <p className="mt-2 text-xs font-semibold text-danger">
          Moving away from goal: {away.awayKg.toFixed(1)}kg further from the goal than at the start, {toGo.toFixed(1)}kg from the goal. Check the start weight is right.
        </p>
      ) : (
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
            {toGo > 0
              ? `${done > 0 ? `${done.toFixed(1)} kg ${way}, ` : ''}${toGo.toFixed(1)} kg to go.`
              : coachView
                ? 'Goal weight reached.'
                : 'Goal weight reached — nice work.'}
            {!coachView && programWeek ? ` Week ${programWeek} of your plan.` : ''}
          </p>
          <span className="shrink-0 text-sm font-extrabold text-accent">{pct}%</span>
        </div>
      )}
    </div>
  );
}

function TargetsCard({ profile, programWeek }: { profile: ClientProfileRow | null; programWeek: number }) {
  const engine = toMemberEngineProfile(profile, false);
  const week = engine ? weeklyTarget(engine, programWeek) : null;
  // A calorie-cycling member sees the normal (low) day; high days are marked in the food diary.
  const day = dayTargetFor(week, null);
  if (!day) return null;
  const boxes = [
    { label: 'kcal', value: Math.round(day.calories), unit: '' },
    { label: 'Protein', value: Math.round(day.protein), unit: ' g' },
    { label: 'Carbs', value: Math.round(day.carbs), unit: ' g' },
    { label: 'Fat', value: Math.round(day.fat), unit: ' g' },
  ];
  return (
    <section className="space-y-2.5">
      <h2 className={headCls}>Your targets</h2>
      <div className={cardCls}>
        <div className="grid grid-cols-4 gap-2">
          {boxes.map((b, i) => (
            <div key={b.label} className="rounded-xl bg-black/[.04] px-1 py-2.5 text-center dark:bg-white/[.06]">
              <p className="text-[15px] font-black leading-tight text-black dark:text-zinc-50">
                <CountUp to={b.value} delay={0.2 + i * 0.08} />
                {b.unit}
              </p>
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{b.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Each day in week {programWeek} of your plan
          {isCyclingTarget(week) && week?.dailyHigh ? `. High days are ${Math.round(week.dailyHigh.calories).toLocaleString('en-GB')} kcal.` : '.'}
        </p>
      </div>
    </section>
  );
}

export function OverviewTab({
  historyLogs,
  profile,
  programWeek,
  isCoachView = false,
}: {
  historyLogs: DailyLogRow[];
  profile: ClientProfileRow | null;
  programWeek?: number;
  isCoachView?: boolean;
}) {
  const weeks = buildWeeklyAverages(historyLogs).slice(-8);
  const latestWeighIn = [...historyLogs].reverse().find((l) => l.bodyweight != null) ?? null;
  // The goal bar fills when the screen opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.15);

  if (weeks.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trends yet"
        hint="Log a few days in Daily check-in and your bodyweight, calorie and step trends will build up here."
      />
    );
  }

  return (
    <div ref={screen} className="space-y-5">
      <WeightGoalCard
        profile={profile}
        latest={latestWeighIn?.bodyweight ?? null}
        latestDate={latestWeighIn?.log_date ?? null}
        coachView={isCoachView}
        programWeek={programWeek}
      />
      {!isCoachView && programWeek != null && <TargetsCard profile={profile} programWeek={programWeek} />}
      <section className="space-y-2.5">
        {!isCoachView && <h2 className={headCls}>Week by week</h2>}
        <WeeklyAverages weeks={weeks} />
      </section>
    </div>
  );
}

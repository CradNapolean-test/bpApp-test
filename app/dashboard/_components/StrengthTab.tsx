'use client';

import { useMemo, useState } from 'react';
import { Dumbbell, Trophy } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { getStrengthBests } from '@/lib/data/workouts';
import { workoutWindowStart } from '@/lib/trainingWindow';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { countsAsWorkingSet, exerciseHistory, formatKg, weeklyVolume } from '@/lib/trainingStats';
import type { ClientProfileRow, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10';
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Load volume (working load x reps) per week, and per-exercise progression with personal bests.
export function StrengthTab({
  clientId,
  workoutLogs,
  programs,
  profile,
}: {
  clientId: string;
  workoutLogs: WorkoutLogRow[];
  programs: WorkoutProgramRow[];
  profile: ClientProfileRow | null;
}) {
  const tz = profile?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayIsoInTz(tz);

  // The page carries the last 90 days of sets. The best set per exercise from before that comes from the database (H5), so a personal-best
  // flag in the window is true and the headline is the all-time best, not the best of whatever happened to be loaded.
  const windowStart = workoutWindowStart(today);
  const priorBests = useOnDemand(() => getStrengthBests(clientId, windowStart), `${clientId}:${windowStart}`);
  const priorScore = useMemo(() => new Map((priorBests.data ?? []).map((b) => [b.exercise_key, b.best_score])), [priorBests.data]);

  // A logged set points at a programme row (exercise_id) and, when the exercise came from the library, a
  // library id. Group by library id so the same lift in different blocks is one history.
  const { groups, names } = useMemo(() => {
    const rowInfo = new Map<string, { key: string; name: string }>();
    for (const p of programs)
      for (const d of p.workout_program_days)
        for (const e of d.workout_exercises) rowInfo.set(e.id, { key: e.exercise_library_id ?? `n:${e.name.toLowerCase()}`, name: e.name });
    const groups = new Map<string, WorkoutLogRow[]>();
    const names = new Map<string, string>();
    for (const l of workoutLogs) {
      if (!countsAsWorkingSet(l)) continue;
      const info = l.exercise_id ? rowInfo.get(l.exercise_id) : undefined;
      const key = l.exercise_library_id ?? info?.key;
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), l]);
      if (info && !names.has(key)) names.set(key, info.name);
    }
    return { groups, names };
  }, [workoutLogs, programs]);

  const weeks = useMemo(() => weeklyVolume(workoutLogs, today, tz, 12), [workoutLogs, today, tz]);
  const maxVol = Math.max(1, ...weeks.map((w) => w.volume));
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];

  const options = [...groups.entries()]
    .map(([key, logs]) => ({ key, name: names.get(key) ?? 'Exercise', sets: logs.length }))
    .sort((a, b) => b.sets - a.sets);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = options.find((o) => o.key === picked) ?? options[0];
  // Until the earlier bests arrive nothing can be called a PR (they would all look like one); if they cannot be read, fall back to the window.
  const baseline = selected ? (priorBests.loading ? Number.POSITIVE_INFINITY : (priorScore.get(selected.key) ?? 0)) : 0;
  const history = selected ? exerciseHistory(groups.get(selected.key) ?? [], tz, baseline) : [];

  if (options.length === 0) {
    return <EmptyState icon={Dumbbell} title="No lifts logged yet" hint="Log sets with a weight and reps in your workouts and your volume and progress will show here." />;
  }

  const recent = history.slice(-8).reverse();
  const prs = history.filter((s) => s.isPR).length;
  const e1rms = history.map((s) => s.best1RM ?? s.topLoad);
  const lo = Math.min(...e1rms);
  const hi = Math.max(...e1rms);
  // The headline is the best ever, which may be from before the 90 days the chart shows.
  const bestEver = Math.max(hi, selected ? (priorScore.get(selected.key) ?? 0) : 0);

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Load volume</h3>
          <p className="text-xs text-zinc-500">Weight x reps, working sets</p>
        </div>
        <p className="mt-2 text-2xl font-black text-accent">{formatKg(thisWeek.volume)}</p>
        <p className="text-xs text-zinc-500">
          this week, {thisWeek.sets} set{thisWeek.sets === 1 ? '' : 's'}
          {lastWeek && lastWeek.volume > 0 ? ` · last week ${formatKg(lastWeek.volume)}` : ''}
        </p>
        <div className="mt-4 flex h-24 items-end gap-1" role="img" aria-label="Weekly load volume for the last 12 weeks">
          {weeks.map((w, i) => (
            <div key={w.weekStart} className="flex h-full flex-1 flex-col justify-end" title={`Week of ${shortDate(w.weekStart)}: ${formatKg(w.volume)}`}>
              <div
                className={`w-full rounded-t ${i === weeks.length - 1 ? 'bg-accent' : 'bg-accent/40'}`}
                style={{ height: `${Math.max(w.volume > 0 ? 4 : 0, (w.volume / maxVol) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
          <span>{shortDate(weeks[0].weekStart)}</span>
          <span>This week</span>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Progression</h3>
          <select
            value={selected.key}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Exercise"
            className="max-w-[60%] rounded-xl border border-black/10 bg-card px-2 py-1.5 text-sm dark:border-white/10"
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.name}</option>
            ))}
          </select>
        </div>

        {history.length >= 2 && hi > lo && (
          <svg viewBox="0 0 100 40" className="mt-3 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Estimated one-rep max over time">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="text-accent"
              points={e1rms.map((v, i) => `${(i / (e1rms.length - 1)) * 100},${38 - ((v - lo) / (hi - lo)) * 36}`).join(' ')}
            />
          </svg>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          {prs} personal best{prs === 1 ? '' : 's'} · best estimated 1RM {Math.round(bestEver)}kg
        </p>

        <div className="mt-3 divide-y divide-black/[.05] dark:divide-white/10">
          <div className="grid grid-cols-[4.5rem_1fr_4.5rem_4rem] gap-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            <span>Date</span>
            <span>Top set</span>
            <span className="text-right">Volume</span>
            <span className="text-right">Est 1RM</span>
          </div>
          {recent.map((s) => (
            <div key={s.date} className="grid grid-cols-[4.5rem_1fr_4.5rem_4rem] items-center gap-1 py-1.5 text-sm">
              <span className="text-zinc-500">{shortDate(s.date)}</span>
              <span className="flex items-center gap-1.5 font-semibold text-black dark:text-zinc-50">
                {s.topLoad}kg x {s.topReps}
                {s.isPR && (
                  <span className="flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-extrabold text-accent">
                    <Trophy className="h-3 w-3" /> PB
                  </span>
                )}
              </span>
              <span className="text-right text-zinc-500">{formatKg(s.volume)}</span>
              <span className="text-right text-zinc-500">{s.best1RM ? `${Math.round(s.best1RM)}kg` : '-'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

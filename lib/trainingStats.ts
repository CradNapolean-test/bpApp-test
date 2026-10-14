import { isoWeekKey } from './utils/dates';
import type { WorkoutLogRow } from './data/types';

// Load volume and progression from the sets a member has logged (workout_logs, one row per set).
// Warm-up sets and sets with no load or no reps do not count: volume is working load x reps.

type SetLike = Pick<WorkoutLogRow, 'actual_load' | 'actual_reps' | 'set_type' | 'logged_at'>;

export function countsAsWorkingSet(s: SetLike): boolean {
  return s.set_type !== 'warmup' && (s.actual_load ?? 0) > 0 && (s.actual_reps ?? 0) > 0;
}

export const setVolume = (s: SetLike): number => (countsAsWorkingSet(s) ? (s.actual_load as number) * (s.actual_reps as number) : 0);

// Epley estimate of a one-rep max. A single is itself; very high reps are too noisy to trust.
export function estimate1RM(load: number, reps: number): number | null {
  if (!(load > 0) || !(reps > 0) || reps > 12) return null;
  return reps === 1 ? load : load * (1 + reps / 30);
}

// The member's local calendar day for a log, from its timestamp.
export function logDay(loggedAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(loggedAt));
}

export interface WeekVolume {
  weekStart: string; // Monday, YYYY-MM-DD
  volume: number; // kg
  sets: number;
}

// Total working volume per week for the last `weeks` weeks ending with the week of `today`, zero-filled.
export function weeklyVolume(logs: SetLike[], today: string, timeZone: string, weeks = 12): WeekVolume[] {
  const byWeek = new Map<string, WeekVolume>();
  for (const l of logs) {
    if (!countsAsWorkingSet(l)) continue;
    const wk = isoWeekKey(logDay(l.logged_at, timeZone));
    const cur = byWeek.get(wk) ?? { weekStart: wk, volume: 0, sets: 0 };
    cur.volume += setVolume(l);
    cur.sets += 1;
    byWeek.set(wk, cur);
  }
  const out: WeekVolume[] = [];
  let cursor = new Date(isoWeekKey(today) + 'T00:00:00Z');
  for (let i = 0; i < weeks; i++) {
    const key = cursor.toISOString().slice(0, 10);
    out.unshift(byWeek.get(key) ?? { weekStart: key, volume: 0, sets: 0 });
    cursor = new Date(cursor.getTime() - 7 * 86_400_000);
  }
  return out;
}

export interface ExerciseSession {
  date: string;
  topLoad: number; // heaviest working set that day
  topReps: number; // reps on that set
  best1RM: number | null;
  volume: number;
  sets: number;
  isPR: boolean; // new best estimated 1RM (or heaviest load if no estimate) up to and including this session
}

// One row per day the exercise was trained, oldest first, with a PR flag on each day that beat everything before it.
export function exerciseHistory(logs: SetLike[], timeZone: string): ExerciseSession[] {
  const byDay = new Map<string, SetLike[]>();
  for (const l of logs) {
    if (!countsAsWorkingSet(l)) continue;
    const d = logDay(l.logged_at, timeZone);
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  let bestSoFar = 0;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => {
      const top = sets.reduce((a, b) => ((b.actual_load as number) > (a.actual_load as number) ? b : a));
      const e1rms = sets.map((s) => estimate1RM(s.actual_load as number, s.actual_reps as number)).filter((v): v is number => v != null);
      const best1RM = e1rms.length ? Math.max(...e1rms) : null;
      const score = best1RM ?? (top.actual_load as number);
      const isPR = score > bestSoFar + 1e-9;
      if (isPR) bestSoFar = score;
      return {
        date,
        topLoad: top.actual_load as number,
        topReps: top.actual_reps as number,
        best1RM,
        volume: sets.reduce((sum, s) => sum + setVolume(s), 0),
        sets: sets.length,
        isPR,
      };
    });
}

export const formatKg = (kg: number): string => (kg >= 10_000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg).toLocaleString('en-NZ')}kg`);

// The history behind a workout: how an exercise has gone over time for every way of tracking it (reps, time, distance, calories, weighted holds
// and carries), and how a scored block has gone each time it was done. Weight x reps keeps its own estimated-1RM view in trainingStats. The
// rule throughout is like for like: a set is only compared with sets tracked the same way, and a block result only with results for the
// same format, scoring, numbers and exercises. Twin of packages/shared/src/workoutProgress.ts: keep the two the same (only the trainingStats import differs).
import { blockConfigOf, configSummary, resultSummary, SCORING, type BlockConfig, type Scoring } from './blockScoring';
import { countsAsWorkingSet, logDay } from './trainingStats';
import type { WorkoutBlockResultRow, WorkoutLogRow } from './data/types';
import { groupIntoBlocks, type SectionedExercise } from './workoutSections';
import { formatDistance, formatDuration, hasRecordedValue, setSummary, TRACKING, type LogValues, type TrackingType } from './workoutTracking';

type ProgressLog = LogValues & Pick<WorkoutLogRow, 'set_type' | 'logged_at'>;

// ---- comparing sets of one tracking type ----

// A set's score for its tracking type, higher is better, as a list so ties on the first number fall to the second (a heavier hold first, then
// a longer one). Null when the set has nothing to rank by. Pace is stored negated so a faster run scores higher.
export function setScore(type: TrackingType, s: LogValues): number[] | null {
  const pos = (n: number | null | undefined) => (n != null && n > 0 ? n : null);
  const reps = pos(s.actual_reps);
  const load = pos(s.actual_load);
  const seconds = pos(s.actual_seconds);
  const distance = pos(s.actual_distance);
  const calories = pos(s.actual_calories);
  switch (type) {
    case 'reps':
      return reps == null ? null : [reps];
    case 'weight_time':
      return load == null ? null : [load, seconds ?? 0];
    case 'time':
      return seconds == null ? null : [seconds];
    case 'distance':
      return distance == null ? null : [distance];
    case 'distance_time':
      return seconds == null || distance == null ? null : [-(seconds / distance)];
    case 'calories':
      return calories == null ? null : [calories];
    case 'weight_distance':
      return load == null ? null : [load, distance ?? 0];
    default:
      return null;
  }
}

// > 0 when `a` beats `b`.
export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const formatPace = (secondsPerMetre: number) => `${formatDuration(secondsPerMetre * 1000)}/km`;

// A set on one line for the history list; a run or row also shows its pace.
export function topSetText(type: TrackingType, s: LogValues, compact = false): string {
  const base = setSummary(type, s, compact);
  if (type === 'distance_time' && (s.actual_seconds ?? 0) > 0 && (s.actual_distance ?? 0) > 0) {
    return `${base} · ${formatPace((s.actual_seconds as number) / (s.actual_distance as number))}`;
  }
  return base;
}

// The first number of a score as a label for a chart point ("45s", "5:00/km").
export function scoreText(type: TrackingType, v: number): string {
  switch (type) {
    case 'weight_time':
    case 'weight_distance':
      return `${Math.round(v * 10) / 10}kg`;
    case 'time':
      return formatDuration(v);
    case 'distance':
      return formatDistance(v);
    case 'distance_time':
      return formatPace(-v);
    case 'calories':
      return `${Math.round(v * 10) / 10} cal`;
    default:
      return String(Math.round(v * 10) / 10);
  }
}

export interface MeasureSession<L> {
  date: string;
  // The best set of the day, or the first when none can be ranked (a tick).
  top: L;
  sets: number;
  score: number[] | null;
  // Better than every earlier day in the history. The first day is the starting point, not a best.
  isPB: boolean;
}

// One row per day an exercise was trained (oldest first), for any tracking type but weight x reps.
export function measureSessions<L extends ProgressLog>(type: TrackingType, logs: L[], tz: string): MeasureSession<L>[] {
  const byDay = new Map<string, L[]>();
  for (const l of logs) {
    if (l.set_type === 'warmup' || !hasRecordedValue(type, l)) continue;
    const d = logDay(l.logged_at, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  let bestSoFar: number[] | null = null;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => {
      const ordered = [...sets].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
      let top = ordered[0];
      let score: number[] | null = null;
      for (const s of ordered) {
        const sc = setScore(type, s);
        if (sc && (score == null || compareScores(sc, score) > 0)) {
          score = sc;
          top = s;
        }
      }
      const isPB = score != null && bestSoFar != null && compareScores(score, bestSoFar) > 0;
      if (score && (bestSoFar == null || compareScores(score, bestSoFar) > 0)) bestSoFar = score;
      return { date, top, sets: ordered.length, score, isPB };
    });
}

export function bestSession<L>(sessions: MeasureSession<L>[]): MeasureSession<L> | null {
  let best: MeasureSession<L> | null = null;
  for (const s of sessions) if (s.score && (!best?.score || compareScores(s.score, best.score) > 0)) best = s;
  return best;
}

// ---- which exercises have a history ----
export interface ExerciseInfo {
  // The library id, else "n:<name>": the same lift in different blocks is one history.
  key: string;
  name: string;
  type: TrackingType;
}
export interface ExerciseOption<L> {
  // Unique per exercise and tracking type (weight x reps uses the plain key).
  key: string;
  libKey: string;
  name: string;
  type: TrackingType;
  logs: L[];
}

// Groups logged sets into one history per exercise and tracking type, most-logged first. A set that was recorded a different way (the coach
// changed how the exercise is tracked) lands in its own history instead of being mixed in.
export function exerciseOptions<L extends ProgressLog & Pick<WorkoutLogRow, 'actual_reps' | 'actual_load'>>(logs: L[], infoOf: (l: L) => ExerciseInfo | null): ExerciseOption<L>[] {
  const out = new Map<string, ExerciseOption<L>>();
  for (const l of logs) {
    const info = infoOf(l);
    if (!info) continue;
    const counts = info.type === 'weight_reps' ? countsAsWorkingSet(l) : l.set_type !== 'warmup' && hasRecordedValue(info.type, l);
    if (!counts) continue;
    const key = info.type === 'weight_reps' ? info.key : `${info.key}|${info.type}`;
    const cur = out.get(key);
    if (cur) cur.logs.push(l);
    else out.set(key, { key, libKey: info.key, name: info.name, type: info.type, logs: [l] });
  }
  const list = [...out.values()];
  const nameCount = new Map<string, number>();
  for (const o of list) nameCount.set(o.name, (nameCount.get(o.name) ?? 0) + 1);
  for (const o of list) if ((nameCount.get(o.name) ?? 0) > 1) o.name = `${o.name} (${TRACKING[o.type].label})`;
  return list.sort((a, b) => b.logs.length - a.logs.length);
}

// ---- scored blocks ----
export interface BlockInfo {
  names: string[];
  config: BlockConfig;
}

// The exercises and settings of one block of a workout, from that day's exercise rows.
export function blockInfoFor<T extends SectionedExercise & { name: string }>(dayRows: T[], blockKey: string): BlockInfo | null {
  const rows = groupIntoBlocks(dayRows).get(blockKey);
  return rows && rows.length ? { names: rows.map((r) => r.name), config: blockConfigOf(rows) } : null;
}

type ResultLike = Pick<WorkoutBlockResultRow, 'program_day_id' | 'block_key' | 'format' | 'scoring' | 'rounds' | 'reps' | 'seconds' | 'score' | 'done' | 'logged_at'>;

export interface BlockEntry<R> {
  date: string;
  result: R;
  text: string;
  score: number[] | null;
  isPB: boolean;
}
export interface BlockSeries<R> {
  key: string;
  title: string;
  detail: string;
  scoring: Exclude<Scoring, 'none'>;
  entries: BlockEntry<R>[];
  best: BlockEntry<R> | null;
}

// A result's score, higher is better (a quicker time scores higher). A tick has nothing to rank.
export function resultScore(r: Pick<ResultLike, 'scoring' | 'rounds' | 'reps' | 'seconds' | 'score'>): number[] | null {
  switch (r.scoring) {
    case 'rounds_reps':
      return r.rounds == null ? null : [r.rounds, r.reps ?? 0];
    case 'time':
      return r.seconds == null ? null : [-r.seconds];
    case 'rounds':
      return r.rounds == null ? null : [r.rounds];
    case 'score':
      return r.score == null ? null : [r.score];
    default:
      return null;
  }
}

// One series per kind of block: the same format and scoring, the same numbers (cap, rounds, work and rest) and the same exercises, so a
// 10-minute AMRAP is never set against a 12-minute one. Series with the most recent result come first; entries run oldest to newest.
export function blockSeries<R extends ResultLike>(results: R[], infoOf: (programDayId: string, blockKey: string) => BlockInfo | null, tz: string): BlockSeries<R>[] {
  const out = new Map<string, BlockSeries<R>>();
  for (const r of [...results].sort((a, b) => a.logged_at.localeCompare(b.logged_at))) {
    const info = infoOf(r.program_day_id, r.block_key) ?? { names: [], config: { scoring: r.scoring } };
    const c = info.config;
    const names = [...info.names].map((n) => n.trim().toLowerCase()).sort();
    const key = [r.scoring, r.format ?? '', c.cap_seconds ?? '', c.rounds ?? '', c.work_seconds ?? '', c.rest_seconds ?? '', names.join(',')].join('|');
    let series = out.get(key);
    if (!series) {
      series = {
        key,
        title: r.format ?? SCORING[r.scoring].label,
        detail: [configSummary(c), info.names.join(', ')].filter(Boolean).join(' · '),
        scoring: r.scoring,
        entries: [],
        best: null,
      };
      out.set(key, series);
    }
    const score = resultScore(r);
    const priorBest = series.best?.score ?? null;
    const entry: BlockEntry<R> = {
      date: logDay(r.logged_at, tz),
      result: r,
      text: resultSummary({ ...c, scoring: r.scoring }, r),
      score,
      isPB: score != null && priorBest != null && compareScores(score, priorBest) > 0,
    };
    series.entries.push(entry);
    if (score && (priorBest == null || compareScores(score, priorBest) > 0)) series.best = entry;
  }
  return [...out.values()].sort((a, b) => b.entries[b.entries.length - 1].result.logged_at.localeCompare(a.entries[a.entries.length - 1].result.logged_at));
}

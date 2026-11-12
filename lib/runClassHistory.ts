import { resultSummary, sanitiseConfig, type BlockConfig, type Scoring } from '@/lib/blockScoring';
import { hasRecordedValue, setSummary, type LogValues, type TrackingType } from '@/lib/workoutTracking';

// What Run this class shows under "Last weights" (CS18): a member's earlier sets on the day's exercises, whatever they are tracked by,
// and their earlier results on the day's scored blocks.

export interface HistorySet {
  // The tracking type of the exercise row the set was logged against.
  type: TrackingType;
  reps: number | null;
  load: number | null;
  seconds: number | null;
  distance: number | null;
  calories: number | null;
}

const asLog = (s: HistorySet): LogValues => ({
  actual_reps: s.reps,
  actual_load: s.load,
  actual_seconds: s.seconds,
  actual_distance: s.distance,
  actual_calories: s.calories,
});

// One past session's sets on one line. Weight x reps reads "60kg × 8, 8, 6" (sets at the same load joined, as before); reps only
// "10, 10, 8 reps"; a tick "Done" ("Done × 3" for several); time, distance and calories list what each set recorded ("1:30, 1:25",
// "500m · 1:52"). Sets with nothing recorded are left out, and null means nothing is left to show.
export function describeHistorySets(sets: HistorySet[]): string | null {
  const done = sets.filter((s) => hasRecordedValue(s.type, asLog(s)));
  if (done.length === 0) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < done.length) {
    const first = done[i];
    let j = i;
    const sameRun = (next: HistorySet) => next.type === first.type && (first.type !== 'weight_reps' || next.load === first.load);
    while (j + 1 < done.length && sameRun(done[j + 1])) j++;
    const run = done.slice(i, j + 1);
    if (first.type === 'weight_reps') {
      const reps = run.map((s) => s.reps ?? '—').join(', ');
      parts.push(first.load != null ? `${first.load}kg × ${reps}` : `${reps} reps`);
    } else if (first.type === 'reps') {
      parts.push(`${run.map((s) => s.reps ?? '—').join(', ')} reps`);
    } else if (first.type === 'tick') {
      parts.push(run.length === 1 ? 'Done' : `Done × ${run.length}`);
    } else {
      parts.push(run.map((s) => setSummary(s.type, asLog(s))).join(', '));
    }
    i = j + 1;
  }
  return parts.join(' · ');
}

export interface PastBlockResult {
  blockKey: string;
  format: string | null;
  scoring: Exclude<Scoring, 'none'>;
  rounds: number | null;
  reps: number | null;
  seconds: number | null;
  score: number | null;
  done: boolean | null;
  date: string;
}

const sameFormat = (a: string | null, b: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// The member's earlier results on one of the day's scored blocks: the same block (e.g. 'conditioning:1') in the same format, newest
// first. Results arrive newest first.
export function pastResultsFor(results: PastBlockResult[], blockKey: string, format: string | null, limit = 2): PastBlockResult[] {
  return results.filter((r) => r.blockKey === blockKey && sameFormat(r.format, format)).slice(0, limit);
}

// "5 rounds + 3 reps", "12:40", "Hit the 15:00 cap · 80 reps": read with today's block settings (its cap or unit) when it is scored the
// same way, otherwise by the result's own scoring alone.
export function describePastResult(result: PastBlockResult, todayConfig: unknown): string {
  const config: BlockConfig = sanitiseConfig(todayConfig);
  return resultSummary(config.scoring === result.scoring ? config : { scoring: result.scoring }, result);
}

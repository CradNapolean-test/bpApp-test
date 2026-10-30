// How a Strong or Conditioning block is scored, and the numbers that go with its format (migration 0152). The format name (AMRAP, EMOM, ...)
// stays a label; the scoring says what the member records for the whole block, and the parameters say what the coach set (a time cap, a number
// of rounds, work and rest). Twin of packages/shared/src/blockScoring.ts: keep the two the same.
import { formatDuration, parseDuration, parseNumberText } from './workoutTracking';

export const SCORINGS = ['none', 'rounds_reps', 'time', 'rounds', 'done', 'score'] as const;
export type Scoring = (typeof SCORINGS)[number];

export const SCORING: Record<Scoring, { label: string; hint: string }> = {
  none: { label: 'No result', hint: 'Nothing to record for the block' },
  rounds_reps: { label: 'Rounds and reps', hint: 'AMRAP: rounds completed plus the reps into the next one' },
  time: { label: 'Finish time', hint: 'For time: how long it took' },
  rounds: { label: 'Rounds completed', hint: 'Circuits and intervals: how many rounds' },
  done: { label: 'Done', hint: 'A tick when the block is finished' },
  score: { label: 'A score', hint: 'Max effort: a total in a unit you name (calories, metres, reps)' },
};

export interface BlockConfig {
  scoring: Scoring;
  // The time cap, or the length of the block, in seconds.
  cap_seconds?: number;
  rounds?: number;
  work_seconds?: number;
  rest_seconds?: number;
  // What a "score" is counted in.
  unit?: string;
}

export const NO_CONFIG: BlockConfig = { scoring: 'none' };

// What picking a well-known format fills in. The coach can change any of it; formats not listed here start with no result.
const FORMAT_DEFAULTS: Record<string, BlockConfig> = {
  AMRAP: { scoring: 'rounds_reps' },
  'Partner AMRAP': { scoring: 'rounds_reps' },
  EMOM: { scoring: 'done' },
  Tabata: { scoring: 'rounds', work_seconds: 20, rest_seconds: 10, rounds: 8 },
  Circuit: { scoring: 'rounds' },
  'Big Chipper': { scoring: 'time' },
};

export function defaultConfigFor(format: string | null): BlockConfig {
  const known = format ? FORMAT_DEFAULTS[format] : undefined;
  return { ...(known ?? NO_CONFIG) };
}

const positive = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);

// A config as stored (a json column, so anything could be in it) turned into one the app can trust.
export function sanitiseConfig(raw: unknown): BlockConfig {
  if (!raw || typeof raw !== 'object') return { ...NO_CONFIG };
  const r = raw as Record<string, unknown>;
  const scoring = (SCORINGS as readonly string[]).includes(r.scoring as string) ? (r.scoring as Scoring) : 'none';
  const out: BlockConfig = { scoring };
  const cap = positive(r.cap_seconds, 86_400);
  const rounds = positive(r.rounds, 1000);
  const work = positive(r.work_seconds, 3600);
  const rest = positive(r.rest_seconds, 3600);
  if (cap != null) out.cap_seconds = cap;
  if (rounds != null) out.rounds = Math.round(rounds);
  if (work != null) out.work_seconds = work;
  if (rest != null) out.rest_seconds = rest;
  if (typeof r.unit === 'string' && r.unit.trim()) out.unit = r.unit.trim().slice(0, 20);
  return out;
}

// What a block stores: nothing at all for a plain block, so older rows and plain blocks stay empty.
export function configForStorage(config: BlockConfig): BlockConfig | null {
  const clean = sanitiseConfig(config);
  return clean.scoring === 'none' && Object.keys(clean).length === 1 ? null : clean;
}

// The block's config: the first exercise in it that has one (the coach sets it once for the block; every row carries a copy).
export function blockConfigOf(rows: { block_config?: unknown }[] | undefined): BlockConfig {
  const withConfig = rows?.find((r) => r.block_config != null);
  return withConfig ? sanitiseConfig(withConfig.block_config) : { ...NO_CONFIG };
}

const minutes = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} min` : formatDuration(seconds));

// The numbers the coach set, on one line: "10 min cap · 8 rounds · 20s on / 10s off".
export function configSummary(config: BlockConfig): string {
  const parts: string[] = [];
  if (config.cap_seconds != null) parts.push(config.scoring === 'done' ? minutes(config.cap_seconds) : `${minutes(config.cap_seconds)} cap`);
  if (config.rounds != null) parts.push(`${config.rounds} round${config.rounds === 1 ? '' : 's'}`);
  if (config.work_seconds != null && config.rest_seconds != null) parts.push(`${config.work_seconds}s on / ${config.rest_seconds}s off`);
  else if (config.work_seconds != null) parts.push(`${config.work_seconds}s on`);
  else if (config.rest_seconds != null) parts.push(`${config.rest_seconds}s rest`);
  return parts.join(' · ');
}

// ---- the member's result for a block ----
export interface ResultValues {
  rounds: number | null;
  reps: number | null;
  seconds: number | null;
  score: number | null;
  done: boolean | null;
}
export interface ResultInputs {
  rounds: string;
  reps: string;
  time: string;
  score: string;
  done: boolean;
}
export const BLANK_RESULT_INPUTS: ResultInputs = { rounds: '', reps: '', time: '', score: '', done: false };

export type ResultField = 'rounds' | 'reps' | 'time' | 'score' | 'done';
const FIELDS: Record<Scoring, ResultField[]> = {
  none: [],
  rounds_reps: ['rounds', 'reps'],
  time: ['time'],
  rounds: ['rounds'],
  done: ['done'],
  score: ['score'],
};
export const resultFields = (scoring: Scoring): ResultField[] => FIELDS[scoring];

export function resultLabel(field: ResultField, config: BlockConfig): string {
  if (field === 'rounds') return 'Rounds completed';
  if (field === 'reps') return 'Extra reps';
  if (field === 'time') return 'Finish time';
  if (field === 'done') return 'Block done';
  return config.unit ? `Score (${config.unit})` : 'Score';
}

export function readResultInputs(scoring: Scoring, i: ResultInputs): { ok: true; values: ResultValues } | { ok: false; error: string } {
  const fields = FIELDS[scoring];
  const has = (f: ResultField) => fields.includes(f);
  const bad = (text: string, n: number | null) => text.trim() !== '' && (n == null || n < 0);
  const rounds = has('rounds') ? parseNumberText(i.rounds) : null;
  const reps = has('reps') ? parseNumberText(i.reps) : null;
  const seconds = has('time') ? parseDuration(i.time) : null;
  const score = has('score') ? parseNumberText(i.score) : null;
  if (bad(i.rounds, rounds)) return { ok: false, error: 'The rounds need to be a number.' };
  if (bad(i.reps, reps)) return { ok: false, error: 'The reps need to be a number.' };
  if (bad(i.time, seconds)) return { ok: false, error: 'Time can be seconds (90) or minutes and seconds (12:30).' };
  if (bad(i.score, score)) return { ok: false, error: 'The score needs to be a number.' };
  return {
    ok: true,
    values: {
      rounds: rounds == null ? null : Math.round(rounds),
      reps: reps == null ? null : Math.round(reps),
      seconds: seconds == null ? null : Math.round(seconds * 100) / 100,
      score: score == null ? null : Math.round(score * 100) / 100,
      done: has('done') ? i.done : null,
    },
  };
}

// A saved result counts for a block only while the block is still scored the way it was saved (a rounds result means nothing once the coach
// switches the block to a finish time). The old row stays in the history under its own scoring until a new result replaces it.
export function resultForConfig<R extends { scoring: string }>(config: BlockConfig, result: R | undefined | null): R | undefined {
  return result && result.scoring === config.scoring ? result : undefined;
}

// Reps alone (with no rounds) or an unticked "done" say nothing, so there is nothing to save.
export function isBlankResult(scoring: Scoring, v: ResultValues): boolean {
  if (scoring === 'none') return true;
  if (scoring === 'done') return v.done !== true;
  if (scoring === 'rounds_reps') return v.rounds == null;
  if (scoring === 'time') return v.seconds == null;
  if (scoring === 'rounds') return v.rounds == null;
  return v.score == null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function resultSummary(config: BlockConfig, v: ResultValues): string {
  switch (config.scoring) {
    case 'rounds_reps':
      if (v.rounds == null) return '—';
      return v.reps ? `${plural(v.rounds, 'round')} + ${plural(v.reps, 'rep')}` : plural(v.rounds, 'round');
    case 'time':
      return v.seconds == null ? '—' : formatDuration(v.seconds);
    case 'rounds':
      return v.rounds == null ? '—' : plural(v.rounds, 'round');
    case 'done':
      return v.done ? 'Done' : '—';
    case 'score':
      return v.score == null ? '—' : `${v.score}${config.unit ? ` ${config.unit}` : ''}`;
    default:
      return '—';
  }
}

export function inputsFromResult(r: { rounds: number | null; reps: number | null; seconds: number | null; score: number | null; done: boolean | null } | null | undefined): ResultInputs {
  if (!r) return { ...BLANK_RESULT_INPUTS };
  const text = (n: number | null) => (n == null ? '' : String(n));
  return {
    rounds: text(r.rounds),
    reps: text(r.reps),
    time: r.seconds == null ? '' : r.seconds < 60 ? String(r.seconds) : formatDuration(r.seconds),
    score: text(r.score),
    done: r.done === true,
  };
}

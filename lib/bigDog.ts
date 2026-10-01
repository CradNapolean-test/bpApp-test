// Ballistic Performance "Big Dog" member standards, from the owner's Member Standards sheet.
// Three levels per exercise (Rookie / Strong / Big Dog), split by gender where they differ.
// The total number of exercises at Big Dog level decides the T-shirt tier.
//
// All 13 exercises from the sheet are included and Gold means Big Dog in every one of them
// (owner confirmed; the mockup only showed 12).

export type BigDogGender = 'male' | 'female';
export type BigDogLevel = 'none' | 'rookie' | 'strong' | 'big_dog';
export type BigDogTier = 'none' | 'white' | 'turquoise' | 'silver' | 'gold';

// What an exercise is scored in. weight (kg), reps (bodyweight reps; 0 = banded), hold (seconds held)
// and distance (metres) are better when higher; time (race seconds) is better when lower.
export type ResultKind = 'weight' | 'reps' | 'hold' | 'time' | 'distance';

type Standards = { rookie: string; strong: string; bigDog: string };

export interface BigDogExercise {
  key: string;
  name: string;
  category: string;
  kind: ResultKind;
  male: Standards;
  female: Standards;
}

const both = (rookie: string, strong: string, bigDog: string): { male: Standards; female: Standards } => ({
  male: { rookie, strong, bigDog },
  female: { rookie, strong, bigDog },
});

export const EXERCISES: BigDogExercise[] = [
  {
    key: 'deadlift', name: 'Deadlift 3RM', category: 'Lower body strength', kind: 'weight',
    male: { rookie: '80kg', strong: '120kg', bigDog: '160kg' },
    female: { rookie: '60kg', strong: '85kg', bigDog: '110kg' },
  },
  {
    key: 'back_squat', name: 'Back squat 3RM', category: 'Lower body strength', kind: 'weight',
    male: { rookie: '70kg', strong: '100kg', bigDog: '140kg' },
    female: { rookie: '40kg', strong: '60kg', bigDog: '90kg' },
  },
  {
    key: 'bench_press', name: 'Bench press 3RM', category: 'Upper body strength', kind: 'weight',
    male: { rookie: '60kg', strong: '75kg', bigDog: '100kg' },
    female: { rookie: '25kg', strong: '40kg', bigDog: '55kg' },
  },
  {
    key: 'chin_ups', name: 'Chin ups', category: 'Upper body strength', kind: 'reps',
    male: { rookie: 'Banded', strong: '5 BW', bigDog: '12 BW' },
    female: { rookie: 'Banded', strong: '1 BW', bigDog: '3 BW' },
  },
  { key: 'dead_hang', name: 'Dead hang', category: 'Core strength', kind: 'hold', ...both('1:00', '1:45', '2:30') },
  { key: 'farmer_carries', name: 'Farmer carries', category: 'Core strength', kind: 'distance', ...both('100m', '180m', '250m') },
  {
    key: 'row_2000', name: '2000m row', category: 'Aerobic fitness', kind: 'time',
    male: { rookie: '<9:10', strong: '<8:30', bigDog: '<7:20' },
    female: { rookie: '<10:30', strong: '<9:50', bigDog: '<9:00' },
  },
  {
    key: 'ski_2000', name: '2000m ski', category: 'Aerobic fitness', kind: 'time',
    male: { rookie: '<10:00', strong: '<9:00', bigDog: '<8:10' },
    female: { rookie: '<11:30', strong: '<10:30', bigDog: '<9:45' },
  },
  {
    key: 'bike_4000', name: '4000m bike', category: 'Aerobic fitness', kind: 'time',
    male: { rookie: '<9:00', strong: '<8:15', bigDog: '<7:40' },
    female: { rookie: '<10:40', strong: '<9:40', bigDog: '<8:50' },
  },
  {
    key: 'run_5000', name: '5000m run', category: 'Aerobic fitness', kind: 'time',
    male: { rookie: '<28:00', strong: '<24:00', bigDog: '<20:00' },
    female: { rookie: '<30:00', strong: '<26:00', bigDog: '<22:00' },
  },
  {
    key: 'rower_30_30', name: 'Rower 30:30 x8', category: 'Anaerobic fitness', kind: 'distance',
    male: { rookie: '>960m', strong: '>1100m', bigDog: '>1210m' },
    female: { rookie: '>730m', strong: '>990m', bigDog: '>1150m' },
  },
  {
    key: 'ski_30_30', name: 'Ski erg 30:30 x8', category: 'Anaerobic fitness', kind: 'distance',
    male: { rookie: '>890m', strong: '>970m', bigDog: '>1050m' },
    female: { rookie: '>720m', strong: '>880m', bigDog: '>950m' },
  },
  {
    key: 'bike_30_30', name: 'Bike 30:30 x8', category: 'Anaerobic fitness', kind: 'distance',
    male: { rookie: '>1860m', strong: '>2000m', bigDog: '>2500m' },
    female: { rookie: '>1630m', strong: '>1800m', bigDog: '>2150m' },
  },
];

export const EXERCISE_KEYS = new Set(EXERCISES.map((e) => e.key));

// T-shirt tiers: White 1+ exercises at Big Dog, Turquoise 3+, Silver 6+, Gold all 13.
export const TIER_THRESHOLDS = { white: 1, turquoise: 3, silver: 6, gold: EXERCISES.length } as const;

export const LEVEL_LABEL: Record<BigDogLevel, string> = {
  none: 'Not tested',
  rookie: 'Rookie',
  strong: 'Strong',
  big_dog: 'Big Dog',
};

export function tierForCount(bigDogCount: number): BigDogTier {
  if (bigDogCount >= TIER_THRESHOLDS.gold) return 'gold';
  if (bigDogCount >= TIER_THRESHOLDS.silver) return 'silver';
  if (bigDogCount >= TIER_THRESHOLDS.turquoise) return 'turquoise';
  if (bigDogCount >= TIER_THRESHOLDS.white) return 'white';
  return 'none';
}

export const TIER_TITLE: Record<BigDogTier, string> = {
  none: 'Working towards Big Dog',
  white: 'White Big Dog',
  turquoise: 'Turquoise Big Dog',
  silver: 'Silver Big Dog',
  gold: 'Gold Big Dog',
};

export function nextTierLabel(bigDogCount: number): string {
  if (bigDogCount >= TIER_THRESHOLDS.gold) return `Maximum — all ${EXERCISES.length}!`;
  if (bigDogCount >= TIER_THRESHOLDS.silver) return `Next: Gold (all ${EXERCISES.length})`;
  if (bigDogCount >= TIER_THRESHOLDS.turquoise) return `Next: Silver (${TIER_THRESHOLDS.silver}+)`;
  if (bigDogCount >= TIER_THRESHOLDS.white) return `Next: Turquoise (${TIER_THRESHOLDS.turquoise}+)`;
  return 'Hit Big Dog in 1 exercise';
}

export function genderFromProfile(gender: string | null | undefined): BigDogGender {
  return gender === 'Male' ? 'male' : 'female';
}

export interface BigDogResultLike {
  exercise_key: string;
  level: BigDogLevel;
  tested_date: string;
  created_at: string;
  // A score the member logged themselves. It shows on their own screen but never counts towards a
  // T-shirt tier until a coach verifies it (which adds a coach-recorded row).
  self_reported?: boolean | null;
}

// Results are an append-only ledger (a retest or correction is a new row), so the current
// level of each exercise is its most recent row.
export function currentLevels<T extends BigDogResultLike>(results: T[]): Record<string, T> {
  const latest: Record<string, T> = {};
  for (const r of results) {
    if (!EXERCISE_KEYS.has(r.exercise_key)) continue;
    const prev = latest[r.exercise_key];
    if (!prev || `${r.tested_date}|${r.created_at}` > `${prev.tested_date}|${prev.created_at}`) latest[r.exercise_key] = r;
  }
  return latest;
}

export function bigDogCount(results: BigDogResultLike[]): number {
  return Object.values(currentLevels(results.filter((r) => !r.self_reported))).filter((r) => r.level === 'big_dog').length;
}


// ---- Scores --------------------------------------------------------------------------------------
// A member logs what they actually did (125 kg, 8:42, 5 chin-ups) and the level is worked out from
// the standards, never picked by hand. Results are stored as one number: kg, reps, seconds or metres.

export const higherIsBetter = (kind: ResultKind): boolean => kind !== 'time';

interface Threshold {
  n: number;
  // "<9:10" and ">960m" must be beaten; "160kg" or "1:00" only need to be matched.
  strict: boolean;
}

function parseClock(text: string): number | null {
  const m = text.trim().match(/^(\d+):(\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function parseThreshold(text: string): Threshold {
  const strict = text.startsWith('<') || text.startsWith('>');
  const t = text.replace(/^[<>]/, '').trim();
  if (/^banded$/i.test(t)) return { n: 0, strict };
  const clock = parseClock(t);
  if (clock != null) return { n: clock, strict };
  return { n: parseFloat(t), strict };
}

export function thresholdsFor(ex: BigDogExercise, gender: BigDogGender) {
  const std = ex[gender];
  return { rookie: parseThreshold(std.rookie), strong: parseThreshold(std.strong), bigDog: parseThreshold(std.bigDog) };
}

function meets(kind: ResultKind, value: number, t: Threshold): boolean {
  if (kind === 'time') return t.strict ? value < t.n : value <= t.n;
  return t.strict ? value > t.n : value >= t.n;
}

// Chin-ups: 0 means "banded", which is already a Rookie result.
export function levelForResult(ex: BigDogExercise, gender: BigDogGender, value: number): BigDogLevel {
  const t = thresholdsFor(ex, gender);
  if (ex.kind === 'reps') {
    if (value >= t.bigDog.n) return 'big_dog';
    if (value >= t.strong.n) return 'strong';
    return value >= 0 ? 'rookie' : 'none';
  }
  if (meets(ex.kind, value, t.bigDog)) return 'big_dog';
  if (meets(ex.kind, value, t.strong)) return 'strong';
  if (meets(ex.kind, value, t.rookie)) return 'rookie';
  return 'none';
}

export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatResult(kind: ResultKind, value: number): string {
  switch (kind) {
    case 'weight': return `${+value.toFixed(1)}kg`;
    case 'reps': return value === 0 ? 'Banded' : `${value} BW`;
    case 'distance': return `${Math.round(value)}m`;
    default: return formatClock(value);
  }
}

// What a member typed -> the stored number, or null if it isn't a usable result.
export function parseResultInput(kind: ResultKind, input: string): number | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;
  if (kind === 'hold' || kind === 'time') {
    const clock = parseClock(text);
    if (clock != null) return clock > 0 ? clock : null;
    const secs = Number(text);
    return Number.isFinite(secs) && secs > 0 ? secs : null;
  }
  if (kind === 'reps' && text === 'banded') return 0;
  const n = Number(text.replace(/(kg|m|bw)$/, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  if (kind === 'reps') return Number.isInteger(n) ? n : null;
  return n > 0 ? n : null;
}

const LEVEL_ORDER: Record<BigDogLevel, number> = { none: 0, rookie: 1, strong: 2, big_dog: 3 };
export const levelRank = (l: BigDogLevel) => LEVEL_ORDER[l];

// The next level above `current` and how far the logged `value` is from it (null if already Big Dog).
export function nextTarget(
  ex: BigDogExercise,
  gender: BigDogGender,
  current: BigDogLevel,
  value: number | null
): { level: BigDogLevel; label: string; gap: string | null } | null {
  if (current === 'big_dog') return null;
  const next: BigDogLevel = current === 'none' ? 'rookie' : current === 'rookie' ? 'strong' : 'big_dog';
  const label = next === 'rookie' ? ex[gender].rookie : next === 'strong' ? ex[gender].strong : ex[gender].bigDog;
  const t = thresholdsFor(ex, gender)[next === 'rookie' ? 'rookie' : next === 'strong' ? 'strong' : 'bigDog'];
  let gap: string | null = null;
  if (value != null) {
    const diff = ex.kind === 'time' ? value - t.n : t.n - value;
    if (diff > 0) {
      const amount = ex.kind === 'weight' ? `${+diff.toFixed(1)}kg` : ex.kind === 'reps' ? `${diff} rep${diff === 1 ? '' : 's'}` : ex.kind === 'distance' ? `${Math.round(diff)}m` : formatClock(diff);
      gap = ex.kind === 'time' ? `${amount} faster` : `${amount} more`;
    }
  }
  return { level: next, label, gap };
}

export interface ScoredResult extends BigDogResultLike {
  result_value?: number | null;
}

// The member's best logged result for an exercise (any source), by the exercise's direction.
export function bestResult<T extends ScoredResult>(results: T[], ex: BigDogExercise): T | null {
  let best: T | null = null;
  for (const r of results) {
    if (r.exercise_key !== ex.key || r.result_value == null) continue;
    if (!best || (higherIsBetter(ex.kind) ? r.result_value > (best.result_value as number) : r.result_value < (best.result_value as number))) best = r;
  }
  return best;
}

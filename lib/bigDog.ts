// Ballistic Performance "Big Dog" member standards, from the owner's Member Standards sheet.
// Three levels per exercise (Rookie / Strong / Big Dog), split by gender where they differ.
// The total number of exercises at Big Dog level decides the T-shirt tier.
//
// All 13 exercises from the sheet are included and Gold means Big Dog in every one of them
// (owner confirmed; the mockup only showed 12).

export type BigDogGender = 'male' | 'female';
export type BigDogLevel = 'none' | 'rookie' | 'strong' | 'big_dog';
export type BigDogTier = 'none' | 'white' | 'turquoise' | 'silver' | 'gold';

type Standards = { rookie: string; strong: string; bigDog: string };

export interface BigDogExercise {
  key: string;
  name: string;
  category: string;
  male: Standards;
  female: Standards;
}

const both = (rookie: string, strong: string, bigDog: string): { male: Standards; female: Standards } => ({
  male: { rookie, strong, bigDog },
  female: { rookie, strong, bigDog },
});

export const EXERCISES: BigDogExercise[] = [
  {
    key: 'deadlift', name: 'Deadlift 3RM', category: 'Lower body strength',
    male: { rookie: '80kg', strong: '120kg', bigDog: '160kg' },
    female: { rookie: '60kg', strong: '85kg', bigDog: '110kg' },
  },
  {
    key: 'back_squat', name: 'Back squat 3RM', category: 'Lower body strength',
    male: { rookie: '70kg', strong: '100kg', bigDog: '140kg' },
    female: { rookie: '40kg', strong: '60kg', bigDog: '90kg' },
  },
  {
    key: 'bench_press', name: 'Bench press 3RM', category: 'Upper body strength',
    male: { rookie: '60kg', strong: '75kg', bigDog: '100kg' },
    female: { rookie: '25kg', strong: '40kg', bigDog: '55kg' },
  },
  {
    key: 'chin_ups', name: 'Chin ups', category: 'Upper body strength',
    male: { rookie: 'Banded', strong: '5 BW', bigDog: '12 BW' },
    female: { rookie: 'Banded', strong: '1 BW', bigDog: '3 BW' },
  },
  { key: 'dead_hang', name: 'Dead hang', category: 'Core strength', ...both('1:00', '1:45', '2:30') },
  { key: 'farmer_carries', name: 'Farmer carries', category: 'Core strength', ...both('100m', '180m', '250m') },
  {
    key: 'row_2000', name: '2000m row', category: 'Aerobic fitness',
    male: { rookie: '<9:10', strong: '<8:30', bigDog: '<7:20' },
    female: { rookie: '<10:30', strong: '<9:50', bigDog: '<9:00' },
  },
  {
    key: 'ski_2000', name: '2000m ski', category: 'Aerobic fitness',
    male: { rookie: '<10:00', strong: '<9:00', bigDog: '<8:10' },
    female: { rookie: '<11:30', strong: '<10:30', bigDog: '<9:45' },
  },
  {
    key: 'bike_4000', name: '4000m bike', category: 'Aerobic fitness',
    male: { rookie: '<9:00', strong: '<8:15', bigDog: '<7:40' },
    female: { rookie: '<10:40', strong: '<9:40', bigDog: '<8:50' },
  },
  {
    key: 'run_5000', name: '5000m run', category: 'Aerobic fitness',
    male: { rookie: '<28:00', strong: '<24:00', bigDog: '<20:00' },
    female: { rookie: '<30:00', strong: '<26:00', bigDog: '<22:00' },
  },
  {
    key: 'rower_30_30', name: 'Rower 30:30 x8', category: 'Anaerobic fitness',
    male: { rookie: '>960m', strong: '>1100m', bigDog: '>1210m' },
    female: { rookie: '>730m', strong: '>990m', bigDog: '>1150m' },
  },
  {
    key: 'ski_30_30', name: 'Ski erg 30:30 x8', category: 'Anaerobic fitness',
    male: { rookie: '>890m', strong: '>970m', bigDog: '>1050m' },
    female: { rookie: '>720m', strong: '>880m', bigDog: '>950m' },
  },
  {
    key: 'bike_30_30', name: 'Bike 30:30 x8', category: 'Anaerobic fitness',
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
  return Object.values(currentLevels(results)).filter((r) => r.level === 'big_dog').length;
}

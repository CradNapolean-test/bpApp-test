import { equivalentMinutesForActivity } from '../calculations';
import type { ActivityRow } from '../data/types';

// The "step swap": what the step target is worth in other activities. The maths is equivalentMinutesForActivity
// (lib/calculations.ts, validated against the coach's spreadsheet); this module only groups, names and filters the rows.
// Bodyweight is passed to that function but does not change the answer (it cancels out of the ratio).

export const ACTIVITY_CATEGORIES = ['All', 'Walking', 'Running', 'Cycling', 'Swimming', 'Gym'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export function categoryOf(name: string): Exclude<ActivityCategory, 'All'> {
  const first = name.split(/[ ,]/)[0].toLowerCase();
  if (first === 'walking') return 'Walking';
  if (first === 'running') return 'Running';
  if (first === 'bicycling') return 'Cycling';
  if (first === 'swimming') return 'Swimming';
  return 'Gym';
}

// "running, 10 mph (6 min/mile) / 16.1 kph" -> title "Running", detail "10 mph (6 min/mile) / 16.1 kph".
export function splitName(name: string): { title: string; detail: string | null } {
  const [head, ...rest] = name.split(/,\s*/);
  const title = head.toLowerCase() === 'bicycling' ? 'Cycling' : head.charAt(0).toUpperCase() + head.slice(1);
  return { title, detail: rest.length > 0 ? rest.join(', ') : null };
}

// Minutes per 1,000 steps: the database accepts above 0 and up to 60 (migration 0073).
export const MINUTES_PER_1000_MAX = 60;
export const DEFAULT_MINUTES_PER_1000 = 10;

export function validateMinutesPer1000(n: number): string | null {
  return n > 0 && n <= MINUTES_PER_1000_MAX ? null : `Minutes per 1,000 steps should be more than 0 and up to ${MINUTES_PER_1000_MAX}.`;
}

export type SwapRow = ActivityRow & { minutes: number; title: string; detail: string | null; category: Exclude<ActivityCategory, 'All'> };

export function swapRows(activities: ActivityRow[], steps: number, minutesPer1000: number, bodyWeightKg: number | null, category: ActivityCategory, query: string): SwapRow[] {
  const q = query.trim().toLowerCase();
  return activities
    .map((a) => ({ ...a, minutes: equivalentMinutesForActivity(steps, minutesPer1000, bodyWeightKg ?? 70, a.met), ...splitName(a.name), category: categoryOf(a.name) }))
    .filter((r) => (category === 'All' || r.category === category) && (q === '' || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.minutes - b.minutes);
}

export function walkingMinutes(steps: number, minutesPer1000: number): number {
  return Math.round((minutesPer1000 * steps) / 1000);
}

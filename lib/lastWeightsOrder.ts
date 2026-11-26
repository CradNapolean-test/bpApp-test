import type { WorkoutSection } from '@/lib/workoutSections';

// Run this class's "Last weights" for a member: the main lifts first, then Strong and Conditioning, and the warm-ups last (CS22: the
// warm-ups came first, each "Not done before", with the lifts below them). Within a section the programme's own order stays.

const RANK: Record<WorkoutSection, number> = { lift: 0, strong: 1, conditioning: 2, warmup: 3 };

export function lastWeightsOrder<T extends { section?: WorkoutSection | null }>(exercises: readonly T[]): T[] {
  // An exercise with no section is a lift, as everywhere else (SECTION_TITLE[e.section ?? 'lift']).
  const rank = (e: T) => RANK[e.section ?? 'lift'] ?? 0;
  return exercises
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

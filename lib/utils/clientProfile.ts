import type { ClientProfileRow } from '@/lib/data/types';
import type { ClientProfile } from '@/lib/calculations';

// Shared mapping from the stored client_profiles row shape to lib/calculations.ts's
// ClientProfile input shape -- used everywhere a live target needs computing outside of
// SetupTab itself (which has its own inline in-progress form state to map instead).
// Mirrors calcEngine's own internal guard, so callers can treat a null return as
// "not enough profile data yet" without duplicating the check.
export function toEngineProfile(row: ClientProfileRow | null): ClientProfile | null {
  if (!row || !row.age || !row.start_weight || !row.goal_weight || !row.body_fat_pct) return null;
  return {
    age: row.age,
    gender: row.gender === 'Male' ? 'Male' : 'Female',
    startWeight: row.start_weight,
    goalWeight: row.goal_weight,
    bodyFatPct: row.body_fat_pct,
    activityLevel: row.activity_level,
    dietApproach: row.diet_approach,
    tier: row.tier,
    cycling: row.cycling,
  };
}

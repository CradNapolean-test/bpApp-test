import type { ClientProfileRow } from '../data/types';
import type { ClientProfile, CustomTarget } from '../calculations';
import { targetsHeldBack } from '../onboarding';

// Shared mapping from the stored client_profiles row shape to lib/calculations.ts's
// ClientProfile input shape -- used everywhere a live target needs computing outside of
// SetupTab itself (which has its own inline in-progress form state to map instead).
// Mirrors calcEngine's own internal guard, so callers can treat a null return as
// "not enough profile data yet" without duplicating the check.
// The same, for a screen a MEMBER (or their coach) is looking at: null while the member's plan waits for their coach, so no target is
// worked out or shown to the member yet (M8, D6). A coach always gets the real thing.
// A target the member or their coach typed in is not a number nobody has checked, so it shows even while the plan waits for review.
export function toMemberEngineProfile(row: ClientProfileRow | null, isCoachView: boolean): ClientProfile | null {
  return targetsHeldBack(row, isCoachView) && !customTargetOf(row) ? null : toEngineProfile(row);
}

// The typed-in daily target, or null unless all four numbers are set (they are always saved together).
export function customTargetOf(row: ClientProfileRow | null): CustomTarget | null {
  if (!row) return null;
  const { custom_calories: calories, custom_protein: protein, custom_carbs: carbs, custom_fat: fat } = row;
  if (calories == null || protein == null || carbs == null || fat == null) return null;
  return { calories, protein, carbs, fat };
}

export function toEngineProfile(row: ClientProfileRow | null): ClientProfile | null {
  if (!row) return null;
  const customTarget = customTargetOf(row) ?? undefined;
  const hasDetails = !!row.age && !!row.start_weight && !!row.goal_weight && !!row.body_fat_pct;
  if (!hasDetails && !customTarget) return null;
  // With a typed-in target the calculation is not used, so a member without these details still gets a profile to carry the target.
  return {
    age: row.age ?? 0,
    gender: row.gender === 'Male' ? 'Male' : 'Female',
    startWeight: row.start_weight ?? 0,
    goalWeight: row.goal_weight ?? 0,
    bodyFatPct: row.body_fat_pct ?? 0,
    activityLevel: row.activity_level,
    dietApproach: row.diet_approach,
    goal: row.nutrition_goal ?? 'fat_loss',
    setting: row.nutrition_setting ?? 'steady',
    cycling: row.cycling,
    customTarget,
  };
}

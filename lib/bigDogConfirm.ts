import { EXERCISE_KEYS } from '@/lib/bigDog';

// Confirming a member's own Peak Week score from the coach dashboard's "to verify" list (CV17).
//
// It is the same call as the member's Big Dog page (verifyBigDogScore in lib/data/bigDog.ts, which records a verified row) and is offered
// to the same coach: the page's Verify button shows only on the coach's own member (isOwnClient: profiles.coach_id is the coach), and
// so does this one (the dashboard's `mine`, the same test; on "My members" every row is theirs). The database decides in the end either
// way: big_dog_results takes a verified row only from the member's coach (is_coach_of, migration 0063), and a member's own rows only as
// self-reported (0078). Nothing here writes anything new.
//
// Returns what to confirm, or null when the row has no button: another coach's member (a gym or coach view), an exercise this version of
// the app doesn't know, or a score saved without its number (only the number is re-scored, never the text).
export interface ScoreRow {
  exerciseKey: string;
  value: number | null;
  mine: boolean;
}

export function dashboardConfirmArgs(score: ScoreRow, scope: 'mine' | 'coach' | 'gym'): { exerciseKey: string; value: number } | null {
  const own = scope === 'mine' || score.mine;
  if (!own) return null;
  if (!EXERCISE_KEYS.has(score.exerciseKey)) return null;
  if (score.value == null || !Number.isFinite(score.value)) return null;
  return { exerciseKey: score.exerciseKey, value: score.value };
}

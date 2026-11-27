import { EXERCISE_KEYS, EXERCISES, bestResult, currentLevels, levelForResult, levelRank } from '@/lib/bigDog';
import type { BigDogExercise, BigDogGender, ScoredResult } from '@/lib/bigDog';

// Confirming a member's own Peak Week score from the coach dashboard's "to verify" list (CV17).
//
// It confirms exactly what the member's Big Dog page would offer to verify, through the same call (verifyBigDogScore in
// lib/data/bigDog.ts, which records a verified row), for the same coach: the page's Verify button shows only on the coach's own member
// (isOwnClient: profiles.coach_id is the coach), and so does this one (the dashboard's `mine`, the same test; on "My members" every row
// is theirs). The database decides in the end either way: big_dog_results takes a verified row only from the member's coach
// (is_coach_of, migration 0063), and a member's own rows only as self-reported (0078). Nothing here writes anything new.

// What the member's Big Dog page offers to verify for one exercise (BigDogTab's rule): their best logged result, when they logged it
// themselves and it reaches a higher level than the one a coach has verified. Null when there is nothing to verify.
export function pendingScore<T extends ScoredResult>(results: T[], exercise: BigDogExercise, gender: BigDogGender): T | null {
  const history = results.filter((r) => r.exercise_key === exercise.key);
  const best = bestResult(history, exercise);
  if (!best?.self_reported || best.result_value == null) return null;
  const verifiedLevel = currentLevels(history.filter((r) => !r.self_reported))[exercise.key]?.level ?? 'none';
  const bestLevel = levelForResult(exercise, gender, best.result_value);
  return levelRank(bestLevel) > levelRank(verifiedLevel) ? best : null;
}

// The score a dashboard row names: the member's best result among the scores the dashboard reads (90 days) when they logged it
// themselves, which is the one Confirm checks again against all their results. Null value when the best there is a coach's, so the row
// only opens their page.
type WindowScore = { exercise_key: string; self_reported: boolean | null; result_text: string | null; result_value: number | null; created_at: string };
export function dashboardScore<T extends WindowScore>(
  windowRows: T[],
  exerciseKey: string
): { text: string | null; value: number | null } | null {
  const exercise = EXERCISES.find((e) => e.key === exerciseKey);
  const rows = windowRows.filter((r) => r.exercise_key === exerciseKey);
  const newest = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!newest) return null;
  // bestResult reads only exercise_key and result_value.
  const best = exercise ? (bestResult(rows as unknown as ScoredResult[], exercise) as unknown as T | null) : null;
  if (best?.self_reported && best.result_value != null) return { text: best.result_text, value: best.result_value };
  return { text: newest.result_text, value: null };
}

// Returns what to confirm, or null when the row has no button: another coach's member (a gym or coach view), an exercise this version of
// the app doesn't know, or a score with no number (only the number is re-scored, never the text).
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

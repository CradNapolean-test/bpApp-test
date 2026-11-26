// One goal per member (CL10): the goal on Details, with the start and goal weights. The Notes tab's "Client Goals" card is gone, and its
// entries (client_journal_entries, kind 'goal') move into that goal. Migration 0178 does the move once, for everyone, and marks each entry
// it moved (moved_to_goal_at), keeping the rows. This file is the same rule for the app, so it can show on Details any entry not moved
// yet (0178 not applied, or a goal that would pass the 5,000-character limit) and let the coach add it with one tap. Twin of the SQL in
// 0178: keep the two the same.

export const GOAL_MAX = 5000; // client_profiles.goal_description's own limit (migration 0111)
export const GOAL_SEPARATOR = '\n\n';

interface GoalEntry {
  kind: string;
  body: string;
  created_at: string;
  id: string;
  moved_to_goal_at?: string | null;
}

// The Notes goals still to move: not marked as moved, with words in them, and not already in the goal word for word.
export function goalsStillInNotes<T extends GoalEntry>(entries: T[], goal: string | null | undefined): T[] {
  const current = goal ?? '';
  return entries
    .filter((e) => e.kind === 'goal' && !e.moved_to_goal_at && e.body.trim() !== '' && !current.includes(e.body.trim()))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

// The goal with those entries added: after a blank line when there is a goal already, oldest first, each one whole. Nothing is dropped:
// the result is the old goal (less any spaces at its end) followed by every new piece.
export function mergeGoalText(goal: string | null | undefined, bodies: string[]): string {
  const added = bodies.map((b) => b.trim()).filter((b) => b !== '');
  const old = (goal ?? '').replace(/\s+$/, '');
  if (added.length === 0) return goal ?? '';
  if (old.trim() === '') return added.join(GOAL_SEPARATOR);
  return [old, ...added].join(GOAL_SEPARATOR);
}

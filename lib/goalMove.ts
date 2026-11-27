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

// The goal's paragraphs (split at blank lines, trimmed): an entry is already in the goal when its words are one of them. A word inside a
// longer paragraph doesn't count ("5kg" is not in "Lose 15kg").
export function goalParagraphs(goal: string | null | undefined): Set<string> {
  return new Set((goal ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== ''));
}

// The Notes goals still to move: not marked as moved, with words in them, not already a paragraph of the goal, and only the first of any
// entries with the same words.
export function goalsStillInNotes<T extends GoalEntry>(entries: T[], goal: string | null | undefined): T[] {
  const there = goalParagraphs(goal);
  const seen = new Set<string>();
  return entries
    .filter((e) => e.kind === 'goal' && !e.moved_to_goal_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .filter((e) => {
      const words = e.body.trim();
      if (words === '' || there.has(words) || seen.has(words)) return false;
      seen.add(words);
      return true;
    });
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

import { describe, expect, it } from 'vitest';
import { GOAL_MAX, goalsStillInNotes, mergeGoalText } from './goalMove';

const entry = (id: string, body: string, created_at: string, extra: { kind?: string; moved_to_goal_at?: string | null } = {}) => ({
  id,
  body,
  created_at,
  kind: extra.kind ?? 'goal',
  moved_to_goal_at: extra.moved_to_goal_at,
});

describe('one goal (CL10)', () => {
  it('fills an empty goal with the Notes goals, oldest first', () => {
    expect(mergeGoalText(null, ['Run a 5k', 'Lose 5kg by December'])).toBe('Run a 5k\n\nLose 5kg by December');
    expect(mergeGoalText('   ', ['Run a 5k'])).toBe('Run a 5k');
  });

  it('appends to a goal already on Details, never losing a word of either', () => {
    const goal = 'Get fit for the wedding in June.\nNo running: bad knee.';
    const merged = mergeGoalText(goal + '\n\n', ['  Run a 5k  ']);
    expect(merged).toBe('Get fit for the wedding in June.\nNo running: bad knee.\n\nRun a 5k');
    expect(merged.startsWith(goal)).toBe(true);
    // Nothing to add leaves the goal exactly as it was.
    expect(mergeGoalText(goal, [])).toBe(goal);
    expect(mergeGoalText(goal, ['   '])).toBe(goal);
    expect(mergeGoalText(null, [])).toBe('');
  });

  it('lists only goals still to move: not marked moved, not empty, not already in the goal, not notes or injuries', () => {
    const entries = [
      entry('b', 'Lose 5kg by December', '2026-10-02T10:00:00Z'),
      entry('a', 'Run a 5k', '2026-10-01T10:00:00Z'),
      entry('m', 'Moved by 0178', '2026-09-01T10:00:00Z', { moved_to_goal_at: '2026-11-27T09:00:00Z' }),
      entry('e', '   ', '2026-09-02T10:00:00Z'),
      entry('n', 'Prefers mornings', '2026-09-03T10:00:00Z', { kind: 'note' }),
      entry('i', 'Bad knee', '2026-09-04T10:00:00Z', { kind: 'injury' }),
    ];
    expect(goalsStillInNotes(entries, 'Wants to get fit\n\n  Run a 5k  ').map((e) => e.id)).toEqual(['b']);
    expect(goalsStillInNotes(entries, null).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('counts only a whole paragraph as already there, and adds entries with the same words once (review finding 3)', () => {
    // "5kg" inside "Lose 15kg" is not the entry "5kg".
    expect(goalsStillInNotes([entry('a', '5kg', '2026-10-01T10:00:00Z')], 'Lose 15kg').map((e) => e.id)).toEqual(['a']);
    const twins = [entry('a', 'Run a 5k', '2026-10-01T10:00:00Z'), entry('b', ' Run a 5k\n', '2026-10-02T10:00:00Z')];
    expect(goalsStillInNotes(twins, null).map((e) => e.id)).toEqual(['a']);
  });

  it('never moves the same text twice: once added, nothing is left to move', () => {
    const entries = [entry('a', 'Run a 5k', '2026-10-01T10:00:00Z'), entry('b', 'Lose 5kg', '2026-10-02T10:00:00Z')];
    const goal = 'Feel stronger';
    const once = mergeGoalText(goal, goalsStillInNotes(entries, goal).map((e) => e.body));
    expect(goalsStillInNotes(entries, once)).toEqual([]);
    const twice = mergeGoalText(once, goalsStillInNotes(entries, once).map((e) => e.body));
    expect(twice).toBe(once);
  });

  it('keeps to the 5,000-character limit check outside: a goal that would pass it is left for the coach', () => {
    const long = 'x'.repeat(GOAL_MAX - 5);
    expect(mergeGoalText(long, ['Run a 5k']).length).toBeGreaterThan(GOAL_MAX);
  });
});

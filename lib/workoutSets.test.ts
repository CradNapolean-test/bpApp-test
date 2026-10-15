import { describe, expect, it } from 'vitest';
import { finishMessage, isEmptySet, nextSetNumber, reconcileLocalChoices, workoutSummary, applySetChange, sortedSets } from './workoutSets';

describe('nextSetNumber (L4)', () => {
  it('is 1 for an exercise with nothing logged', () => {
    expect(nextSetNumber([])).toBe(1);
  });

  it('follows the last set in order', () => {
    expect(nextSetNumber([{ set_number: 1 }, { set_number: 2 }])).toBe(3);
  });

  it('does not hand out a number twice after a middle set was deleted', () => {
    // Sets 1 and 3 are left. "Logged count + 1" said 3 again.
    expect(nextSetNumber([{ set_number: 1 }, { set_number: 3 }])).toBe(4);
  });

  it('copes with sets that have no number, counting them by position', () => {
    expect(nextSetNumber([{ set_number: null }, { set_number: null }])).toBe(3);
  });
});

describe('isEmptySet', () => {
  it('refuses a set with nothing in it', () => {
    expect(isEmptySet({ reps: '', load: '', rpe: '' })).toBe(true);
    expect(isEmptySet({ reps: null, load: null, rpe: null })).toBe(true);
  });
  it('accepts a set with anything in it, including a zero load (bodyweight)', () => {
    expect(isEmptySet({ reps: 8, load: '', rpe: '' })).toBe(false);
    expect(isEmptySet({ reps: '', load: 0, rpe: '' })).toBe(false);
    expect(isEmptySet({ reps: '', load: '', rpe: 8 })).toBe(false);
  });
});

describe('finishing a workout', () => {
  it('counts the sets and the exercises they were for', () => {
    expect(workoutSummary([3, 0, 4, 1])).toEqual({ sets: 8, exercises: 3, empty: false });
    expect(finishMessage(workoutSummary([3, 0, 4, 1]))).toBe('Workout complete: 8 sets across 3 exercises. Nice work.');
    expect(finishMessage(workoutSummary([1]))).toBe('Workout complete: 1 set across 1 exercise. Nice work.');
  });

  it('does not congratulate a workout with nothing logged', () => {
    const empty = workoutSummary([0, 0]);
    expect(empty.empty).toBe(true);
    expect(finishMessage(empty)).toBe('Workout closed. Nothing was logged.');
  });
});

describe('reconcileLocalChoices (L4)', () => {
  const none = { slot1: null, slot2: null };
  const strong = { slot1: 'strong:1', slot2: null };
  const both = { slot1: 'strong:1', slot2: 'conditioning:0' };

  it('keeps a tap whose save has not landed yet: the server still has what it had', () => {
    const kept = reconcileLocalChoices({ d1: { choice: strong, base: none } }, new Map());
    expect(kept.get('d1')).toEqual(strong);
  });

  it('lets the server win once it has moved, so the save landing is not undone and another device\'s change shows', () => {
    // The save landed: the server now equals the choice.
    expect(reconcileLocalChoices({ d1: { choice: strong, base: none } }, new Map([['d1', strong]])).has('d1')).toBe(false);
    // Another device changed it to something else.
    expect(reconcileLocalChoices({ d1: { choice: strong, base: none } }, new Map([['d1', both]])).has('d1')).toBe(false);
  });

  it('judges each workout on its own', () => {
    const kept = reconcileLocalChoices(
      { d1: { choice: strong, base: none }, d2: { choice: strong, base: none } },
      new Map([['d2', both]])
    );
    expect([...kept.keys()]).toEqual(['d1']);
  });
});

describe('keeping the screen in step with saves (R13)', () => {
  const row = (id: string, set_number: number | null, logged_at: string, reps = 5) => ({ id, set_number, logged_at, actual_reps: reps, actual_load: 60 });

  it('shows a set that was just saved without reloading the page', () => {
    const logs = [row('a', 1, '2026-10-15T09:00:00Z')];
    expect(applySetChange(logs, { kind: 'added', row: row('b', 2, '2026-10-15T09:05:00Z') }).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('does not show a set twice if the page brings it too', () => {
    const logs = [row('a', 1, '2026-10-15T09:00:00Z')];
    expect(applySetChange(logs, { kind: 'added', row: row('a', 1, '2026-10-15T09:00:00Z') })).toHaveLength(1);
  });

  it('applies a correction to the one set and leaves the rest', () => {
    const logs = [row('a', 1, '2026-10-15T09:00:00Z'), row('b', 2, '2026-10-15T09:05:00Z')];
    const next = applySetChange(logs, { kind: 'updated', id: 'b', fields: { actual_reps: 8 } });
    expect(next.find((l) => l.id === 'b')?.actual_reps).toBe(8);
    expect(next.find((l) => l.id === 'a')?.actual_reps).toBe(5);
  });

  it('removes a deleted set', () => {
    const logs = [row('a', 1, '2026-10-15T09:00:00Z'), row('b', 2, '2026-10-15T09:05:00Z')];
    expect(applySetChange(logs, { kind: 'deleted', id: 'a' }).map((l) => l.id)).toEqual(['b']);
  });

  it('puts the sets of one exercise in the order they were done, even though the page sends them newest first', () => {
    const newestFirst = [row('c', 3, '2026-10-15T09:10:00Z'), row('b', 2, '2026-10-15T09:05:00Z'), row('a', 1, '2026-10-15T09:00:00Z')];
    expect(sortedSets(newestFirst).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the time when set numbers are missing or equal', () => {
    const logs = [row('late', null, '2026-10-15T09:10:00Z'), row('early', null, '2026-10-15T09:00:00Z')];
    expect(sortedSets(logs).map((l) => l.id)).toEqual(['early', 'late']);
  });
});

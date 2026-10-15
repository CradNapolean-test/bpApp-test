import { describe, expect, it } from 'vitest';
import { finishMessage, isEmptySet, nextSetNumber, reconcileLocalChoices, workoutSummary } from './workoutSets';

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

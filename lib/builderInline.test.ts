import { describe, expect, it } from 'vitest';
import { INLINE_BOX, PRESCRIPTION_ERRORS, inlineDetails, inlineTarget, inlineText, readInlineBox, readSetsText, readTargetText } from './builderInline';
import { TRACKING_TYPES } from './workoutTracking';

const base = {
  tracking_type: 'weight_reps',
  sets: 3,
  reps: '8-10',
  load: null,
  prescription_type: 'absolute',
  percent_1rm: null,
  target_seconds: null,
  target_distance: null,
  target_calories: null,
  rpe: null,
  rest_seconds: null,
} as const;
const ex = (over: Partial<Record<keyof typeof base, unknown>> = {}) => ({ ...base, ...over }) as never;

describe('inlineTarget', () => {
  it('shows reps where reps are recorded, else the distance, the calories or the time', () => {
    expect(inlineTarget('weight_reps')).toBe('reps');
    expect(inlineTarget('reps')).toBe('reps');
    expect(inlineTarget('distance')).toBe('distance');
    expect(inlineTarget('weight_distance')).toBe('distance');
    expect(inlineTarget('calories')).toBe('calories');
    expect(inlineTarget('time')).toBe('time');
    expect(inlineTarget('weight_time')).toBe('time');
  });
  it('sets the distance of a distance-and-time exercise (the time is what is recorded)', () => {
    expect(inlineTarget('distance_time')).toBe('distance');
  });
  it('has no target box for tick when done', () => {
    expect(inlineTarget('tick')).toBeNull();
  });
  it('gives every type a box with a label', () => {
    for (const t of TRACKING_TYPES) {
      const box = inlineTarget(t);
      if (box) expect(INLINE_BOX[box].label).toBeTruthy();
    }
  });
});

describe('inlineText', () => {
  it('shows what is saved, blank when nothing is', () => {
    expect(inlineText(ex(), 'sets')).toBe('3');
    expect(inlineText(ex(), 'reps')).toBe('8-10');
    expect(inlineText(ex({ sets: null, reps: null }), 'sets')).toBe('');
    expect(inlineText(ex({ sets: null, reps: null }), 'reps')).toBe('');
    expect(inlineText(ex({ target_seconds: 90 }), 'time')).toBe('1:30');
    expect(inlineText(ex({ target_seconds: 45 }), 'time')).toBe('45');
    expect(inlineText(ex({ target_distance: 400 }), 'distance')).toBe('400');
    expect(inlineText(ex({ target_calories: 15 }), 'calories')).toBe('15');
  });
});

describe('readSetsText', () => {
  it('clears on blank and takes a whole number above zero', () => {
    expect(readSetsText('  ')).toEqual({ ok: true, value: null });
    expect(readSetsText(' 4 ')).toEqual({ ok: true, value: 4 });
  });
  it('refuses anything else with the sheet’s message', () => {
    for (const bad of ['0', '-2', '2.5', 'three']) expect(readSetsText(bad)).toEqual({ ok: false, error: PRESCRIPTION_ERRORS.sets });
  });
});

describe('readTargetText', () => {
  it('reads times, distances and calories as the sheet does', () => {
    expect(readTargetText('time', '1:30')).toEqual({ ok: true, value: 90 });
    expect(readTargetText('time', '45')).toEqual({ ok: true, value: 45 });
    expect(readTargetText('distance', '5 km')).toEqual({ ok: true, value: 5000 });
    expect(readTargetText('distance', '400')).toEqual({ ok: true, value: 400 });
    expect(readTargetText('calories', '12,5')).toEqual({ ok: true, value: 12.5 });
    expect(readTargetText('calories', '')).toEqual({ ok: true, value: null });
  });
  it('refuses what cannot be saved', () => {
    expect(readTargetText('time', 'soon')).toEqual({ ok: false, error: PRESCRIPTION_ERRORS.time });
    expect(readTargetText('distance', '0')).toEqual({ ok: false, error: PRESCRIPTION_ERRORS.distance });
    expect(readTargetText('calories', '-3')).toEqual({ ok: false, error: PRESCRIPTION_ERRORS.calories });
  });
});

describe('readInlineBox', () => {
  it('saves only the field the box shows', () => {
    expect(readInlineBox(ex(), 'sets', '4')).toEqual({ kind: 'save', fields: { sets: 4 } });
    expect(readInlineBox(ex(), 'reps', ' 12 ')).toEqual({ kind: 'save', fields: { reps: '12' } });
    expect(readInlineBox(ex({ tracking_type: 'time' }), 'time', '1:00')).toEqual({ kind: 'save', fields: { target_seconds: 60 } });
    expect(readInlineBox(ex({ tracking_type: 'distance' }), 'distance', '1km')).toEqual({ kind: 'save', fields: { target_distance: 1000 } });
    expect(readInlineBox(ex({ tracking_type: 'calories' }), 'calories', '20')).toEqual({ kind: 'save', fields: { target_calories: 20 } });
  });
  it('clears a field when the box is emptied', () => {
    expect(readInlineBox(ex(), 'sets', '')).toEqual({ kind: 'save', fields: { sets: null } });
    expect(readInlineBox(ex(), 'reps', '  ')).toEqual({ kind: 'save', fields: { reps: null } });
    expect(readInlineBox(ex({ target_seconds: 30 }), 'time', '')).toEqual({ kind: 'save', fields: { target_seconds: null } });
  });
  it('does nothing when the box still says what is saved', () => {
    expect(readInlineBox(ex(), 'sets', '3')).toEqual({ kind: 'none' });
    expect(readInlineBox(ex(), 'reps', '8-10 ')).toEqual({ kind: 'none' });
    expect(readInlineBox(ex({ target_seconds: 90 }), 'time', '90')).toEqual({ kind: 'none' });
    expect(readInlineBox(ex({ sets: null }), 'sets', '')).toEqual({ kind: 'none' });
    expect(readInlineBox(ex({ reps: null }), 'reps', '')).toEqual({ kind: 'none' });
  });
  it('says why a box cannot be saved', () => {
    expect(readInlineBox(ex(), 'sets', '1.5')).toEqual({ kind: 'error', error: PRESCRIPTION_ERRORS.sets });
    expect(readInlineBox(ex(), 'time', 'abc')).toEqual({ kind: 'error', error: PRESCRIPTION_ERRORS.time });
  });
});

describe('inlineDetails', () => {
  it('lists what the boxes do not show', () => {
    expect(inlineDetails(ex({ load: 20, rpe: 8, rest_seconds: 60 }))).toEqual(['20kg', 'RPE 8', 'rest 60s']);
    expect(inlineDetails(ex({ prescription_type: 'percent_1rm', percent_1rm: 70 }))).toEqual(['70% 1RM']);
  });
  it('shows a distance-and-time exercise’s target time, which has no box', () => {
    expect(inlineDetails(ex({ tracking_type: 'distance_time', target_seconds: 120, target_distance: 500 }))).toEqual(['2:00']);
  });
  it('leaves out a weight the exercise does not record, and a time that has its own box', () => {
    expect(inlineDetails(ex({ tracking_type: 'reps', load: 20 }))).toEqual([]);
    expect(inlineDetails(ex({ tracking_type: 'time', target_seconds: 45 }))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BLANK_INPUTS,
  TRACKING_TYPES,
  blankSetMessage,
  durationInput,
  formatDistance,
  formatDuration,
  inputsFromLog,
  isBlankSet,
  parseDistance,
  parseDuration,
  prescriptionParts,
  readSetInputs,
  setSummary,
  trackingOf,
} from './workoutTracking';

const log = { actual_reps: null, actual_load: null, actual_seconds: null, actual_distance: null, actual_calories: null };

describe('trackingOf', () => {
  it('treats anything unknown (older rows) as weight and reps', () => {
    expect(trackingOf(undefined)).toBe('weight_reps');
    expect(trackingOf(null)).toBe('weight_reps');
    expect(trackingOf('nonsense')).toBe('weight_reps');
    expect(trackingOf('time')).toBe('time');
  });
  it('knows every type', () => {
    for (const t of TRACKING_TYPES) expect(trackingOf(t)).toBe(t);
  });
});

describe('parseDuration', () => {
  it('reads seconds, minutes and seconds, and hours', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('2m30')).toBe(150);
    expect(parseDuration('2m')).toBe(120);
    expect(parseDuration('12,5')).toBe(12.5);
  });
  it('rejects what is not a time', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('-5')).toBeNull();
  });
});

describe('parseDistance', () => {
  it('reads metres and kilometres', () => {
    expect(parseDistance('400')).toBe(400);
    expect(parseDistance('400 m')).toBe(400);
    expect(parseDistance('5km')).toBe(5000);
    expect(parseDistance('1.5 km')).toBe(1500);
  });
  it('rejects what is not a distance', () => {
    expect(parseDistance('')).toBeNull();
    expect(parseDistance('far')).toBeNull();
  });
});

describe('formatting', () => {
  it('shows times as seconds under a minute, else minutes and seconds', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(605)).toBe('10:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(durationInput(45)).toBe('45');
    expect(durationInput(90)).toBe('1:30');
    expect(durationInput(null)).toBe('');
  });
  it('shows distance in metres, or kilometres from 1,000', () => {
    expect(formatDistance(400)).toBe('400 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
});

describe('readSetInputs', () => {
  it('reads weight and reps', () => {
    const r = readSetInputs('weight_reps', { ...BLANK_INPUTS, reps: '8', load: '60', rpe: '8' });
    expect(r).toEqual({ ok: true, values: { reps: 8, load: 60, seconds: null, distance: null, calories: null, rpe: 8 } });
  });
  it('reads the measures the type records and ignores the others', () => {
    const r = readSetInputs('distance_time', { ...BLANK_INPUTS, reps: '99', distance: '400', time: '1:45' });
    expect(r).toEqual({ ok: true, values: { reps: null, load: null, seconds: 105, distance: 400, calories: null, rpe: null } });
  });
  it('says what is wrong with a box', () => {
    expect(readSetInputs('time', { ...BLANK_INPUTS, time: 'soon' })).toMatchObject({ ok: false });
    expect(readSetInputs('weight_reps', { ...BLANK_INPUTS, reps: 'x' })).toMatchObject({ ok: false });
    expect(readSetInputs('calories', { ...BLANK_INPUTS, calories: '-3' })).toMatchObject({ ok: false });
  });
  it('rounds reps to a whole number', () => {
    const r = readSetInputs('reps', { ...BLANK_INPUTS, reps: '7.6' });
    expect(r.ok && r.values.reps).toBe(8);
  });
});

describe('isBlankSet', () => {
  const none = { reps: null, load: null, seconds: null, distance: null, calories: null, rpe: null };
  it('is blank when nothing the type records is filled in', () => {
    expect(isBlankSet('weight_reps', none)).toBe(true);
    expect(isBlankSet('time', { ...none, reps: 5 })).toBe(true);
    expect(isBlankSet('time', { ...none, seconds: 30 })).toBe(false);
    expect(isBlankSet('time', { ...none, rpe: 7 })).toBe(false);
  });
  it('never treats a tick exercise as blank', () => {
    expect(isBlankSet('tick', none)).toBe(false);
  });
  it('asks for the right things', () => {
    expect(blankSetMessage('weight_reps')).toBe('Enter the reps and weight (or your RPE) before logging the set.');
    expect(blankSetMessage('distance_time')).toBe('Enter the distance and time (or your RPE) before logging the set.');
  });
});

describe('setSummary', () => {
  it('keeps the reps × weight look', () => {
    expect(setSummary('weight_reps', { ...log, actual_reps: 8, actual_load: 60 })).toBe('8 × 60');
    expect(setSummary('weight_reps', { ...log, actual_reps: 8, actual_load: 60 }, true)).toBe('8×60');
    expect(setSummary('weight_reps', log)).toBe('— × —');
  });
  it('lists what the other types recorded', () => {
    expect(setSummary('time', { ...log, actual_seconds: 45 })).toBe('45s');
    expect(setSummary('distance_time', { ...log, actual_distance: 400, actual_seconds: 105 })).toBe('400 m · 1:45');
    expect(setSummary('weight_distance', { ...log, actual_load: 40, actual_distance: 30 })).toBe('40kg · 30 m');
    expect(setSummary('calories', { ...log, actual_calories: 20 })).toBe('20 cal');
    expect(setSummary('reps', { ...log, actual_reps: 12 })).toBe('12 reps');
    expect(setSummary('reps', { ...log, actual_reps: 12 }, true)).toBe('12');
    expect(setSummary('tick', log)).toBe('✓');
  });
});

describe('inputsFromLog', () => {
  it('carries only the measures the type records', () => {
    const l = { ...log, actual_reps: 8, actual_load: 60, actual_seconds: 90 };
    expect(inputsFromLog('weight_reps', l)).toEqual({ ...BLANK_INPUTS, reps: '8', load: '60' });
    expect(inputsFromLog('time', l)).toEqual({ ...BLANK_INPUTS, time: '1:30' });
    expect(inputsFromLog('time', null)).toEqual(BLANK_INPUTS);
  });
});

describe('prescriptionParts', () => {
  const base = { sets: 3, reps: '8-10', load: 20, prescription_type: 'absolute', percent_1rm: null };
  it('reads as before for weight and reps', () => {
    expect(prescriptionParts(base)).toEqual(['3 × 8-10', '20kg']);
    expect(prescriptionParts({ ...base, prescription_type: 'percent_1rm', percent_1rm: 75 })).toEqual(['3 × 8-10', '75% 1RM']);
    expect(prescriptionParts({ ...base, sets: null, reps: null, load: null })).toEqual([]);
    expect(prescriptionParts({ ...base, reps: null })).toEqual(['3 sets', '20kg']);
  });
  it('shows the target for the other types, and no weight when the type has none', () => {
    expect(prescriptionParts({ ...base, tracking_type: 'time', target_seconds: 45 })).toEqual(['3 × 45s']);
    expect(prescriptionParts({ ...base, tracking_type: 'reps' })).toEqual(['3 × 8-10']);
    expect(prescriptionParts({ ...base, tracking_type: 'distance', target_distance: 400 })).toEqual(['3 × 400 m']);
    expect(prescriptionParts({ ...base, tracking_type: 'weight_distance', target_distance: 30 })).toEqual(['3 × 30 m', '20kg']);
    expect(prescriptionParts({ ...base, tracking_type: 'calories', target_calories: 15 })).toEqual(['3 × 15 cal']);
    expect(prescriptionParts({ ...base, tracking_type: 'tick' })).toEqual(['3 sets']);
  });
});

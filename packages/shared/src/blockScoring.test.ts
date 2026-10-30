import { describe, expect, it } from 'vitest';
import {
  BLANK_RESULT_INPUTS,
  NO_CONFIG,
  blockConfigOf,
  configForStorage,
  configSummary,
  defaultConfigFor,
  inputsFromResult,
  isBlankResult,
  readResultInputs,
  resultFields,
  resultForConfig,
  resultLabel,
  resultSummary,
  sanitiseConfig,
} from './blockScoring';

describe('defaultConfigFor', () => {
  it('fills in the well-known formats', () => {
    expect(defaultConfigFor('AMRAP')).toEqual({ scoring: 'rounds_reps' });
    expect(defaultConfigFor('EMOM')).toEqual({ scoring: 'done' });
    expect(defaultConfigFor('Tabata')).toEqual({ scoring: 'rounds', work_seconds: 20, rest_seconds: 10, rounds: 8 });
    expect(defaultConfigFor('Big Chipper')).toEqual({ scoring: 'time' });
  });
  it('starts the rest with no result, and hands back a copy', () => {
    expect(defaultConfigFor('Horse Power')).toEqual(NO_CONFIG);
    expect(defaultConfigFor(null)).toEqual(NO_CONFIG);
    defaultConfigFor('AMRAP').rounds = 5;
    expect(defaultConfigFor('AMRAP')).toEqual({ scoring: 'rounds_reps' });
  });
});

describe('sanitiseConfig', () => {
  it('keeps good values and drops the rest', () => {
    expect(sanitiseConfig({ scoring: 'rounds_reps', cap_seconds: 600, rounds: 5.4, work_seconds: -1, rest_seconds: 'x' })).toEqual({
      scoring: 'rounds_reps',
      cap_seconds: 600,
      rounds: 5,
    });
    expect(sanitiseConfig({ scoring: 'score', unit: ' cal ' })).toEqual({ scoring: 'score', unit: 'cal' });
  });
  it('falls back to no result for anything unknown', () => {
    expect(sanitiseConfig(null)).toEqual(NO_CONFIG);
    expect(sanitiseConfig('AMRAP')).toEqual(NO_CONFIG);
    expect(sanitiseConfig({ scoring: 'bogus' })).toEqual(NO_CONFIG);
  });
});

describe('configForStorage / blockConfigOf', () => {
  it('stores nothing for a plain block', () => {
    expect(configForStorage(NO_CONFIG)).toBeNull();
    expect(configForStorage({ scoring: 'none', cap_seconds: 600 })).toEqual({ scoring: 'none', cap_seconds: 600 });
    expect(configForStorage({ scoring: 'time' })).toEqual({ scoring: 'time' });
  });
  it('takes the first row that has one', () => {
    expect(blockConfigOf([{ block_config: null }, { block_config: { scoring: 'time' } }])).toEqual({ scoring: 'time' });
    expect(blockConfigOf([{}])).toEqual(NO_CONFIG);
    expect(blockConfigOf(undefined)).toEqual(NO_CONFIG);
  });
});

describe('configSummary', () => {
  it('lists what the coach set', () => {
    expect(configSummary({ scoring: 'rounds_reps', cap_seconds: 600 })).toBe('10 min cap');
    expect(configSummary({ scoring: 'done', cap_seconds: 600 })).toBe('10 min');
    expect(configSummary({ scoring: 'rounds', work_seconds: 20, rest_seconds: 10, rounds: 8 })).toBe('8 rounds · 20s on / 10s off');
    expect(configSummary({ scoring: 'rounds', rounds: 1 })).toBe('1 round');
    expect(configSummary({ scoring: 'time', cap_seconds: 905 })).toBe('15:05 cap');
    expect(configSummary(NO_CONFIG)).toBe('');
  });
});

describe('results', () => {
  it('knows which boxes each scoring needs', () => {
    expect(resultFields('rounds_reps')).toEqual(['rounds', 'reps']);
    expect(resultFields('none')).toEqual([]);
    expect(resultLabel('score', { scoring: 'score', unit: 'cal' })).toBe('Score (cal)');
    expect(resultLabel('score', { scoring: 'score' })).toBe('Score');
  });
  it('reads rounds and reps, time, a score and a tick', () => {
    expect(readResultInputs('rounds_reps', { ...BLANK_RESULT_INPUTS, rounds: '5', reps: '3' })).toEqual({
      ok: true,
      values: { rounds: 5, reps: 3, seconds: null, score: null, done: null },
    });
    expect(readResultInputs('time', { ...BLANK_RESULT_INPUTS, time: '12:30' })).toMatchObject({ ok: true, values: { seconds: 750 } });
    expect(readResultInputs('score', { ...BLANK_RESULT_INPUTS, score: '120,5' })).toMatchObject({ ok: true, values: { score: 120.5 } });
    expect(readResultInputs('done', { ...BLANK_RESULT_INPUTS, done: true })).toMatchObject({ ok: true, values: { done: true } });
  });
  it('says what is wrong', () => {
    expect(readResultInputs('time', { ...BLANK_RESULT_INPUTS, time: 'soon' })).toMatchObject({ ok: false });
    expect(readResultInputs('rounds', { ...BLANK_RESULT_INPUTS, rounds: '-2' })).toMatchObject({ ok: false });
  });
  it('is blank until it says something', () => {
    const none = { rounds: null, reps: null, seconds: null, score: null, done: null };
    expect(isBlankResult('rounds_reps', { ...none, reps: 4 })).toBe(true);
    expect(isBlankResult('rounds_reps', { ...none, rounds: 0 })).toBe(false);
    expect(isBlankResult('done', { ...none, done: false })).toBe(true);
    expect(isBlankResult('done', { ...none, done: true })).toBe(false);
    expect(isBlankResult('none', none)).toBe(true);
  });
  it('writes a result on one line', () => {
    const none = { rounds: null, reps: null, seconds: null, score: null, done: null };
    expect(resultSummary({ scoring: 'rounds_reps' }, { ...none, rounds: 5, reps: 3 })).toBe('5 rounds + 3 reps');
    expect(resultSummary({ scoring: 'rounds_reps' }, { ...none, rounds: 1, reps: 1 })).toBe('1 round + 1 rep');
    expect(resultSummary({ scoring: 'rounds_reps' }, { ...none, rounds: 6, reps: 0 })).toBe('6 rounds');
    expect(resultSummary({ scoring: 'time' }, { ...none, seconds: 750 })).toBe('12:30');
    expect(resultSummary({ scoring: 'score', unit: 'cal' }, { ...none, score: 120 })).toBe('120 cal');
    expect(resultSummary({ scoring: 'done' }, { ...none, done: true })).toBe('Done');
  });
  it('turns a saved result back into box text', () => {
    expect(inputsFromResult({ rounds: 5, reps: 3, seconds: 750, score: null, done: null })).toEqual({ rounds: '5', reps: '3', time: '12:30', score: '', done: false });
    expect(inputsFromResult(null)).toEqual(BLANK_RESULT_INPUTS);
  });
});

describe('resultForConfig', () => {
  const rounds = { scoring: 'rounds' as const, rounds: 8 };
  it("keeps a result that was saved under the block's current scoring", () => {
    expect(resultForConfig({ scoring: 'rounds' }, rounds)).toBe(rounds);
  });
  it('ignores a result saved under another scoring, or no result at all', () => {
    expect(resultForConfig({ scoring: 'time' }, rounds)).toBeUndefined();
    expect(resultForConfig({ scoring: 'time' }, undefined)).toBeUndefined();
  });
});

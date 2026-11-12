import { describe, expect, it } from 'vitest';
import { describeHistorySets, describePastResult, pastResultsFor, type HistorySet, type PastBlockResult } from './runClassHistory';

const set = (type: HistorySet['type'], v: Partial<Omit<HistorySet, 'type'>> = {}): HistorySet => ({
  type,
  reps: null,
  load: null,
  seconds: null,
  distance: null,
  calories: null,
  ...v,
});

describe('describeHistorySets (CS18)', () => {
  it('keeps the weight x reps line, joining sets at the same load', () => {
    expect(describeHistorySets([set('weight_reps', { load: 60, reps: 8 }), set('weight_reps', { load: 60, reps: 8 }), set('weight_reps', { load: 65, reps: 6 })])).toBe(
      '60kg × 8, 8 · 65kg × 6'
    );
  });

  it('never prints "? reps" for an exercise tracked another way', () => {
    expect(describeHistorySets([set('time', { seconds: 90 }), set('time', { seconds: 85 })])).toBe('1:30, 1:25');
    expect(describeHistorySets([set('distance_time', { distance: 500, seconds: 112 })])).toBe('500 m · 1:52');
    expect(describeHistorySets([set('calories', { calories: 15 })])).toMatch(/15/);
    expect(describeHistorySets([set('reps', { reps: 10 }), set('reps', { reps: 8 })])).toBe('10, 8 reps');
    expect(describeHistorySets([set('tick'), set('tick'), set('tick')])).toBe('Done × 3');
  });

  it('leaves out sets with nothing recorded, and says null when none is left', () => {
    expect(describeHistorySets([set('time'), set('time', { seconds: 30 })])).toBe('30s');
    expect(describeHistorySets([set('distance')])).toBeNull();
    expect(describeHistorySets([])).toBeNull();
  });
});

describe('block results (CS18)', () => {
  const r = (v: Partial<PastBlockResult>): PastBlockResult => ({
    blockKey: 'conditioning:1',
    format: 'AMRAP',
    scoring: 'rounds_reps',
    rounds: 5,
    reps: 3,
    seconds: null,
    score: null,
    done: null,
    date: '2026-11-03',
    ...v,
  });

  it('matches the same block in the same format, newest first', () => {
    const results = [r({ date: '2026-11-10' }), r({ format: 'EMOM', date: '2026-11-09' }), r({ blockKey: 'conditioning:2', date: '2026-11-08' }), r({ date: '2026-11-03' }), r({ date: '2026-10-27' })];
    expect(pastResultsFor(results, 'conditioning:1', 'amrap ').map((x) => x.date)).toEqual(['2026-11-10', '2026-11-03']);
  });

  it('reads a result with the day block settings when scored the same way', () => {
    expect(describePastResult(r({}), { scoring: 'rounds_reps' })).toBe('5 rounds + 3 reps');
    expect(describePastResult(r({ scoring: 'time', seconds: 760, rounds: null, reps: null }), { scoring: 'time', cap_seconds: 900 })).toBe('12:40');
    expect(describePastResult(r({ scoring: 'score', score: 42, rounds: null }), { scoring: 'rounds' })).toBe('42');
  });
});

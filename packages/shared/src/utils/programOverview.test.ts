import { describe, expect, it } from 'vitest';
import { dayProgress, daysForWeek, summariseDays, weekNumbers, type OverviewDay, type OverviewExercise } from './programOverview';

const day = (id: string, week: number, label: string, pos: number | null = null): OverviewDay => ({ id, week_num: week, day_label: label, phase_label: null, day_position: pos });
const lift = (id: string, name: string, order: number, over: Partial<OverviewExercise> = {}): OverviewExercise => ({
  id, name, sort_order: order, section: 'lift', block_no: null, block_part: null, block_format: null, block_type: 'exercise', ...over,
});

describe('summariseDays', () => {
  const days = [day('d1', 12, 'Upper A', 1), day('d2', 12, 'Lower A', 2), day('d3', 11, 'Upper A', 1)];
  const byDay = new Map<string, OverviewExercise[]>([
    ['d1', [lift('e3', 'Row', 3), lift('e1', 'Bench', 1), lift('e2', 'Press', 2), lift('e4', 'Triceps', 4)]],
    ['d2', [lift('e5', 'Squat', 1)]],
  ]);

  it('counts exercises, lifts and logged lifts, and names the first two lifts by order', () => {
    const [d1] = summariseDays(days, byDay, new Set(['e1', 'e3']), () => [], 1, 12);
    expect(d1).toMatchObject({ exerciseCount: 4, liftCount: 4, loggedCount: 2, highlights: ['Bench', 'Press'], done: true });
  });

  it('flags only the matching weekday of the current week as today', () => {
    const out = summariseDays(days, byDay, new Set(), () => [], 1, 12);
    expect(out.map((d) => d.isToday)).toEqual([true, false, false]);
  });

  it('a day with no logged sets is not done, and a day with no exercises loaded is empty', () => {
    const [, d2, d3] = summariseDays(days, byDay, new Set(), () => [], 1, 12);
    expect(d2).toMatchObject({ done: false, loggedCount: 0 });
    expect(d3).toMatchObject({ exerciseCount: 0, liftCount: 0 });
  });

  it('only counts the Strong / Conditioning blocks the member chose', () => {
    const sectioned = new Map<string, OverviewExercise[]>([
      ['d1', [
        lift('w', 'Warm-up flow', 0, { section: 'warmup' }),
        lift('l', 'Squat', 1),
        lift('s', 'Press', 2, { section: 'strong', block_no: 1 }),
        lift('c', 'Burpees', 3, { section: 'conditioning', block_no: 1 }),
      ]],
    ]);
    const none = summariseDays([days[0]], sectioned, new Set(), () => [], 1, 12)[0];
    expect(none.liftCount).toBe(2); // warm-up + lift only
    const strong = summariseDays([days[0]], sectioned, new Set(['s']), () => ['strong:1'], 1, 12)[0];
    expect(strong.liftCount).toBe(3);
    expect(strong.loggedCount).toBe(1);
    expect(strong.exerciseCount).toBe(4); // the raw count ignores choices
  });
});

describe('daysForWeek / weekNumbers', () => {
  const rows = [
    { weekNum: 2, dayPosition: 6, dayLabel: 'Sat' }, { weekNum: 2, dayPosition: 0, dayLabel: 'Sun' }, { weekNum: 2, dayPosition: 1, dayLabel: 'Mon' },
    { weekNum: 2, dayPosition: null, dayLabel: 'Any' }, { weekNum: 1, dayPosition: 1, dayLabel: 'Wk1' },
  ];
  it('lists one week Monday-first, Sunday after Saturday, unlinked days last', () => {
    expect(daysForWeek(rows, 2).map((d) => d.dayLabel)).toEqual(['Mon', 'Sat', 'Sun', 'Any']);
  });
  it('lists the distinct week numbers in order', () => {
    expect(weekNumbers(rows)).toEqual([1, 2]);
  });
});

describe('dayProgress', () => {
  it('counts logged lifts and flags all done', () => {
    const lifts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(dayProgress(lifts, new Set(['a']))).toEqual({ done: 1, total: 3, allDone: false, pct: 33 });
    expect(dayProgress(lifts, new Set(['a', 'b', 'c']))).toMatchObject({ allDone: true, pct: 100 });
    expect(dayProgress([], new Set())).toEqual({ done: 0, total: 0, allDone: false, pct: 0 });
  });
});

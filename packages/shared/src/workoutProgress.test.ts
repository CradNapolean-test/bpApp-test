import { describe, expect, it } from 'vitest';
import { scoreText, bestSession, blockInfoFor, blockSeries, compareScores, exerciseOptions, measureSessions, resultScore, setScore, topSetText } from './workoutProgress';

const TZ = 'Europe/London';
let n = 0;
const log = (day: string, o: Record<string, unknown> = {}) => ({
  actual_reps: null,
  actual_load: null,
  actual_seconds: null,
  actual_distance: null,
  actual_calories: null,
  set_type: 'working' as const,
  logged_at: `${day}T10:00:${String(n++ % 60).padStart(2, '0')}.000Z`,
  ...o,
});

describe('setScore', () => {
  it('ranks each tracking type by its own measure', () => {
    expect(setScore('reps', log('2026-10-01', { actual_reps: 12 }))).toEqual([12]);
    expect(setScore('time', log('2026-10-01', { actual_seconds: 90 }))).toEqual([90]);
    expect(setScore('distance', log('2026-10-01', { actual_distance: 5000 }))).toEqual([5000]);
    expect(setScore('calories', log('2026-10-01', { actual_calories: 30 }))).toEqual([30]);
  });

  it('puts the heavier hold first and the longer one second', () => {
    const heavy = setScore('weight_time', log('2026-10-01', { actual_load: 40, actual_seconds: 20 }))!;
    const long = setScore('weight_time', log('2026-10-01', { actual_load: 30, actual_seconds: 60 }))!;
    expect(compareScores(heavy, long)).toBeGreaterThan(0);
    const longer = setScore('weight_time', log('2026-10-01', { actual_load: 40, actual_seconds: 30 }))!;
    expect(compareScores(longer, heavy)).toBeGreaterThan(0);
  });

  it('scores a faster run higher and needs both time and distance', () => {
    const slow = setScore('distance_time', log('2026-10-01', { actual_seconds: 1500, actual_distance: 5000 }))!;
    const fast = setScore('distance_time', log('2026-10-01', { actual_seconds: 1400, actual_distance: 5000 }))!;
    expect(compareScores(fast, slow)).toBeGreaterThan(0);
    expect(setScore('distance_time', log('2026-10-01', { actual_distance: 5000 }))).toBeNull();
  });

  it('has nothing to rank for a tick or a set with no value', () => {
    expect(setScore('tick', log('2026-10-01'))).toBeNull();
    expect(setScore('reps', log('2026-10-01', { actual_reps: 0 }))).toBeNull();
  });
});

describe('measureSessions', () => {
  it('takes the best set of each day and flags a new best from the second day on', () => {
    const logs = [
      log('2026-10-01', { actual_seconds: 40 }),
      log('2026-10-01', { actual_seconds: 50 }),
      log('2026-10-08', { actual_seconds: 45 }),
      log('2026-10-15', { actual_seconds: 70 }),
    ];
    const s = measureSessions('time', logs, TZ);
    expect(s.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(s.map((x) => x.top.actual_seconds)).toEqual([50, 45, 70]);
    expect(s.map((x) => x.isPB)).toEqual([false, false, true]);
    expect(s[0].sets).toBe(2);
    expect(bestSession(s)?.date).toBe('2026-10-15');
  });

  it('skips warm-up sets and sets with nothing recorded', () => {
    const logs = [log('2026-10-01', { actual_reps: 30, set_type: 'warmup' }), log('2026-10-02', { actual_reps: 10 }), log('2026-10-03')];
    expect(measureSessions('reps', logs, TZ).map((x) => x.date)).toEqual(['2026-10-02']);
  });

  it('counts every tick day but never flags a best', () => {
    const s = measureSessions('tick', [log('2026-10-01'), log('2026-10-08')], TZ);
    expect(s).toHaveLength(2);
    expect(s.some((x) => x.isPB)).toBe(false);
    expect(bestSession(s)).toBeNull();
  });

  it('shows the pace of a run', () => {
    expect(topSetText('distance_time', log('2026-10-01', { actual_seconds: 1500, actual_distance: 5000 }))).toBe('5 km · 25:00 · 5:00/km');
  });
});

describe('scoreText', () => {
  it('labels a chart point the way the set is shown', () => {
    expect(scoreText('time', 90)).toBe('1:30');
    expect(scoreText('distance_time', -0.3)).toBe('5:00/km');
    expect(scoreText('weight_time', 40)).toBe('40kg');
    expect(scoreText('reps', 12)).toBe('12');
  });
});

describe('exerciseOptions', () => {
  const infoOf = (l: { logged_at: string; tag?: string }) => (l.tag ? { key: 'lib-1', name: 'Row', type: l.tag as 'calories' | 'distance_time' } : null);

  it('keeps one history per tracking type so sets are never mixed', () => {
    const logs = [
      { ...log('2026-10-01', { actual_calories: 20 }), tag: 'calories' },
      { ...log('2026-10-02', { actual_calories: 25 }), tag: 'calories' },
      { ...log('2026-10-03', { actual_seconds: 400, actual_distance: 1000 }), tag: 'distance_time' },
    ];
    const opts = exerciseOptions(logs, infoOf);
    expect(opts.map((o) => [o.name, o.logs.length])).toEqual([
      ['Row (Calories)', 2],
      ['Row (Distance and time)', 1],
    ]);
  });

  it('leaves out sets that do not count for their type', () => {
    const logs = [{ ...log('2026-10-01'), tag: 'calories' }, { ...log('2026-10-02', { actual_calories: 10, set_type: 'warmup' }), tag: 'calories' }];
    expect(exerciseOptions(logs, infoOf)).toHaveLength(0);
  });

  it('puts weight x reps under the plain library key', () => {
    const logs = [log('2026-10-01', { actual_reps: 5, actual_load: 100 })];
    const opts = exerciseOptions(logs, () => ({ key: 'lib-2', name: 'Squat', type: 'weight_reps' }));
    expect(opts[0].key).toBe('lib-2');
  });
});

describe('block results', () => {
  const rows = [
    { name: 'Burpees', section: 'conditioning' as const, block_no: 1, block_format: 'AMRAP', block_config: { scoring: 'rounds_reps', cap_seconds: 600 }, sort_order: 1 },
    { name: 'KB swing', section: 'conditioning' as const, block_no: 1, block_format: 'AMRAP', block_config: { scoring: 'rounds_reps', cap_seconds: 600 }, sort_order: 2 },
  ];
  const result = (day: string, dayId: string, o: Record<string, unknown> = {}) => ({
    program_day_id: dayId,
    block_key: 'conditioning:1',
    format: 'AMRAP',
    scoring: 'rounds_reps' as const,
    rounds: null,
    reps: null,
    seconds: null,
    score: null,
    done: null,
    logged_at: `${day}T10:00:00.000Z`,
    ...o,
  });
  const infoOf = (dayId: string, key: string) => (dayId === 'other' ? blockInfoFor([{ ...rows[0], name: 'Rowing' }], key) : blockInfoFor(rows, key));

  it('reads a block\'s exercises and settings', () => {
    expect(blockInfoFor(rows, 'conditioning:1')).toEqual({ names: ['Burpees', 'KB swing'], config: { scoring: 'rounds_reps', cap_seconds: 600 } });
    expect(blockInfoFor(rows, 'strong:1')).toBeNull();
  });

  it('compares the same block across weeks and flags a better result', () => {
    const series = blockSeries(
      [result('2026-10-01', 'd1', { rounds: 5, reps: 3 }), result('2026-10-08', 'd2', { rounds: 5, reps: 10 }), result('2026-10-15', 'd3', { rounds: 5, reps: 8 })],
      infoOf,
      TZ,
    );
    expect(series).toHaveLength(1);
    expect(series[0].title).toBe('AMRAP');
    expect(series[0].detail).toBe('10 min cap · Burpees, KB swing');
    expect(series[0].entries.map((e) => e.text)).toEqual(['5 rounds + 3 reps', '5 rounds + 10 reps', '5 rounds + 8 reps']);
    expect(series[0].entries.map((e) => e.isPB)).toEqual([false, true, false]);
    expect(series[0].best?.text).toBe('5 rounds + 10 reps');
  });

  it('keeps a different set of exercises as its own series', () => {
    const series = blockSeries([result('2026-10-01', 'd1', { rounds: 5 }), result('2026-10-08', 'other', { rounds: 6 })], infoOf, TZ);
    expect(series).toHaveLength(2);
    expect(series[0].entries[0].date).toBe('2026-10-08');
  });

  it('treats a quicker finish time as better', () => {
    const t = (day: string, seconds: number) => result(day, 'd1', { scoring: 'time', format: 'Big Chipper', seconds });
    const series = blockSeries([t('2026-10-01', 900), t('2026-10-08', 840)], () => null, TZ);
    expect(series[0].entries.map((e) => e.isPB)).toEqual([false, true]);
    expect(series[0].best?.text).toBe('14:00');
  });

  it('has nothing to rank for a tick', () => {
    expect(resultScore({ scoring: 'done', rounds: null, reps: null, seconds: null, score: null })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { WorkoutSection } from '../workoutSections';
import { blockForDisplay, blockLabel, keyLabel, memberDayBlocks, prescriptionSummary, type PrescriptionFields } from './workoutDisplay';
import { groupBySuperset, nextSupersetLetter } from './exerciseGrouping';

const px = (over: Partial<PrescriptionFields> = {}): PrescriptionFields => ({
  block_type: 'exercise', notes: null, sets: null, reps: null, prescription_type: 'absolute', percent_1rm: null, load: null, rpe: null, rest_seconds: null, ...over,
});

describe('prescriptionSummary', () => {
  it('joins sets x reps, load, RPE and rest', () => {
    expect(prescriptionSummary(px({ sets: 3, reps: '8-10', load: 20, rpe: 8, rest_seconds: 60 }))).toBe('3 × 8-10 · 20kg · RPE 8 · rest 60s');
  });
  it('shows sets only, or reps only, when that is all there is', () => {
    expect(prescriptionSummary(px({ sets: 4 }))).toBe('4 sets');
    expect(prescriptionSummary(px({ reps: '45 sec' }))).toBe('45 sec');
  });
  it('shows a percentage of 1RM instead of a load for percent prescriptions', () => {
    expect(prescriptionSummary(px({ sets: 5, reps: '3', prescription_type: 'percent_1rm', percent_1rm: 80, load: 100 }))).toBe('5 × 3 · 80% 1RM');
  });
  it('uses the first line of a circuit’s instructions', () => {
    expect(prescriptionSummary(px({ block_type: 'circuit', notes: '5 rounds\nrest 2 min' }))).toBe('5 rounds');
    expect(prescriptionSummary(px({ block_type: 'circuit' }))).toBe('Instructions');
  });
  it('has a prompt when nothing is set', () => {
    expect(prescriptionSummary(px())).toBe('Tap to set sets and reps');
  });
});

describe('block labels', () => {
  it('names sections, numbered blocks, the single 20-minute block and split halves', () => {
    expect(blockLabel('lift', null)).toBe('Lift');
    expect(blockLabel('strong', 1)).toBe('Strong · Block 1');
    expect(blockLabel('conditioning', 0)).toBe('Conditioning · 20 min');
    expect(blockLabel('strong', 2, 'upper')).toBe('Strong · Block 2 · Upper body');
    expect(keyLabel('conditioning:2:burn')).toBe('Conditioning · Block 2 · Burn');
  });
});

type Ex = { id: string; section: WorkoutSection; block_no: number | null; block_part: null | 'upper' | 'lower' | 'breath' | 'burn'; block_format: string | null; sort_order: number };
const ex = (id: string, section: WorkoutSection, over: Partial<Ex> = {}): Ex => ({ id, section, block_no: null, block_part: null, block_format: null, sort_order: 0, ...over });

describe('memberDayBlocks', () => {
  it('is one plain list for a day that only uses Lift', () => {
    const r = memberDayBlocks([ex('b', 'lift', { sort_order: 2 }), ex('a', 'lift', { sort_order: 1 })], true);
    expect(r.sectioned).toBe(false);
    expect(r.choosing).toBe(false);
    expect(r.ordered).toHaveLength(1);
    expect(r.ordered[0]).toMatchObject({ key: 'all', title: null });
    expect(r.ordered[0].rows.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('shows Warm-up and Lift first and leaves Strong / Conditioning to the member’s picks', () => {
    const day = [
      ex('w', 'warmup'), ex('l', 'lift', { sort_order: 1 }),
      ex('s1', 'strong', { block_no: 1, sort_order: 2 }), ex('c1', 'conditioning', { block_no: 1, sort_order: 3 }),
    ];
    const r = memberDayBlocks(day, true);
    expect(r.sectioned).toBe(true);
    expect(r.choosing).toBe(true);
    expect(r.ordered.map((b) => b.key)).toEqual(['warmup', 'lift']);
    expect(r.present.has('strong:1') && r.present.has('conditioning:1')).toBe(true);
  });

  it('without choices (read-only view) shows every block in section order, with its format', () => {
    const day = [
      ex('c', 'conditioning', { block_no: 1, block_format: 'EMOM', sort_order: 3 }), ex('s', 'strong', { block_no: 1, sort_order: 2 }), ex('l', 'lift', { sort_order: 1 }),
    ];
    const r = memberDayBlocks(day, false);
    expect(r.choosing).toBe(false);
    expect(r.ordered.map((b) => b.title)).toEqual(['Lift', 'Strong · Block 1', 'Conditioning · Block 1 · EMOM']);
    expect(r.ordered[2].description).toBe('Every minute on the minute');
  });
});

describe('groupBySuperset', () => {
  it('groups consecutive exercises sharing a letter and leaves the rest alone', () => {
    const rows = [{ n: 1, superset_group: 'A' }, { n: 2, superset_group: 'A' }, { n: 3, superset_group: null }, { n: 4, superset_group: null }, { n: 5, superset_group: 'B' }];
    expect(groupBySuperset(rows).map((g) => [g.group, g.exercises.map((e) => e.n)])).toEqual([['A', [1, 2]], [null, [3]], [null, [4]], ['B', [5]]]);
  });
  it('does not merge the same letter when something else sits between', () => {
    const rows = [{ superset_group: 'A' }, { superset_group: null }, { superset_group: 'A' }];
    expect(groupBySuperset(rows)).toHaveLength(3);
  });
  it('picks the next unused superset letter', () => {
    expect(nextSupersetLetter([{ superset_group: 'A' }, { superset_group: 'B' }, { superset_group: null }])).toBe('C');
    expect(nextSupersetLetter([])).toBe('A');
  });
});

describe('block headings and tracking types', () => {
  it('adds the numbers the coach set to the format description', () => {
    const rows = [{ block_format: 'AMRAP', block_config: { scoring: 'rounds_reps', cap_seconds: 600 } }];
    expect(blockForDisplay('conditioning:1', rows).description).toBe('As many rounds as possible in the block · 10 min cap');
    expect(blockForDisplay('conditioning:1', [{ block_format: 'Horse Power', block_config: null }]).description).toBeUndefined();
  });
  it('reads a time or distance exercise as its target', () => {
    expect(prescriptionSummary(px({ tracking_type: 'time', sets: 3, target_seconds: 45, rest_seconds: 30 }))).toBe('3 × 45s · rest 30s');
    expect(prescriptionSummary(px({ tracking_type: 'distance', sets: 4, target_distance: 400 }))).toBe('4 × 400 m');
  });
});

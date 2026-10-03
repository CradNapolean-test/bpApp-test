import { describe, expect, it } from 'vitest';
import { chosenBlockKeys, describeChoices, slotOptions, strongBlock2IsSplit, blockFormatOf, conditioningIsSingle, blockKey, exerciseBlockKey, groupIntoBlocks, parseBlockKey, usesSections } from './workoutSections';

const ex = (section: 'warmup' | 'lift' | 'strong' | 'conditioning', block_no: number | null, sort_order: number, block_format: string | null = null) => ({
  section,
  block_no,
  sort_order,
  block_format,
});

describe('workout sections', () => {
  it('puts older rows with no section in Lift', () => {
    expect(exerciseBlockKey({ section: undefined as never, block_no: null })).toBe('lift');
  });

  it('treats Strong and Conditioning rows with no block number as block 1', () => {
    expect(blockKey('strong', null)).toBe('strong:1');
    expect(blockKey('conditioning', 2)).toBe('conditioning:2');
    expect(blockKey('warmup', 2)).toBe('warmup');
  });

  it('groups rows into blocks in order', () => {
    const rows = [ex('strong', 2, 3), ex('lift', null, 1), ex('strong', 1, 2), ex('strong', 1, 0)];
    const blocks = groupIntoBlocks(rows);
    expect(blocks.get('strong:1')?.map((r) => r.sort_order)).toEqual([0, 2]);
    expect(blocks.get('strong:2')).toHaveLength(1);
    expect(blocks.get('lift')).toHaveLength(1);
  });

  it('reads a block format from any row that has one', () => {
    expect(blockFormatOf([ex('strong', 1, 0), ex('strong', 1, 1, 'AMRAP')])).toBe('AMRAP');
    expect(blockFormatOf([])).toBeNull();
  });

  it('only shows section headings when something is outside Lift', () => {
    expect(usesSections([ex('lift', null, 0)])).toBe(false);
    expect(usesSections([ex('lift', null, 0), ex('warmup', null, 1)])).toBe(true);
  });

  it('parses a block key back', () => {
    expect(parseBlockKey('conditioning:2')).toEqual({ section: 'conditioning', blockNo: 2, part: null });
    expect(parseBlockKey('lift')).toEqual({ section: 'lift', blockNo: null, part: null });
  });

  it('knows when conditioning is one 20-minute block', () => {
    expect(blockKey('conditioning', 0)).toBe('conditioning:0');
    expect(blockKey('strong', 0)).toBe('strong:1');
    expect(conditioningIsSingle([ex('conditioning', 0, 0)])).toBe(true);
    expect(conditioningIsSingle([ex('conditioning', 1, 0)])).toBe(false);
  });

  it('splits Strong block 2 into Upper and Lower', () => {
    expect(blockKey('strong', 2, 'upper')).toBe('strong:2:upper');
    expect(blockKey('strong', 1, 'upper')).toBe('strong:1');
    expect(blockKey('conditioning', 2, 'lower')).toBe('conditioning:2');
    expect(parseBlockKey('strong:2:lower')).toEqual({ section: 'strong', blockNo: 2, part: 'lower' });
    expect(exerciseBlockKey({ section: 'strong', block_no: 2, block_part: 'upper' })).toBe('strong:2:upper');
    expect(strongBlock2IsSplit([{ section: 'strong', block_no: 2, block_part: 'upper' }])).toBe(true);
    expect(strongBlock2IsSplit([{ section: 'strong', block_no: 2, block_part: null }])).toBe(false);
  });

  it('offers Strong or Conditioning for each slot', () => {
    const present = new Set(['strong:1', 'strong:2', 'conditioning:1', 'conditioning:2']);
    expect(slotOptions(present, 1, null).options.map((o) => o.key)).toEqual(['strong:1', 'conditioning:1']);
    expect(slotOptions(present, 2, 'strong:1').options.map((o) => o.key)).toEqual(['strong:2', 'conditioning:2']);
  });

  it('offers Upper or Lower when Strong block 2 is split', () => {
    const present = new Set(['strong:1', 'strong:2:upper', 'strong:2:lower', 'conditioning:1', 'conditioning:2']);
    const keys = slotOptions(present, 2, 'conditioning:1').options;
    expect(keys.map((o) => o.label)).toEqual(['Strong · Upper body', 'Strong · Lower body', 'Conditioning']);
  });

  it('lets a single 20-minute conditioning block cover both slots', () => {
    const present = new Set(['strong:1', 'strong:2', 'conditioning:0']);
    expect(slotOptions(present, 1, null).options.map((o) => o.key)).toEqual(['strong:1', 'conditioning:0']);
    expect(slotOptions(present, 2, 'conditioning:0')).toEqual({ options: [], locked: 'conditioning:0' });
    // having started with Strong, the 20-minute block is not offered for the second slot
    expect(slotOptions(present, 2, 'strong:1').options.map((o) => o.key)).toEqual(['strong:2']);
    expect(chosenBlockKeys('conditioning:0', null)).toEqual(['conditioning:0']);
  });

  it('says what they did and whether they switched', () => {
    expect(describeChoices('strong:1', 'conditioning:2')).toEqual({ text: 'Strong, then Conditioning', switched: true });
    expect(describeChoices('strong:1', 'strong:2:lower')).toEqual({ text: 'Strong, then Strong · Lower body', switched: false });
    expect(describeChoices(null, null)).toBeNull();
    expect(chosenBlockKeys('strong:1', 'strong:2')).toEqual(['strong:1', 'strong:2']);
  });
});

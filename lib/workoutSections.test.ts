import { describe, expect, it } from 'vitest';
import { strongBlock2IsSplit, blockFormatOf, conditioningIsSingle, blockKey, exerciseBlockKey, groupIntoBlocks, parseBlockKey, usesSections } from './workoutSections';

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
});

import { describe, expect, it } from 'vitest';

import { manualCalories, manualEntryKcal, manualTotals, validateManualEntry } from './manualMacros';

describe('manualCalories', () => {
  it('works calories out from the macros with the validated formula (4 / 4 / 9)', () => {
    expect(manualCalories({ protein: 30, carbs: 40, fat: 10 })).toBe(370);
    expect(manualCalories({ protein: 25, carbs: null, fat: null })).toBe(100);
    expect(manualCalories({ protein: null, carbs: null, fat: 10 })).toBe(90);
  });
  it('rounds to a whole number', () => {
    expect(manualCalories({ protein: 10.1, carbs: 0, fat: 0 })).toBe(40);
    expect(manualCalories({ protein: 0.1, carbs: 0, fat: 0.1 })).toBe(1);
  });
});

describe('manualEntryKcal', () => {
  it('uses the macros, ignoring a stored figure that disagrees', () => {
    expect(manualEntryKcal({ protein: 30, carbs: 40, fat: 10, calories: 999 })).toBe(370);
  });
  it('falls back to the stored calories for an old entry with no macros', () => {
    expect(manualEntryKcal({ protein: null, carbs: null, fat: null, calories: 250 })).toBe(250);
    expect(manualEntryKcal({ protein: null, carbs: null, fat: null, calories: null })).toBe(0);
  });
});

describe('validateManualEntry', () => {
  it('turns typed text into figures with calories', () => {
    expect(validateManualEntry({ protein: '30', carbs: '40', fat: '10' })).toEqual({ entry: { protein: 30, carbs: 40, fat: 10, calories: 370 } });
  });
  it('lets a box be empty (it means none) but not all three', () => {
    expect(validateManualEntry({ protein: '25', carbs: '', fat: ' ' })).toEqual({ entry: { protein: 25, carbs: null, fat: null, calories: 100 } });
    expect(validateManualEntry({ protein: '', carbs: '', fat: '' })).toEqual({ error: 'Enter at least one of protein, carbs or fat.' });
  });
  it('accepts a comma as the decimal point and keeps one decimal', () => {
    expect(validateManualEntry({ protein: '12,56', carbs: '', fat: '' })).toEqual({ entry: { protein: 12.6, carbs: null, fat: null, calories: 50 } });
    expect(validateManualEntry({ protein: '.5', carbs: '3.', fat: '' })).toMatchObject({ entry: { protein: 0.5, carbs: 3 } });
  });
  it('accepts zero', () => {
    expect(validateManualEntry({ protein: '0', carbs: '', fat: '' })).toEqual({ entry: { protein: 0, carbs: null, fat: null, calories: 0 } });
  });
  it('refuses text, negatives and signs', () => {
    for (const bad of ['abc', '-5', '+5', '1e3', '5g', '1.2.3', '--']) {
      expect(validateManualEntry({ protein: bad, carbs: '', fat: '' })).toHaveProperty('error');
    }
  });
  it('names the box that is wrong', () => {
    expect(validateManualEntry({ protein: '10', carbs: 'x', fat: '' })).toEqual({ error: 'Carbs must be a number of grams.' });
    expect(validateManualEntry({ protein: '10', carbs: '10', fat: 'x' })).toEqual({ error: 'Fat must be a number of grams.' });
  });
  it('allows up to 10,000 g and no more', () => {
    expect(validateManualEntry({ protein: '10000', carbs: '', fat: '' })).toHaveProperty('entry');
    expect(validateManualEntry({ protein: '10000.1', carbs: '', fat: '' })).toEqual({ error: 'Protein cannot be more than 10,000 g.' });
  });
});

describe('manualTotals', () => {
  const entries = [
    { protein: 30, carbs: 40, fat: 10 },
    { protein: 25, carbs: null, fat: null },
    { protein: null, carbs: 12.5, fat: 4.25 },
  ];
  it('adds the figures and works calories out from the sums', () => {
    expect(manualTotals(entries)).toEqual({ protein: 55, carbs: 52.5, fat: 14.25, calories: 55 * 4 + 52.5 * 4 + 14.25 * 9 });
  });
  it('is all zero for an empty day', () => {
    expect(manualTotals([])).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 });
  });
});

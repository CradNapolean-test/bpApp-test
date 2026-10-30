import { describe, expect, it } from 'vitest';

import { cleanServings, countFromGrams, defaultUnit, gramsFromCount, parseUnitInput, servingFromPack, unitText, unitsFor, type OwnUnitRow, unitForAmount } from './foodUnits';

const bacon = { id: 'f1', portion: '1 gram', serving_options: [{ label: 'rasher', grams: 25, default: true }] };
const own: OwnUnitRow[] = [
  { id: 'u1', food_id: 'f1', label: 'big rasher', grams: 40 },
  { id: 'u2', food_id: 'other', label: 'x', grams: 1 },
];

describe('unitsFor', () => {
  it("offers the food's built-in units then the member's own for that food only", () => {
    expect(unitsFor(bacon, own).map((u) => [u.label, u.grams, u.own])).toEqual([['rasher', 25, false], ['big rasher', 40, true]]);
  });
  it('offers none for a food that is not stored per gram', () => {
    expect(unitsFor({ id: 'f2', portion: '1 Egg', serving_options: [{ label: 'egg', grams: 50 }] }, own)).toEqual([]);
  });
  it('copes with no options at all', () => {
    expect(unitsFor({ id: 'f3', portion: '1 gram' }, [])).toEqual([]);
  });
});

describe('converting between a count and grams', () => {
  it('turns 2 rashers into grams and back', () => {
    expect(gramsFromCount(2, { grams: 25 })).toBe(50);
    expect(countFromGrams(50, { grams: 25 })).toBe(2);
    expect(gramsFromCount(250, { grams: 1.03 })).toBe(257.5);
    expect(countFromGrams(100, { grams: 30 })).toBe(3.33);
  });
});

describe('parseUnitInput', () => {
  it('accepts a name and a weight, with a comma decimal', () => {
    expect(parseUnitInput('  rasher ', '27,5')).toEqual({ ok: true, label: 'rasher', grams: 27.5 });
  });
  it('refuses an empty name, a zero or junk weight and a huge one', () => {
    expect(parseUnitInput('', '25').ok).toBe(false);
    expect(parseUnitInput('x'.repeat(31), '25').ok).toBe(false);
    expect(parseUnitInput('rasher', '0').ok).toBe(false);
    expect(parseUnitInput('rasher', 'abc').ok).toBe(false);
    expect(parseUnitInput('rasher', '99999').ok).toBe(false);
  });
});

describe('the default serving', () => {
  it("is the one the food marks as its default, and there is none otherwise", () => {
    expect(defaultUnit(unitsFor(bacon, own))?.label).toBe('rasher');
    expect(defaultUnit(unitsFor({ id: 'f4', portion: '1 gram', serving_options: [{ label: 'slice', grams: 20 }] }, []))).toBeNull();
  });
  it('reads as the name with its weight, or just the name for a measure like ml', () => {
    expect(unitText({ label: 'rasher', grams: 25 })).toBe('rasher (25 g)');
    expect(unitText({ label: 'ml', grams: 1.03 })).toBe('ml');
  });
});

describe('servingFromPack', () => {
  it('names the serving after what the pack says, using the stated weight', () => {
    expect(servingFromPack('1 biscuit (15 g)', 15)).toEqual({ label: 'biscuit', grams: 15, default: true });
    expect(servingFromPack('2 slices (60g)', 60)).toEqual({ label: '2 slices', grams: 60, default: true });
  });
  it('calls a plain weight a serving', () => {
    expect(servingFromPack('30 g', 30)).toEqual({ label: 'serving', grams: 30, default: true });
    expect(servingFromPack('250ml', 250)).toEqual({ label: 'serving', grams: 250, default: true });
    expect(servingFromPack(undefined, 40)).toEqual({ label: 'serving', grams: 40, default: true });
  });
  it('gives nothing without a sensible weight', () => {
    expect(servingFromPack('1 pot', null)).toBeNull();
    expect(servingFromPack('1 pot', 0)).toBeNull();
    expect(servingFromPack('1 pot', 9000)).toBeNull();
  });
});

describe('cleanServings', () => {
  it('keeps the rows and marks the default', () => {
    expect(cleanServings([{ label: 'egg', grams: '50', isDefault: true }, { label: 'white', grams: '33', isDefault: false }])).toEqual({
      ok: true,
      options: [{ label: 'egg', grams: 50, default: true }, { label: 'white', grams: 33 }],
    });
  });
  it('refuses a repeated name or a bad row', () => {
    expect(cleanServings([{ label: 'egg', grams: '50', isDefault: false }, { label: 'EGG', grams: '40', isDefault: false }]).ok).toBe(false);
    expect(cleanServings([{ label: '', grams: '50', isDefault: false }]).ok).toBe(false);
  });
});

describe('unitForAmount', () => {
  const egg = { key: 'built-in:egg', label: 'egg', grams: 50, own: false, isDefault: true };
  const slice = { key: 'u1', label: 'slice', grams: 30, own: true, isDefault: false };
  const ml = { key: 'built-in:ml', label: 'ml', grams: 1, own: false, isDefault: false };
  it('uses the food\'s own serving when the weight is a neat count of it', () => {
    expect(unitForAmount([egg, slice], 100)).toBe(egg);
    expect(unitForAmount([egg, slice], 75)).toBe(egg);
  });
  it('falls back to another unit it is a neat count of, else grams', () => {
    expect(unitForAmount([egg, slice], 90)).toBe(slice);
    expect(unitForAmount([egg, slice], 47)).toBeNull();
    expect(unitForAmount([egg], 10)).toBeNull();
  });
  it('never picks an ml-sized unit for you', () => {
    expect(unitForAmount([ml], 250)).toBeNull();
  });
});

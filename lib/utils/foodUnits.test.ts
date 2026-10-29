import { describe, expect, it } from 'vitest';

import { countFromGrams, gramsFromCount, parseUnitInput, unitsFor, type OwnUnitRow } from './foodUnits';

const bacon = { id: 'f1', portion: '1 gram', serving_options: [{ label: 'rasher', grams: 25 }] };
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

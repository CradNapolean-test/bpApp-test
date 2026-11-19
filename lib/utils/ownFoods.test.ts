import { describe, expect, it } from 'vitest';

import { EMPTY_OWN_FOOD, isOwnFood, readOwnFood } from './ownFoods';

// Same cases as packages/shared/src/utils/ownFoods.test.ts: the web and the phone must save a member's own food the same way.
const wrap = { ...EMPTY_OWN_FOOD, name: '  Cafe chicken wrap ', serving: 'wrap', protein: '32', carbs: '45', fat: '14' };

describe('readOwnFood (NU18)', () => {
  it('saves a food with no weight per serving ("1 wrap"), with its calories from the macros', () => {
    const r = readOwnFood(wrap);
    expect(r).toEqual({
      ok: true,
      perServing: { calories: 32 * 4 + 45 * 4 + 14 * 9, protein: 32, carbs: 45, fat: 14 },
      row: { name: 'Cafe chicken wrap', portion: '1 wrap', protein: 32, carbs: 45, fat: 14, serving_options: null },
    });
  });

  it('saves a food with a weight per gram, with its serving shown first', () => {
    const r = readOwnFood({ ...wrap, grams: '200' });
    if (!r.ok) throw new Error(r.error);
    expect(r.row).toEqual({ name: 'Cafe chicken wrap', portion: '1 gram', protein: 0.16, carbs: 0.225, fat: 0.07, serving_options: [{ label: 'wrap', grams: 200, default: true }] });
    // one serving logs back to what was typed
    expect(r.row.protein * 200).toBeCloseTo(32);
  });

  it('calls an unnamed serving "serving" and reads a decimal comma', () => {
    const r = readOwnFood({ ...wrap, serving: ' ', protein: '3,5' });
    if (!r.ok) throw new Error(r.error);
    expect(r.row.portion).toBe('1 serving');
    expect(r.row.protein).toBe(3.5);
  });

  it('says what is missing or wrong', () => {
    expect(readOwnFood({ ...wrap, name: ' ' })).toEqual({ ok: false, error: 'Give the food a name.' });
    expect(readOwnFood({ ...wrap, name: 'x'.repeat(101) })).toMatchObject({ ok: false, error: expect.stringMatching(/100/) });
    expect(readOwnFood({ ...wrap, fat: '' })).toMatchObject({ ok: false, error: expect.stringMatching(/protein, carbs and fat/) });
    expect(readOwnFood({ ...wrap, fat: '-1' })).toMatchObject({ ok: false });
    expect(readOwnFood({ ...wrap, fat: '1001' })).toMatchObject({ ok: false, error: expect.stringMatching(/1,000/) });
    expect(readOwnFood({ ...wrap, protein: '0', carbs: '0', fat: '0' })).toMatchObject({ ok: false, error: expect.stringMatching(/at least one/) });
    expect(readOwnFood({ ...wrap, grams: '0' })).toMatchObject({ ok: false });
    expect(readOwnFood({ ...wrap, grams: '50' })).toEqual({ ok: false, error: 'The protein, carbs and fat add up to more than the serving weighs.' });
    expect(readOwnFood({ ...wrap, serving: 'x'.repeat(31) })).toMatchObject({ ok: false, error: expect.stringMatching(/30/) });
    // "1 gram" marks a food stored per gram, so a serving cannot be called that
    expect(readOwnFood({ ...wrap, serving: 'Grams' })).toMatchObject({ ok: false, error: expect.stringMatching(/weight in grams/) });
    expect(readOwnFood({ ...wrap, serving: 'g', grams: '200' })).toMatchObject({ ok: false });
  });

  it('keeps per-gram figures within what the database allows for a food stored per gram', () => {
    const r = readOwnFood({ ...wrap, protein: '100', carbs: '0', fat: '0', grams: '100' });
    if (!r.ok) throw new Error(r.error);
    expect(r.row.protein).toBe(1);
  });

  it('refuses any one of protein, carbs or fat heavier than the serving, as the database does (at most 1 g in a gram)', () => {
    // an oil: 10 g, with 10.2 g of fat on a rounded label. The three together are within 1.05 g a gram, but fat alone is over 1.
    expect(readOwnFood({ ...wrap, protein: '0', carbs: '0', fat: '10.2', grams: '10' })).toEqual({ ok: false, error: 'The fat is more than the serving weighs (10 g).' });
    expect(readOwnFood({ ...wrap, protein: '0', carbs: '0', fat: '10', grams: '10' })).toMatchObject({ ok: true, row: { fat: 1 } });
    expect(readOwnFood({ ...wrap, protein: '20.5', carbs: '0', fat: '0', grams: '20' })).toMatchObject({ ok: false, error: expect.stringMatching(/^The protein /) });
  });

  it('checks against the weight as saved (to 0.1 g)', () => {
    // 0.04 g rounds to 0 g: no figures per gram can be worked out from that
    expect(readOwnFood({ ...wrap, protein: '0.01', carbs: '0', fat: '0', grams: '0.04' })).toMatchObject({ ok: false, error: expect.stringMatching(/grams one serving weighs/) });
    // 10.04 g is saved as 10 g, so 10.03 g of fat is over
    expect(readOwnFood({ ...wrap, protein: '0', carbs: '0', fat: '10.03', grams: '10.04' })).toMatchObject({ ok: false, error: expect.stringMatching(/^The fat /) });
  });

  it('lets the three together reach 1.05 g a gram, and not past it', () => {
    expect(readOwnFood({ ...wrap, protein: '35', carbs: '35', fat: '35', grams: '100' })).toMatchObject({ ok: true });
    expect(readOwnFood({ ...wrap, protein: '35', carbs: '35', fat: '35.1', grams: '100' })).toEqual({ ok: false, error: 'The protein, carbs and fat add up to more than the serving weighs.' });
  });
});

describe('isOwnFood', () => {
  it('is true only for a member\'s own food', () => {
    expect(isOwnFood({ source: 'own' })).toBe(true);
    expect(isOwnFood({ source: 'off' })).toBe(false);
    expect(isOwnFood({})).toBe(false);
  });
});

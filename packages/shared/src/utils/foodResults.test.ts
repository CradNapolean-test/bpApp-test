import { describe, expect, it } from 'vitest';

import { groupFoodResults, moreLikeThis, sameProductKey } from './foodResults';

// Same cases as lib/utils/foodResults.test.ts: the web and the phone must group the same way.
const food = (id: string, name: string, brand: string | null, kcalPer100: number, source = 'off') => ({
  id,
  name,
  brand,
  source,
  portion: '1 gram',
  // all carbs, so calories per gram are kcalPer100 / 100
  protein: 0,
  carbs: kcalPer100 / 400,
  fat: 0,
});

describe('groupFoodResults (D23a)', () => {
  it('shows the six Tesco chicken breasts as one result, with the middle one by calories', () => {
    const rows = [
      food('t1', 'Tesco Chicken breast', 'Tesco', 106),
      food('t2', 'Tesco Chicken breast', 'Tesco', 110),
      food('t3', 'Tesco Chicken breast', 'Tesco', 71),
      food('t4', 'Tesco Chicken Breast', 'Tesco', 116),
      food('t5', 'Tesco Chicken Breast', 'Tesco', 121),
      food('t6', 'Tesco Chicken Breast', 'Tesco', 122),
    ];
    const groups = groupFoodResults(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].food.id).toBe('t2');
    expect(groups[0].others.map((f) => f.id)).toEqual(['t3', 't1', 't4', 't5', 't6']);
  });

  it('keeps one result per brand, in the search order', () => {
    const rows = [
      food('l1', 'Chicken Breast (Lidl)', 'Lidl', 106),
      food('a1', 'Aldi Chicken breast', 'Aldi', 108),
      food('a2', 'Aldi Chicken Breast', 'Aldi', 133),
      food('l2', 'Lidl Chicken breast', 'Lidl', 106),
      food('m1', 'M&S Chicken Breast', 'Marks & Spencer', 94),
      food('m2', 'M&S Chicken Breast', 'Marks & Spencer', 98),
    ];
    const groups = groupFoodResults(rows);
    expect(groups.map((g) => g.food.brand)).toEqual(['Lidl', 'Aldi', 'Marks & Spencer']);
    expect(groups.map((g) => g.others.length)).toEqual([1, 1, 1]);
  });

  it('treats a plural and different capitals as the same product, but not a different product', () => {
    expect(sameProductKey(food('1', 'Tesco Chicken Breast Fillet', 'Tesco', 1))).toBe(sameProductKey(food('2', 'Tesco chicken breast fillets', 'Tesco', 1)));
    expect(sameProductKey(food('1', 'Tesco Chicken Breast', 'Tesco', 1))).not.toBe(sameProductKey(food('2', 'Tesco Roast Chicken Breast', 'Tesco', 1)));
    expect(sameProductKey(food('1', 'Aldi GREEK YOGURT 0%', 'Aldi', 1))).not.toBe(sameProductKey(food('2', 'Aldi greek yogurt', 'Aldi', 1)));
    expect(sameProductKey(food('1', 'Lidl Greek style yogurt', 'Lidl', 1))).not.toBe(sameProductKey(food('2', 'Tesco Greek style yogurt', 'Tesco', 1)));
  });

  it('never groups UK table foods, the seed or a member\'s own foods', () => {
    const rows = [
      food('c1', 'Chicken breast', null, 100, 'cofid'),
      food('c2', 'Chicken breast', null, 110, 'cofid'),
      food('s1', 'Chicken breast', null, 100, 'seed'),
      food('o1', 'Chicken breast', null, 100, 'own'),
    ];
    expect(groupFoodResults(rows).map((g) => g.food.id)).toEqual(['c1', 'c2', 's1', 'o1']);
  });

  it('does not group foods measured in different units', () => {
    const perGram = food('g', 'Tesco Egg', 'Tesco', 140);
    const perEgg = { ...food('u', 'Tesco Egg', 'Tesco', 140), portion: '1 egg' };
    expect(groupFoodResults([perGram, perEgg])).toHaveLength(2);
  });

  it('says how many more there are', () => {
    expect(moreLikeThis(5)).toBe('5 more like this');
  });
});

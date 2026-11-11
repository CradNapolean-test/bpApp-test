import { describe, expect, it } from 'vitest';
import { recipeServingText, recipeServingWeight } from './recipeServing';

// Same cases as lib/utils/recipeServing.test.ts: the web and the phone must say the same.
const g = (portions: number) => ({ portions, food: { portion: '1 gram' } });
const each = (portions: number, portion = '1 Egg') => ({ portions, food: { portion } });

describe('recipeServingWeight', () => {
  it('divides the weighed ingredients by the servings', () => {
    // Mince and rice (NU15): 1.39 kg in the pot, 5 servings.
    const w = recipeServingWeight([g(500), g(750), g(140)], 5);
    expect(w).toEqual({ perServing: 278, total: 1390, unweighed: 0 });
    expect(recipeServingText(w!)).toBe('278 g a serving (1,390 g in all)');
  });

  it('leaves out and counts the ingredients counted by the portion', () => {
    const w = recipeServingWeight([g(200), each(2), each(1, '1 slice')], 2);
    expect(w).toEqual({ perServing: 100, total: 200, unweighed: 2 });
    expect(recipeServingText(w!)).toBe('100 g a serving (200 g in all), plus 2 items counted, not weighed');
    expect(recipeServingText(recipeServingWeight([g(100), each(1)], 1)!)).toBe('100 g a serving (100 g in all), plus 1 item counted, not weighed');
  });

  it('says nothing when no ingredient has a weight', () => {
    expect(recipeServingWeight([], 4)).toBeNull();
    expect(recipeServingWeight([each(3)], 1)).toBeNull();
    expect(recipeServingWeight([{ portions: 50, food: null }], 1)).toBeNull();
  });

  it('treats 0 servings as 1 and rounds the grams', () => {
    expect(recipeServingWeight([g(333)], 0)?.perServing).toBe(333);
    expect(recipeServingText(recipeServingWeight([g(1000)], 3)!)).toBe('333 g a serving (1,000 g in all)');
  });
});

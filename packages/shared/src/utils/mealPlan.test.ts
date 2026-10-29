import { describe, expect, it } from 'vitest';

import type { RecipeWithIngredients } from '../data/types';
import { MEAL_PLAN_SECTIONS, amountLabel, diarySectionIdFor, parseServings, perServing, scaleIngredients, validatePortions, validateRecipeName } from './mealPlan';

describe('meal slots', () => {
  it('has six slots in the day\'s order', () => {
    expect(MEAL_PLAN_SECTIONS.map((s) => s.key)).toEqual(['breakfast', 'mid_morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'evening_snack']);
  });
});

describe('diarySectionIdFor', () => {
  const sections = [{ id: 's1', label: 'Breakfast' }, { id: 's2', label: ' snacks ' }, { id: 's3', label: 'Dinner' }];
  it('matches by name, ignoring case and spaces', () => {
    expect(diarySectionIdFor('breakfast', sections)).toBe('s1');
    expect(diarySectionIdFor('mid_morning_snack', sections)).toBe('s2');
    expect(diarySectionIdFor('evening_snack', sections)).toBe('s2');
    expect(diarySectionIdFor('dinner', sections)).toBe('s3');
  });
  it('leaves it unfiled when the member has no such section', () => {
    expect(diarySectionIdFor('lunch', sections)).toBeNull();
  });
});

describe('validation', () => {
  it('checks recipe names', () => {
    expect(validateRecipeName('  ')).toMatch(/name/);
    expect(validateRecipeName('x'.repeat(101))).toMatch(/100/);
    expect(validateRecipeName('Overnight oats')).toBeNull();
  });
  it('checks amounts', () => {
    expect(validatePortions(0)).toMatch(/more than zero/);
    expect(validatePortions(-3)).toMatch(/more than zero/);
    expect(validatePortions(NaN)).toMatch(/more than zero/);
    expect(validatePortions(10001)).toMatch(/10,000/);
    expect(validatePortions(150)).toBeNull();
    expect(validatePortions(10000)).toBeNull();
  });
  it('turns typed servings into a whole number from 1 to 100', () => {
    expect(parseServings('4')).toBe(4);
    expect(parseServings('2.6')).toBe(3);
    expect(parseServings('0')).toBe(1);
    expect(parseServings('')).toBe(1);
    expect(parseServings('abc')).toBe(1);
    expect(parseServings('5000')).toBe(100);
  });
});

describe('perServing', () => {
  const food = (p: number, c: number, f: number) => ({ id: 'f', name: 'x', portion: '1 gram', protein: p, carbs: c, fat: f, barcode: null });
  const recipe = {
    id: 'r', client_id: 'c', name: 'Oats', servings: 2, created_at: '',
    recipe_ingredients: [
      { id: 'i1', recipe_id: 'r', food_id: 'f1', portions: 100, food: food(0.1, 0.6, 0.07) },
      { id: 'i2', recipe_id: 'r', food_id: 'f2', portions: 50, food: food(0.2, 0, 0.1) },
    ],
  } as unknown as RecipeWithIngredients;
  it('divides the whole recipe by its servings', () => {
    // protein 10+10=20, carbs 60, fat 7+5=12 ; kcal = 80+240+108 = 428 ; per serving /2
    const p = perServing(recipe);
    expect(p.protein).toBeCloseTo(10);
    expect(p.carbs).toBeCloseTo(30);
    expect(p.fat).toBeCloseTo(6);
    expect(p.calories).toBeCloseTo(214);
  });
});

describe('scaleIngredients', () => {
  it('scales by servings over the recipe\'s own servings', () => {
    const rows = scaleIngredients([{ food_id: 'a', portions: 100 }, { food_id: 'b', portions: 50 }], 1, 4);
    expect(rows).toEqual([{ food_id: 'a', portions: 25 }, { food_id: 'b', portions: 12.5 }]);
    expect(scaleIngredients([{ food_id: 'a', portions: 100 }], 2, 2)).toEqual([{ food_id: 'a', portions: 100 }]);
  });
  it('skips an ingredient whose food has been removed', () => {
    expect(scaleIngredients([{ food_id: null, portions: 100 }, { food_id: 'b', portions: 10 }], 1, 1)).toEqual([{ food_id: 'b', portions: 10 }]);
  });
});

describe('amountLabel', () => {
  it('shows grams for per-gram foods and a count for the rest', () => {
    expect(amountLabel(150.04, { portion: '1 gram' })).toBe('150g');
    expect(amountLabel(2, { portion: '1 Egg' })).toBe('2× 1 Egg');
    expect(amountLabel(1.256, { portion: '1 slice' })).toBe('1.26× 1 slice');
  });
});

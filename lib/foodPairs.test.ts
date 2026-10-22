import { describe, expect, it } from 'vitest';
import { MAX_UNFILED_MEAL, buildPairIndex, suggestPairs, type PairHistoryRow } from './foodPairs';
import type { FoodRow } from './data/types';

const food = (id: string, over: Partial<FoodRow> = {}): FoodRow => ({ id, name: `Food ${id}`, portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1, barcode: null, hidden: false, ...over });
const foods: Record<string, FoodRow> = {};
const f = (id: string, over: Partial<FoodRow> = {}) => (foods[id + JSON.stringify(over)] ??= food(id, over));

// One diary row: which meal (day + section) it was in, which food and how much.
const row = (meal: string, id: string, portions = 100, over: Partial<FoodRow> = {}): PairHistoryRow => {
  const [day, section] = meal.split('/');
  return { daily_log_id: day, meal_section_id: section === '' ? null : section ?? 'lunch', food_id: id, portions, food: f(id, over) };
};

// Chicken and rice together at lunch on each of the given days.
const lunches = (days: string[], extra: (day: string) => PairHistoryRow[] = () => []) =>
  days.flatMap((d) => [row(`${d}/lunch`, 'chicken'), row(`${d}/lunch`, 'rice', 150), ...extra(d)]);

const none = new Set<string>();

describe('foods that go together', () => {
  it('offers the food that is usually with another', () => {
    const index = buildPairIndex(lunches(['d1', 'd2', 'd3']));
    const found = suggestPairs(index, ['chicken'], new Set(['chicken']));
    expect(found.map((s) => s.food.id)).toEqual(['rice']);
    expect(found[0]).toMatchObject({ portions: 150, together: 3, meals: 3 });
  });

  it('works both ways round', () => {
    const index = buildPairIndex(lunches(['d1', 'd2']));
    expect(suggestPairs(index, ['rice'], none).map((s) => s.food.id)).toEqual(['chicken']);
  });

  it('needs at least two meals together', () => {
    expect(suggestPairs(buildPairIndex(lunches(['d1'])), ['chicken'], none)).toEqual([]);
    expect(suggestPairs(buildPairIndex(lunches(['d1', 'd2'])), ['chicken'], none)).toHaveLength(1);
  });

  it('needs the pair in at least 30% of the meals the food was in', () => {
    // Chicken in 10 meals, rice with it in 2 (20%): not offered. In 3 (30%): offered.
    const chickenAlone = (n: number) => Array.from({ length: n }, (_, i) => row(`a${i}/lunch`, 'chicken'));
    expect(suggestPairs(buildPairIndex([...lunches(['d1', 'd2']), ...chickenAlone(8)]), ['chicken'], none)).toEqual([]);
    expect(suggestPairs(buildPairIndex([...lunches(['d1', 'd2', 'd3']), ...chickenAlone(7)]), ['chicken'], none)).toHaveLength(1);
  });

  it('does not offer what is already in the meal', () => {
    const index = buildPairIndex(lunches(['d1', 'd2', 'd3']));
    expect(suggestPairs(index, ['chicken'], new Set(['chicken', 'rice']))).toEqual([]);
  });

  it('does not offer the food it is going on', () => {
    const index = buildPairIndex(lunches(['d1', 'd2']));
    expect(suggestPairs(index, ['chicken', 'rice'], none)).toEqual([]);
  });

  it('counts a meal once however many times a food was logged in it', () => {
    const rows = [row('d1/lunch', 'chicken'), row('d1/lunch', 'rice'), row('d1/lunch', 'rice'), row('d1/lunch', 'rice')];
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none)).toEqual([]);
  });

  it('does not pair foods eaten in different meals of the same day', () => {
    const rows = ['d1', 'd2', 'd3'].flatMap((d) => [row(`${d}/breakfast`, 'oats'), row(`${d}/dinner`, 'steak')]);
    expect(suggestPairs(buildPairIndex(rows), ['oats'], none)).toEqual([]);
  });

  it('pairs foods across different meal sections (the same lunch food at dinner counts too)', () => {
    const rows = [row('d1/lunch', 'chicken'), row('d1/lunch', 'rice'), row('d2/dinner', 'chicken'), row('d2/dinner', 'rice')];
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none).map((s) => s.food.id)).toEqual(['rice']);
  });

  it('suggests the usual amount, the middle of what they have logged', () => {
    const rows = [100, 150, 150, 400, 150].flatMap((g, i) => [row(`d${i}/lunch`, 'chicken'), row(`d${i}/lunch`, 'rice', g)]);
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none)[0].portions).toBe(150);
    const even = [100, 200].flatMap((g, i) => [row(`d${i}/lunch`, 'chicken'), row(`d${i}/lunch`, 'rice', g)]);
    expect(suggestPairs(buildPairIndex(even), ['chicken'], none)[0].portions).toBe(150);
  });

  it('uses the amounts from every meal the food was in, not just the ones with the other food', () => {
    const rows = [...lunches(['d1', 'd2']), row('x1/dinner', 'rice', 150), row('x2/dinner', 'rice', 250), row('x3/dinner', 'rice', 250)];
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none)[0].portions).toBe(150);
  });

  it('puts the strongest pairing first and stops at the limit', () => {
    const days = ['d1', 'd2', 'd3', 'd4'];
    const rows = days.flatMap((d, i) => [
      row(`${d}/lunch`, 'chicken'),
      row(`${d}/lunch`, 'rice'),
      ...(i < 3 ? [row(`${d}/lunch`, 'broccoli')] : []),
      ...(i < 2 ? [row(`${d}/lunch`, 'peppers')] : []),
    ]);
    const index = buildPairIndex(rows);
    expect(suggestPairs(index, ['chicken'], new Set(['chicken'])).map((s) => s.food.id)).toEqual(['rice', 'broccoli', 'peppers']);
    expect(suggestPairs(index, ['chicken'], new Set(['chicken']), 2).map((s) => s.food.id)).toEqual(['rice', 'broccoli']);
  });

  it('judges a food on the one in the meal it goes with best', () => {
    const rows = [...lunches(['d1', 'd2', 'd3']), row('e1/lunch', 'eggs'), row('e1/lunch', 'toast'), row('e2/lunch', 'eggs'), row('e2/lunch', 'toast')];
    const index = buildPairIndex(rows);
    expect(suggestPairs(index, ['chicken', 'eggs'], new Set(['chicken', 'eggs'])).map((s) => s.food.id).sort()).toEqual(['rice', 'toast']);
  });

  it('leaves out hidden foods', () => {
    const rows = ['d1', 'd2', 'd3'].flatMap((d) => [row(`${d}/lunch`, 'chicken'), row(`${d}/lunch`, 'bar', 50, { hidden: true })]);
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none)).toEqual([]);
  });

  it('suggests nothing for a food with no history, or no history at all', () => {
    expect(suggestPairs(buildPairIndex([]), ['chicken'], none)).toEqual([]);
    expect(suggestPairs(buildPairIndex(lunches(['d1', 'd2'])), ['never-logged'], none)).toEqual([]);
    expect(suggestPairs(buildPairIndex(lunches(['d1', 'd2'])), [], none)).toEqual([]);
  });

  it('does not read a whole day dumped under Other as one meal', () => {
    const dump = (d: string, n: number) => ['chicken', 'rice', ...Array.from({ length: n - 2 }, (_, i) => `f${i}`)].map((id) => row(`${d}/`, id));
    const big = ['d1', 'd2', 'd3'].flatMap((d) => dump(d, MAX_UNFILED_MEAL + 1));
    expect(suggestPairs(buildPairIndex(big), ['chicken'], none)).toEqual([]);
    const small = ['d1', 'd2', 'd3'].flatMap((d) => dump(d, MAX_UNFILED_MEAL));
    expect(suggestPairs(buildPairIndex(small), ['chicken'], none, 20).map((s) => s.food.id)).toContain('rice');
  });

  it('does not limit a meal that is filed under a section', () => {
    const filed = ['d1', 'd2', 'd3'].flatMap((d) => ['chicken', 'rice', ...Array.from({ length: 10 }, (_, i) => `f${i}`)].map((id) => row(`${d}/lunch`, id)));
    expect(suggestPairs(buildPairIndex(filed), ['chicken'], none, 20).map((s) => s.food.id)).toContain('rice');
  });

  it('ignores a row that has no food behind it', () => {
    const rows: PairHistoryRow[] = [...lunches(['d1', 'd2']), { daily_log_id: 'd1', meal_section_id: 'lunch', food_id: 'ghost', portions: 1, food: null }];
    expect(suggestPairs(buildPairIndex(rows), ['chicken'], none).map((s) => s.food.id)).toEqual(['rice']);
  });
});

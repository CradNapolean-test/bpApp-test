import { describe, expect, it } from 'vitest';

import { diaryLines, recipeLineDetail, recipeLogFields, relinkRecipeCopies } from './diaryLines';

// Same cases as packages/shared/src/utils/diaryLines.test.ts: the web and the phone must show a recipe the same way.
const row = (id: string, recipe?: { log: string; name?: string; servings?: number }) => ({
  id,
  recipe_log_id: recipe?.log ?? null,
  recipe_name: recipe ? recipe.name ?? 'Protein oats' : null,
  recipe_servings: recipe ? recipe.servings ?? 1 : null,
});

describe('diaryLines (D23c)', () => {
  it('shows a logged recipe as one line holding its ingredients, where its first ingredient was', () => {
    const lines = diaryLines([row('banana'), row('oats', { log: 'r1' }), row('milk', { log: 'r1' }), row('coffee'), row('whey', { log: 'r1' })]);
    expect(lines.map((l) => (l.kind === 'entry' ? l.entry.id : `${l.name}: ${l.entries.map((e) => e.id).join('+')}`))).toEqual([
      'banana',
      'Protein oats: oats+milk+whey',
      'coffee',
    ]);
  });

  it('keeps two loggings of the same recipe apart', () => {
    const lines = diaryLines([row('a', { log: 'r1' }), row('b', { log: 'r2' }), row('c', { log: 'r1' })]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => (l.kind === 'recipe' ? l.entries.length : 0))).toEqual([2, 1]);
  });

  it('leaves rows logged before recipes were grouped as separate lines', () => {
    expect(diaryLines([row('a'), row('b')]).map((l) => l.kind)).toEqual(['entry', 'entry']);
  });

  it('carries the servings, and names a line with no name "Recipe"', () => {
    const [line] = diaryLines([{ ...row('a', { log: 'r1', servings: 1.5 }), recipe_name: '  ' }]);
    expect(line).toMatchObject({ kind: 'recipe', name: 'Recipe', servings: 1.5 });
  });
});

describe('recipeLogFields', () => {
  it('trims the name and keeps it within 100 characters', () => {
    expect(recipeLogFields('id', '  Oats  ', 2)).toEqual({ recipe_log_id: 'id', recipe_name: 'Oats', recipe_servings: 2 });
    expect(recipeLogFields('id', 'x'.repeat(150), 1).recipe_name).toHaveLength(100);
  });
});

describe('relinkRecipeCopies', () => {
  it('gives each recipe on a copied day a new id, the same for all its rows, and leaves other rows alone', () => {
    let n = 0;
    const copies = relinkRecipeCopies([row('a', { log: 'r1' }), row('b'), row('c', { log: 'r1' }), row('d', { log: 'r2' })], () => `new${++n}`);
    expect(copies.map((c) => c.recipe_log_id)).toEqual(['new1', null, 'new1', 'new2']);
  });
});

describe('recipeLineDetail', () => {
  it('says the servings and how many ingredients', () => {
    expect(recipeLineDetail(1, 5)).toBe('1 serving · 5 ingredients');
    expect(recipeLineDetail(1.5, 1)).toBe('1.5 servings · 1 ingredient');
    expect(recipeLineDetail(null, 3)).toBe('3 ingredients');
  });
});

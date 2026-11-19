import { describe, expect, it } from 'vitest';

import { diaryLines, fileUnderLabel, recipeLineDetail, recipeLogFields, recipeRowCount, refiledEntries, relinkRecipeCopies } from './diaryLines';

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

describe('filing a row from "Other" under a meal', () => {
  const day = [
    { ...row('banana'), meal_section_id: null },
    { ...row('oats', { log: 'r1' }), meal_section_id: null },
    { ...row('milk', { log: 'r1' }), meal_section_id: null },
    { ...row('eggs', { log: 'r2' }), meal_section_id: 'lunch' },
    { ...row('whey', { log: 'r2' }), meal_section_id: null },
  ];
  const where = (rows: typeof day) => rows.map((r) => `${r.id}:${r.meal_section_id ?? 'other'}`);

  it('moves a plain row on its own', () => {
    expect(where(refiledEntries(day, { id: 'banana' }, 'breakfast'))).toEqual(['banana:breakfast', 'oats:other', 'milk:other', 'eggs:lunch', 'whey:other']);
  });

  it('moves every ingredient of a recipe still in "Other" with the one filed, so the recipe stays one line', () => {
    expect(where(refiledEntries(day, { id: 'milk', recipe_log_id: 'r1' }, 'breakfast'))).toEqual(['banana:other', 'oats:breakfast', 'milk:breakfast', 'eggs:lunch', 'whey:other']);
    // only rows still in "Other": a row already filed elsewhere stays where it is
    expect(where(refiledEntries(day, { id: 'whey', recipe_log_id: 'r2' }, 'dinner'))).toEqual(['banana:other', 'oats:other', 'milk:other', 'eggs:lunch', 'whey:dinner']);
  });

  it('says when the whole recipe moves', () => {
    expect(fileUnderLabel(row('banana'))).toBe('File under');
    expect(fileUnderLabel(row('milk', { log: 'r1' }))).toBe('File all of Protein oats under');
  });

  it('counts every row of a logged recipe on the day for "Remove", wherever it is filed', () => {
    expect(recipeRowCount(day, 'r1')).toBe(2);
    expect(recipeRowCount(day, 'r2')).toBe(2);
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

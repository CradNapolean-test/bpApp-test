import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0169 (no database): decision batch 7, nutrition. The behaviour in the database needs the write checks listed
// in the migration's header, run with test accounts.
const file = '0169_nutrition_recipes_planner_own_foods.sql';
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations', file), 'utf8').replace(/\r\n/g, '\n');
const sql = migration.replace(/--.*$/gm, '');

describe('migration 0169 is safe to paste into the SQL editor', () => {
  it('can be run twice and shares no temporary table between statements', () => {
    expect(sql).not.toMatch(/temporary table|temp table/i);
    expect(sql).not.toMatch(/create table (?!if not exists)/i);
    expect(sql).not.toMatch(/add column (?!if not exists)/i);
    expect(sql).not.toMatch(/create index (?!if not exists)/i);
    for (const m of sql.matchAll(/add constraint (\w+)/g)) expect(sql, m[1]).toContain(`drop constraint if exists ${m[1]}`);
    for (const m of sql.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) expect(sql, m[1]).toContain(`drop policy if exists "${m[1]}" on ${m[2]}`);
  });

  it('has read-only PRE-FLIGHT and AFTER queries and says when to apply it', () => {
    expect(migration).toMatch(/PRE-FLIGHT \(read-only\)/);
    expect(migration).toMatch(/AFTER \(read-only\)/);
    expect(migration).toMatch(/BEFORE the web app/);
  });
});

describe('D23c: a recipe is one diary line', () => {
  it('adds the three recipe columns to the diary rows, empty on every existing row', () => {
    for (const column of ['recipe_log_id uuid', 'recipe_name text', 'recipe_servings numeric']) {
      expect(sql).toContain(`alter table public.food_diary_entries add column if not exists ${column};`);
    }
    // nothing fills them in for rows already logged: those stay as separate lines
    expect(sql).not.toMatch(/update public\.food_diary_entries/);
  });

  it('keeps the three together, on a food row, with a name of 1 to 100 characters', () => {
    const check = sql.slice(sql.indexOf('add constraint food_diary_entries_recipe_line'), sql.indexOf('create index if not exists idx_food_diary_entries_recipe_log_id'));
    expect(check).toMatch(/recipe_log_id is null and recipe_name is null and recipe_servings is null/);
    expect(check).toMatch(/food_id is not null/);
    expect(check).toMatch(/char_length\(btrim\(recipe_name\)\) between 1 and 100/);
  });
});

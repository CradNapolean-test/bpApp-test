import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_PLAN_SLOTS } from '../../lib/utils/planSections';

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

describe('NU12: the Meal Planner uses the member\'s diary sections', () => {
  it('adds a section to planned items that empties (not deletes) when the section is deleted, and lets the old fixed meal be empty', () => {
    expect(sql).toMatch(/alter table public\.meal_plan_entries\s+add column if not exists meal_section_id uuid references public\.meal_sections\(id\) on delete set null;/);
    expect(sql).toMatch(/alter table public\.meal_plan_entries alter column section drop not null;/);
  });

  it('moves existing items with the same rule as the screens (lib/utils/planSections.ts)', () => {
    const rows = [...sql.matchAll(/\('(\w+)', (\d), '([^']+)', '([^']+)'\)/g)].map((m) => ({ key: m[1], idx: Number(m[2]), label: m[3], diary: m[4] }));
    expect(rows).toEqual(LEGACY_PLAN_SLOTS.map((s, i) => ({ key: s.key, idx: i, label: s.label.toLowerCase(), diary: s.diaryLabel.toLowerCase() })));
    const update = sql.slice(sql.indexOf('update public.meal_plan_entries e'));
    // own name, then the old diary name, then the same point in the day, in the diary's order
    expect(update.indexOf('= slot.label')).toBeLessThan(update.indexOf('= slot.diary_label'));
    expect(update.indexOf('= slot.diary_label')).toBeLessThan(update.indexOf('floor(slot.idx * s.n / 6.0)'));
    expect(update.match(/order by ms\.sort_order, ms\.created_at nulls first, ms\.id/g)).toHaveLength(3);
    // only items not yet in a section, of members who have sections, so running it again changes nothing
    expect(update).toMatch(/and e\.meal_section_id is null/);
    expect(update).toMatch(/and exists \(select 1 from public\.meal_sections ms where ms\.client_id = e\.client_id\)/);
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

describe("NU18: deleting a member who logged one of their own foods", () => {
  const keyTables = ['food_diary_entries', 'recipe_ingredients', 'meal_plan_entries'];

  it('their own foods go with them', () => {
    expect(sql).toMatch(/alter table public\.foods add column if not exists owner_id uuid references public\.profiles\(id\) on delete cascade;/);
  });

  it("the food_id keys of the diary, recipe ingredients and plan wait for the member's cascades (deferred), whatever order they run in", () => {
    const block = sql.slice(sql.indexOf('do $keys$'), sql.indexOf('$keys$;'));
    expect(block).toMatch(/alter table %s alter constraint %I deferrable initially deferred/);
    for (const t of keyTables) expect(block).toContain(`'public.${t}'::regclass`);
    // only plain no-action keys, and only those not deferred yet, so running it again changes nothing
    expect(block).toMatch(/c\.confdeltype = 'a'/);
    expect(block).toMatch(/and not \(c\.condeferrable and c\.condeferred\)/);
    // after the owner_id cascade it is there for
    expect(sql.indexOf('do $keys$')).toBeGreaterThan(sql.indexOf('add column if not exists owner_id'));
  });

  it('the guard stops before anything changes if one of those keys is not a plain no-action key', () => {
    const guard = sql.slice(sql.indexOf('do $guard$'), sql.indexOf('$guard$;'));
    for (const t of keyTables) expect(guard).toContain(`'public.${t}'::regclass`);
    expect(guard).toMatch(/c\.confdeltype <> 'a'/);
    expect(guard).toMatch(/raise exception 'a food_id key is not/);
    expect(sql.indexOf('$guard$;')).toBeLessThan(sql.indexOf('alter table public.food_diary_entries add column'));
  });

  it('the header has the before and after of those keys', () => {
    expect(migration).toMatch(/Expected before: the food_id keys of food_diary_entries, meal_plan_entries and recipe_ingredients with a \(no action\), false, false;/);
    expect(migration).toMatch(/Expected after: the same keys; the three no-action food_id keys now true, true \(deferred\)/);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on the food search SQL (no database). The live order is checked by supabase/tests/food-search-check.cjs.
const dir = path.resolve(__dirname, '../migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
const everydaySql = read('0154_food_search_everyday_first.sql');
const listed = [...everydaySql.matchAll(/\((\d+), '(cofid|seed)', '((?:[^']|'')+)'\)/g)].map((m) => ({ rank: Number(m[1]), source: m[2], name: m[3] }));

describe('everyday foods list (0154)', () => {
  it('has the 88 foods the live check expects', () => {
    expect(listed).toHaveLength(88);
  });

  it('gives every food its own place and names each food once', () => {
    expect(new Set(listed.map((f) => f.rank)).size).toBe(listed.length);
    expect(new Set(listed.map((f) => `${f.source}|${f.name}`)).size).toBe(listed.length);
  });

  it('keeps the weighing habit: cooked rice and pasta before dry, raw mince before cooked', () => {
    const rank = (name: string) => listed.find((f) => f.name === name)?.rank ?? Infinity;
    expect(rank('Rice, white, long grain, boiled in unsalted water')).toBeLessThan(rank('Rice, white, long grain, raw'));
    expect(rank('Pasta, white, dried, boiled in unsalted water')).toBeLessThan(rank('Pasta, white, dried, raw'));
    expect(rank('Beef, mince, raw')).toBeLessThan(rank('Beef, mince, stewed'));
  });
});

describe('search_foods after every migration', () => {
  // The newest migration that (re)defines the search is the one the database runs.
  const latest = files.filter((f) => /create or replace function public\.search_foods\(/.test(read(f))).at(-1) as string;
  const body = read(latest).slice(read(latest).indexOf('create or replace function public.search_foods('));

  it('still puts everyday foods and "what the food is" into the order', () => {
    expect(body).toMatch(/f\.everyday_rank asc nulls last/);
    expect(body).toMatch(/m\.head,/);
    expect(body).toMatch(/\(m\.head < 99\) desc/);
  });

  it('never puts the typed text into a pattern without cleaning it first', () => {
    // Every regex built from p_query must go through regexp_replace(..., '[^a-z0-9 ]', ...) or split into cleaned words.
    const raw = body.match(/'\^' \|\| lower\(trim\(p_query\)\)/g) ?? [];
    expect(raw).toEqual([]);
  });

  it('is still callable by signed-in members', () => {
    expect(read(latest)).toMatch(/grant execute on function public\.search_foods\(text, int\) to authenticated/);
  });

  // Postgres keeps only 32 compiled regular expressions. 0154 tested every food against each unusual word as its own pattern
  // (~40 patterns per food), so each was recompiled for every food and "chicken" hit the 8 s timeout. The list must be joined
  // into one pattern, worked out once per search.
  it('tests each food against the unusual words as one pattern, not one pattern per word', () => {
    expect(body).toMatch(/string_agg\(u\.word, '\|'\)/);
    expect(body).not.toMatch(/f\.name\)? ~ \('\\m' \|\| u\.word/);
    const list = body.slice(body.indexOf('unnest(array['), body.indexOf(') as odd'));
    expect(list.length).toBeGreaterThan(0);
    expect(list).not.toMatch(/\bf\./);
  });

  it('keeps the unusual words 0154 used, so the order is unchanged', () => {
    const words = (sql: string) => {
      const start = sql.indexOf('unnest(array[');
      return [...sql.slice(start, sql.indexOf(']', start)).matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    };
    expect(words(body)).toEqual(words(everydaySql));
    expect(words(body)).toHaveLength(35);
  });
});

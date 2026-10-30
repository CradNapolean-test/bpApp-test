import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => state.client) }));

import { copyDiaryBetweenDates } from './foodDiary';

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

// A stand-in for the query builder: every method returns the builder, and awaiting it gives the next queued result (one per `from`).
// `tables` records which table each query was on, `calls` what was asked, so a test can see what was written.
function fakeClient(results: Result[]) {
  const calls: [string, unknown[]][] = [];
  const tables: string[] = [];
  const queue = [...results];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const result = queue.shift() ?? { data: [], error: null };
    const builder: unknown = new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === 'then') return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ error: null, ...result }).then(res, rej);
          return (...args: unknown[]) => {
            calls.push([prop, args]);
            return builder;
          };
        },
      }
    );
    return builder;
  });
  state.client = { from };
  return { calls, tables };
}

const inserted = (calls: [string, unknown[]][]) => calls.filter(([name]) => name === 'insert').map(([, args]) => args[0] as Record<string, unknown>[]);

const entry = (food_id: string, portions: number, meal_section_id: string | null = 's1', over: Record<string, unknown> = {}) => ({
  id: `e-${food_id}`,
  daily_log_id: 'from-log',
  food_id,
  portions,
  meal_section_id,
  quick_add_name: null,
  quick_add_calories: null,
  quick_add_protein: null,
  quick_add_carbs: null,
  quick_add_fat: null,
  ...over,
});

const TODAY = '2026-10-22';
const profile = { data: { timezone: 'UTC' } };
const fromLog = { data: { id: 'from-log' } };
const toLog = { data: { id: 'to-log' } };

beforeEach(() => {
  state.client = null;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('copyDiaryBetweenDates', () => {
  it('copies a day onto another, each row keeping its meal', async () => {
    const { calls } = fakeClient([
      profile,
      fromLog,
      { data: [entry('oats', 50, 's1'), entry('rice', 150, 's2')] },
      toLog,
      { data: [] },
      { data: null },
      { data: [] },
    ]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-21', TODAY);
    expect(result).toMatchObject({ ok: true, found: 2, added: 2, dailyLogId: 'to-log' });
    expect(inserted(calls)[0]).toEqual([
      expect.objectContaining({ daily_log_id: 'to-log', food_id: 'oats', portions: 50, meal_section_id: 's1' }),
      expect.objectContaining({ daily_log_id: 'to-log', food_id: 'rice', portions: 150, meal_section_id: 's2' }),
    ]);
  });

  it('skips what the target day already has', async () => {
    const { calls } = fakeClient([
      profile,
      fromLog,
      { data: [entry('oats', 50), entry('milk', 200)] },
      toLog,
      { data: [{ food_id: 'oats', portions: 50, meal_section_id: 's1' }] },
      { data: null },
      { data: [] },
    ]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-21', TODAY);
    expect(result).toMatchObject({ ok: true, found: 2, added: 1 });
    expect(inserted(calls)[0]).toEqual([expect.objectContaining({ food_id: 'milk' })]);
  });

  it('adds nothing, and writes nothing, when it is all there already', async () => {
    const { calls } = fakeClient([profile, fromLog, { data: [entry('oats', 50)] }, toLog, { data: [{ food_id: 'oats', portions: 50, meal_section_id: 's1' }] }, { data: [] }]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-21', TODAY);
    expect(result).toMatchObject({ ok: true, found: 1, added: 0 });
    expect(inserted(calls)).toEqual([]);
  });

  it('copies one meal into another meal', async () => {
    const { calls, tables } = fakeClient([
      profile,
      { data: [{ id: 's2' }, { id: 's3' }] },
      fromLog,
      { data: [entry('rice', 150, 's2')] },
      toLog,
      { data: [] },
      { data: null },
      { data: [] },
    ]);
    const result = await copyDiaryBetweenDates('c1', TODAY, TODAY, { fromSectionId: 's2', toSectionId: 's3' });
    expect(result).toMatchObject({ ok: true, found: 1, added: 1 });
    expect(tables[1]).toBe('meal_sections');
    expect(calls).toContainEqual(['eq', ['meal_section_id', 's2']]);
    expect(inserted(calls)[0]).toEqual([expect.objectContaining({ food_id: 'rice', meal_section_id: 's3' })]);
  });

  it('copies a Quick Add with its name and figures', async () => {
    const quick = entry('x', 1, 's1', { food_id: null, quick_add_name: 'Burrito', quick_add_calories: 700, quick_add_protein: 30, quick_add_carbs: 80, quick_add_fat: 25 });
    const { calls } = fakeClient([profile, fromLog, { data: [quick] }, toLog, { data: [] }, { data: null }, { data: [] }]);
    await copyDiaryBetweenDates('c1', '2026-10-21', TODAY);
    expect(inserted(calls)[0]).toEqual([
      expect.objectContaining({ food_id: null, quick_add_name: 'Burrito', quick_add_calories: 700, quick_add_protein: 30, quick_add_carbs: 80, quick_add_fat: 25 }),
    ]);
  });

  it('makes the target day only once there is something to put on it', async () => {
    const { tables } = fakeClient([profile, { data: null }]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-21', TODAY);
    expect(result).toEqual({ ok: false, error: 'Nothing is logged on that day to copy.' });
    expect(tables).toEqual(['client_profiles', 'daily_logs']);
  });

  it('says so when the meal has nothing in it that day', async () => {
    fakeClient([profile, { data: [{ id: 's2' }] }, fromLog, { data: [] }]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-21', TODAY, { fromSectionId: 's2' });
    expect(result).toEqual({ ok: false, error: 'Nothing is logged in that meal on that day.' });
  });

  it('only copies into tomorrow, today and the last two weeks', async () => {
    const { tables } = fakeClient([profile]);
    expect(await copyDiaryBetweenDates('c1', '2026-10-21', '2026-10-24')).toEqual({ ok: false, error: 'Food can only be copied into tomorrow, today or the last 2 weeks.' });
    expect(await copyDiaryBetweenDates('c1', '2026-10-21', '2026-10-07')).toMatchObject({ ok: false });
    // Not a single food query was made for either.
    expect(tables.filter((t) => t === 'food_diary_entries')).toEqual([]);
  });

  it('the oldest editable day is still allowed', async () => {
    fakeClient([profile, { data: null }]);
    const result = await copyDiaryBetweenDates('c1', '2026-10-09', '2026-10-08');
    expect(result).toEqual({ ok: false, error: 'Nothing is logged on that day to copy.' });
  });

  it('only copies from the last 30 days', async () => {
    fakeClient([profile]);
    expect(await copyDiaryBetweenDates('c1', '2026-09-01', TODAY)).toEqual({ ok: false, error: 'That day is too far back to copy from.' });
  });

  it('refuses a meal that is not the member’s own', async () => {
    const { tables } = fakeClient([profile, { data: [{ id: 's2' }] }]);
    const result = await copyDiaryBetweenDates('c1', TODAY, TODAY, { fromSectionId: 's2', toSectionId: 'someone-elses' });
    expect(result).toEqual({ ok: false, error: 'That meal is not one of your sections.' });
    expect(tables).toEqual(['client_profiles', 'meal_sections']);
  });

  it('refuses to copy a day onto itself, before reading anything', async () => {
    const { tables } = fakeClient([]);
    expect(await copyDiaryBetweenDates('c1', TODAY, TODAY)).toMatchObject({ ok: false });
    expect(await copyDiaryBetweenDates('c1', TODAY, TODAY, { fromSectionId: 's1', toSectionId: 's1' })).toMatchObject({ ok: false });
    expect(await copyDiaryBetweenDates('c1', TODAY, TODAY, { fromSectionId: 's1' })).toMatchObject({ ok: false });
    expect(tables).toEqual([]);
  });

  it('refuses a date that is not a date', async () => {
    const { tables } = fakeClient([]);
    expect(await copyDiaryBetweenDates('c1', 'yesterday', TODAY)).toEqual({ ok: false, error: 'Pick a day to copy.' });
    expect(tables).toEqual([]);
  });
});

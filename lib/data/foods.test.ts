import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => state.client) }));

import { getFavoriteFoods, getFoodByBarcode, getFoodPairHistory, getRecentlyLoggedFoods, searchFoods, searchScannedFoods, setFoodHidden, upsertFoodFromBarcode } from './foods';

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

// A stand-in for the query builder: every method returns the builder, and awaiting it gives the next queued result. `calls` records
// what was asked, so a test can check that a filter was applied.
function fakeClient(results: Result[], rpcResult: Result = { data: null, error: { message: 'no such function' } }) {
  const calls: [string, unknown[]][] = [];
  const queue = [...results];
  const from = vi.fn(() => {
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
  state.client = { from, rpc: vi.fn(async () => rpcResult) };
  return { calls };
}

const food = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Food ${id}`, portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1, barcode: null, hidden: false, ...over });

beforeEach(() => {
  state.client = null;
});

describe('hidden foods stay out of what a member sees (M12)', () => {
  it('the name-search fallback asks only for visible foods', async () => {
    const { calls } = fakeClient([{ data: [food('a')] }]);
    await searchFoods('oat');
    expect(calls).toContainEqual(['eq', ['hidden', false]]);
  });

  it('a scan does not find a hidden food', async () => {
    fakeClient([{ data: [food('a', { barcode: '5000', hidden: true })] }]);
    expect(await getFoodByBarcode('5000')).toBeNull();
    fakeClient([{ data: [food('b', { barcode: '5001' })] }]);
    expect((await getFoodByBarcode('5001'))?.id).toBe('b');
  });

  it('caching a product whose barcode a coach hid says why, instead of adding it again', async () => {
    fakeClient([{ error: { code: '23505', message: 'duplicate key' } }, { data: [food('a', { barcode: '5000', hidden: true })] }]);
    await expect(upsertFoodFromBarcode('5000', { name: 'Bar', portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1 })).rejects.toThrow(/taken off the food list/);
  });

  it('caching a product someone already scanned hands back the existing row', async () => {
    fakeClient([{ error: { code: '23505', message: 'duplicate key' } }, { data: [food('a', { barcode: '5000' })] }]);
    const row = await upsertFoodFromBarcode('5000', { name: 'Bar', portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1 });
    expect(row.id).toBe('a');
  });

  it('favourites leave out hidden foods', async () => {
    fakeClient([{ data: [{ food: food('a') }, { food: food('b', { hidden: true }) }, { food: null }] }]);
    expect((await getFavoriteFoods('c1')).map((f) => f.id)).toEqual(['a']);
  });

  it('recently logged leaves out hidden foods and repeats', async () => {
    fakeClient([
      {
        data: [
          { food_id: 'a', food: food('a') },
          { food_id: 'b', food: food('b', { hidden: true }) },
          { food_id: 'a', food: food('a') },
          { food_id: 'c', food: food('c') },
        ],
      },
    ]);
    expect((await getRecentlyLoggedFoods('c1')).map((f) => f.id)).toEqual(['a', 'c']);
  });
});

describe('the food history behind "goes with" suggestions', () => {
  it('reads only this member’s food rows from the last 60 days, and hands back just what the pairing needs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    try {
      const { calls } = fakeClient([
        { data: [{ daily_log_id: 'l1', meal_section_id: 's1', food_id: 'a', portions: 150, created_at: 'x', food: food('a'), daily_logs: { client_id: 'c1', log_date: '2026-10-20' } }] },
      ]);
      const rows = await getFoodPairHistory('c1');
      expect(rows).toEqual([{ daily_log_id: 'l1', meal_section_id: 's1', food_id: 'a', portions: 150, food: food('a') }]);
      expect(calls).toContainEqual(['eq', ['daily_logs.client_id', 'c1']]);
      expect(calls).toContainEqual(['gte', ['daily_logs.log_date', '2026-08-23']]);
      expect(calls).toContainEqual(['not', ['food_id', 'is', null]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is empty for a member with no history', async () => {
    fakeClient([{ data: null }]);
    expect(await getFoodPairHistory('c1')).toEqual([]);
  });
});

describe('the coach list of scanned foods', () => {
  it('reads scanned foods only, hidden ones included, and strips characters that would break the filter', async () => {
    const { calls } = fakeClient([{ data: [food('a', { hidden: true })] }]);
    const rows = await searchScannedFoods('oat,bar%');
    expect(rows).toHaveLength(1);
    expect(calls).toContainEqual(['eq', ['source', 'scan']]);
    expect(calls.some(([m, a]) => m === 'eq' && (a as unknown[])[0] === 'hidden')).toBe(false);
    const or = calls.find(([m]) => m === 'or');
    expect(or?.[1]).toEqual(['name.ilike.%oat bar%,barcode.ilike.%oat bar%']);
  });

  it('hides a food, and says so when nothing was changed', async () => {
    fakeClient([{ data: [{ id: 'a' }] }]);
    expect(await setFoodHidden('a', true)).toEqual({ ok: true });
    fakeClient([{ data: [] }]);
    expect(await setFoodHidden('a', true)).toEqual({ ok: false, error: 'Only scanned foods can be hidden, and only by a coach.' });
  });

  it('hands a database refusal back as a result', async () => {
    fakeClient([{ data: null, error: { message: 'permission denied for table foods' } }]);
    const result = await setFoodHidden('a', false);
    expect(result.ok).toBe(false);
  });
});

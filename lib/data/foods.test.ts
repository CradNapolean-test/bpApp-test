import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => state.client) }));

import {
  addBarcodeFood,
  correctScannedFood,
  findFoodByBarcode,
  getFavoriteFoods,
  getFoodByBarcode,
  getFoodPairHistory,
  getRecentlyLoggedFoods,
  listMemberAddedFoods,
  searchFoods,
  searchScannedFoods,
  setFoodHidden,
  upsertFoodFromBarcode,
} from './foods';

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
    expect(await upsertFoodFromBarcode('5000', { name: 'Bar', portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/taken off the food list/),
    });
  });

  it('caching a product someone already scanned hands back the existing row', async () => {
    fakeClient([{ error: { code: '23505', message: 'duplicate key' } }, { data: [food('a', { barcode: '5000' })] }]);
    const saved = await upsertFoodFromBarcode('5000', { name: 'Bar', portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1 });
    expect(saved).toMatchObject({ ok: true, food: { id: 'a' } });
  });

  // The daily limit on new products (0173) is not one of these: it counts only products typed in from the pack (the owner's decision,
  // 20 Nov 2026), so a product cached from Open Food Facts is never refused by it.
  it('a refused cache the database words for the member comes back as its message, which a thrown error would lose in production', async () => {
    const refusal = 'This product cannot be saved.';
    fakeClient([{ error: { code: 'P0001', message: refusal } }]);
    expect(await upsertFoodFromBarcode('5000', { name: 'Bar', portion: '1 gram', protein: 0.1, carbs: 0.1, fat: 0.1 })).toEqual({ ok: false, error: refusal });
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
    expect(or?.[1]).toEqual(['name.ilike.%oat bar%,barcode.ilike.%oat bar%,brand.ilike.%oat bar%']);
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

describe('shared barcode foods (owner list item 6, migration 0173)', () => {
  const fields = { name: 'Protein bar', brand: 'Test', protein: 0.2, carbs: 0.22, fat: 0.08, serving_options: [{ label: 'bar', grams: 45, default: true as const }] };

  it('a scan of a product a coach hid says so, and finds nothing to add', async () => {
    fakeClient([{ data: [food('a', { barcode: '5000', hidden: true })] }]);
    expect(await findFoodByBarcode('5000')).toEqual({ food: null, hidden: true });
    fakeClient([{ data: [food('b', { barcode: '5001' })] }]);
    expect(await findFoodByBarcode('5001')).toMatchObject({ food: { id: 'b' }, hidden: false });
    fakeClient([{ data: [] }]);
    expect(await findFoodByBarcode('5002')).toEqual({ food: null, hidden: false });
  });

  it('adds a product through add_barcode_food, and hands back the food someone added first', async () => {
    fakeClient([], { data: { food: food('new', { barcode: '5000' }), existing: false }, error: null });
    expect(await addBarcodeFood('5000', fields)).toMatchObject({ ok: true, existing: false, food: { id: 'new' } });
    const rpc = (state.client as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith('add_barcode_food', {
      p_barcode: '5000',
      p_name: 'Protein bar',
      p_brand: 'Test',
      p_protein: 0.2,
      p_carbs: 0.22,
      p_fat: 0.08,
      p_serving_options: fields.serving_options,
    });
    fakeClient([], { data: { food: food('first'), existing: true }, error: null });
    expect(await addBarcodeFood('5000', fields)).toMatchObject({ ok: true, existing: true, food: { id: 'first' } });
  });

  it("hands the database's refusal back as a result, not a thrown error (production would hide its words)", async () => {
    fakeClient([], { data: null, error: { message: 'A coach has taken this product off the food list. Use Quick Add for it, or ask your coach.' } });
    expect(await addBarcodeFood('5000', fields)).toEqual({ ok: false, error: 'A coach has taken this product off the food list. Use Quick Add for it, or ask your coach.' });
    fakeClient([], { data: { nothing: true }, error: null });
    expect(await addBarcodeFood('5000', fields)).toEqual({ ok: false, error: 'Could not add that product. Try again.' });
  });

  it('the daily limit (the 31st product typed in from the pack in a day) comes back as its message', async () => {
    const limit = 'You have added a lot of new products from the pack today. Try again tomorrow, or use Quick Add for now.';
    fakeClient([], { data: null, error: { code: 'P0001', message: limit } });
    expect(await addBarcodeFood('5000', fields)).toEqual({ ok: false, error: limit });
  });

  it("the coach's scanned list says who added each product, where the coach can see it", async () => {
    fakeClient([
      { data: [food('a', { barcode: '5000' }), food('b', { barcode: '5001' })] },
      { data: [{ food_id: 'a', added_by: 'm1', added_at: '2026-11-20T10:00:00Z', typed: true }] },
      { data: [{ id: 'm1', display_name: null, client_profiles: { name: 'Sam Member' } }] },
    ]);
    const rows = await searchScannedFoods('');
    expect(rows.map((r) => [r.id, r.addition])).toEqual([
      ['a', { added_by: 'm1', added_at: '2026-11-20T10:00:00Z', typed: true, adder_name: 'Sam Member' }],
      ['b', null],
    ]);
  });

  it('the scanned list still loads when who-added cannot be read (0173 not applied yet)', async () => {
    fakeClient([{ data: [food('a')] }, { data: null, error: { message: 'relation "food_additions" does not exist' } }]);
    expect((await searchScannedFoods('')).map((r) => [r.id, r.addition])).toEqual([['a', null]]);
  });

  it('"Added by members" lists typed-in products newest first, filtered by name, brand or barcode', async () => {
    const { calls } = fakeClient([
      {
        data: [
          { food_id: 'a', added_by: 'm1', added_at: '2026-11-20T10:00:00Z', typed: true, food: food('a', { name: 'Oat bar', brand: 'Tesco', barcode: '5000' }) },
          { food_id: 'b', added_by: null, added_at: '2026-11-19T10:00:00Z', typed: true, food: food('b', { name: 'Cola', barcode: '5001' }) },
          { food_id: 'c', added_by: 'm1', added_at: '2026-11-18T10:00:00Z', typed: true, food: null },
        ],
      },
      { data: [{ id: 'm1', display_name: 'Coach Name', client_profiles: [] }] },
    ]);
    const rows = await listMemberAddedFoods('tesco');
    expect(calls).toContainEqual(['eq', ['typed', true]]);
    expect(calls).toContainEqual(['order', ['added_at', { ascending: false }]]);
    expect(rows.map((r) => [r.id, r.addition?.adder_name])).toEqual([['a', 'Coach Name']]);
  });

  it('a correction writes only the fields the coach changed, and nothing changed is said so', async () => {
    const { calls } = fakeClient([{ data: [{ id: 'a' }] }]);
    expect(await correctScannedFood('a', { name: 'Oat bar' })).toEqual({ ok: true });
    expect(calls).toContainEqual(['update', [{ name: 'Oat bar' }]]);
    expect(await correctScannedFood('a', {})).toMatchObject({ ok: false, error: expect.stringMatching(/Nothing has changed/) });
  });

  it('a coach corrects a scanned product, and is told when nothing could be changed', async () => {
    const { calls } = fakeClient([{ data: [{ id: 'a' }] }]);
    expect(await correctScannedFood('a', { name: 'Oat bar', brand: null, protein: 0.1, carbs: 0.6, fat: 0.1 })).toEqual({ ok: true });
    expect(calls).toContainEqual(['update', [{ name: 'Oat bar', brand: null, protein: 0.1, carbs: 0.6, fat: 0.1 }]]);
    expect(calls).toContainEqual(['eq', ['source', 'scan']]);
    fakeClient([{ data: [] }]);
    expect(await correctScannedFood('a', { name: 'Oat bar', brand: null, protein: 0.1, carbs: 0.6, fat: 0.1 })).toEqual({
      ok: false,
      error: 'Only scanned products can be corrected, and only by a coach.',
    });
  });
});

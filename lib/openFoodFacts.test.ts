import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFF_UNAVAILABLE, lookupBarcode, servingFrom } from './openFoodFacts';

describe('servingFrom (FT7)', () => {
  it('reads the pack serving in grams, as a number or a numeric string', () => {
    expect(servingFrom(30)).toBe(30);
    expect(servingFrom('45')).toBe(45);
    expect(servingFrom('27.55')).toBe(27.6);
  });

  it('is null when the product has no usable serving, so the screen offers 100 g', () => {
    expect(servingFrom(undefined)).toBeNull();
    expect(servingFrom(null)).toBeNull();
    expect(servingFrom('')).toBeNull();
    expect(servingFrom(0)).toBeNull();
    expect(servingFrom(-5)).toBeNull();
    expect(servingFrom('abc')).toBeNull();
    expect(servingFrom(5000)).toBeNull();
  });
});

describe('lookupBarcode: nobody has it, or Open Food Facts could not be asked', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown = {}) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it('is null only when Open Food Facts says it does not have the product', async () => {
    answer(404);
    await expect(lookupBarcode('5000159484695')).resolves.toBeNull();
    answer(200, { status: 0 });
    await expect(lookupBarcode('5000159484695')).resolves.toBeNull();
  });

  it('throws on an error answer or no connection, so the scan says try again instead of offering to add the product', async () => {
    answer(503);
    await expect(lookupBarcode('5000159484695')).rejects.toThrow(OFF_UNAVAILABLE);
    answer(429);
    await expect(lookupBarcode('5000159484695')).rejects.toThrow(OFF_UNAVAILABLE);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(lookupBarcode('5000159484695')).rejects.toThrow(OFF_UNAVAILABLE);
  });

  it('reads a product it has, per gram', async () => {
    answer(200, { status: 1, product: { product_name: 'Oat bar', nutriments: { proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 12 } } });
    await expect(lookupBarcode('5000159484695')).resolves.toMatchObject({ name: 'Oat bar', protein: 0.1, carbs: 0.6, fat: 0.12 });
  });
});

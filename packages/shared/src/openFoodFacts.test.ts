import { describe, expect, it } from 'vitest';
import { servingFrom } from './openFoodFacts';

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

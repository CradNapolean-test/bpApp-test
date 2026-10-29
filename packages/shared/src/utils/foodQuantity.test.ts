import { describe, expect, it } from 'vitest';
import { parseQuantity, quantityConfig, quantityProblem, scanSuggestedAmount } from './foodQuantity';

describe('quantityConfig', () => {
  it('uses grams for per-gram foods', () => {
    expect(quantityConfig({ portion: '1 gram' })).toMatchObject({ perGram: true, step: 5, defaultQuantity: 100, unit: 'g', presets: [50, 100, 150, 200] });
  });
  it('uses a count for foods with their own unit', () => {
    expect(quantityConfig({ portion: '1 Egg' })).toMatchObject({ perGram: false, step: 0.25, defaultQuantity: 1, unit: '×', presets: [0.5, 1, 2, 3] });
    expect(quantityConfig({ portion: null }).perGram).toBe(false);
  });
});

describe('parseQuantity', () => {
  it('reads numbers, including a comma decimal', () => {
    expect(parseQuantity('150')).toBe(150);
    expect(parseQuantity('1,5')).toBe(1.5);
  });
  it('treats empty, junk and negative as 0 so the box can be cleared and retyped', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('abc')).toBe(0);
    expect(parseQuantity('-3')).toBe(0);
  });
});

describe('quantityProblem', () => {
  it('needs more than zero', () => {
    expect(quantityProblem(true, 0)).toBe('The amount must be more than zero.');
    expect(quantityProblem(false, -1)).toBe('The amount must be more than zero.');
  });
  it('allows up to 2,000 grams or 50 portions (FS3, FS6)', () => {
    expect(quantityProblem(true, 2000)).toBeNull();
    expect(quantityProblem(true, 2001)).toBe('Grams can be at most 2,000.');
    expect(quantityProblem(false, 50)).toBeNull();
    expect(quantityProblem(false, 51)).toBe('Portions can be at most 50.');
    expect(quantityProblem(true, 500000)).toContain('at most 2,000');
  });
});

describe('scanSuggestedAmount (FT7)', () => {
  it('uses the pack serving for a food counted in grams, else 100 g', () => {
    expect(scanSuggestedAmount({ portion: '1 gram' }, 30)).toBe(30);
    expect(scanSuggestedAmount({ portion: '1 gram' }, null)).toBe(100);
  });
  it('starts a food counted in portions at its usual amount, whatever the serving size', () => {
    expect(scanSuggestedAmount({ portion: '1 Egg' }, 60)).toBe(1);
  });
});

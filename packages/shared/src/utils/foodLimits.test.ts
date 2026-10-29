import { describe, expect, it } from 'vitest';
import { FOOD_LIMITS, checkFoodNumber, firstFoodProblem } from './foodLimits';

describe('checkFoodNumber', () => {
  it('accepts a normal figure, and the limit itself', () => {
    expect(checkFoodNumber('150', 'grams')).toBeNull();
    expect(checkFoodNumber(FOOD_LIMITS.kcal, 'kcal')).toBeNull();
    expect(checkFoodNumber('0.5', 'portions')).toBeNull();
    expect(checkFoodNumber('0', 'grams')).toBeNull();
  });

  it('stops a figure above the limit and says what it is', () => {
    expect(checkFoodNumber('500000', 'grams')).toBe('Grams can be at most 2,000.');
    expect(checkFoodNumber('6000', 'kcal')).toBe('Calories can be at most 5,000.');
    expect(checkFoodNumber(51, 'portions')).toBe('Portions can be at most 50.');
  });

  it('stops negatives and text', () => {
    expect(checkFoodNumber('-5', 'grams')).toBe('Grams cannot be negative.');
    expect(checkFoodNumber('abc', 'kcal')).toBe('Calories must be a number.');
  });

  it('treats blank as an error unless blank is allowed (an optional macro)', () => {
    expect(checkFoodNumber('', 'grams')).toBe('Enter the grams.');
    expect(checkFoodNumber('  ', 'grams', { allowBlank: true })).toBeNull();
    expect(checkFoodNumber(null, 'kcal', { allowBlank: true })).toBeNull();
  });
});

describe('firstFoodProblem', () => {
  it('returns the first message, or null when all are fine', () => {
    expect(firstFoodProblem([null, 'Calories can be at most 5,000.', 'Grams cannot be negative.'])).toBe('Calories can be at most 5,000.');
    expect(firstFoodProblem([null, null])).toBeNull();
  });
});

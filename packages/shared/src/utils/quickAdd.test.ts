import { describe, expect, it } from 'vitest';
import { QUICK_ADD_NAME_MAX, quickAddText, readQuickAdd, type QuickAddText } from './quickAdd';

const box = (over: Partial<QuickAddText> = {}): QuickAddText => ({ name: 'Burger', calories: '', protein: '', carbs: '', fat: '', ...over });

describe('readQuickAdd', () => {
  it('reads a name and the figures that were typed, leaving the others unknown', () => {
    expect(readQuickAdd(box({ calories: '300' }))).toEqual({ fields: { name: 'Burger', calories: 300, protein: null, carbs: null, fat: null } });
    expect(readQuickAdd(box({ protein: '12,5', carbs: '30.04' }))).toEqual({ fields: { name: 'Burger', calories: null, protein: 12.5, carbs: 30, fat: null } });
  });
  it('trims the name and needs one', () => {
    expect(readQuickAdd(box({ name: '  Pizza ', fat: '8' }))).toMatchObject({ fields: { name: 'Pizza' } });
    expect(readQuickAdd(box({ name: '  ', calories: '100' }))).toEqual({ error: 'Give it a name.' });
    expect(readQuickAdd(box({ name: 'x'.repeat(QUICK_ADD_NAME_MAX + 1), calories: '100' }))).toMatchObject({ error: expect.stringContaining('100 characters') });
  });
  it('needs at least one figure', () => {
    expect(readQuickAdd(box())).toMatchObject({ error: expect.stringContaining('at least one') });
  });
  it('keeps every figure inside the ceilings (FS3)', () => {
    expect(readQuickAdd(box({ calories: '5000' }))).toHaveProperty('fields');
    expect(readQuickAdd(box({ calories: '5001' }))).toEqual({ error: 'Calories can be at most 5,000 kcal.' });
    expect(readQuickAdd(box({ calories: '5000000' }))).toHaveProperty('error');
    expect(readQuickAdd(box({ protein: '2001' }))).toEqual({ error: 'Protein can be at most 2,000 g.' });
    expect(readQuickAdd(box({ fat: '2000' }))).toHaveProperty('fields');
  });
  it('refuses text that is not a number, including a minus sign', () => {
    expect(readQuickAdd(box({ calories: 'abc' }))).toEqual({ error: 'Calories must be a number.' });
    expect(readQuickAdd(box({ carbs: '-5' }))).toEqual({ error: 'Carbs must be a number.' });
    expect(readQuickAdd(box({ carbs: '1e9' }))).toEqual({ error: 'Carbs must be a number.' });
  });
});

describe('quickAddText', () => {
  it('turns a saved Quick Add back into boxes, with empty boxes for unknown figures', () => {
    expect(quickAddText({ quick_add_name: 'Burger', quick_add_calories: 300, quick_add_protein: null, quick_add_carbs: 20.5, quick_add_fat: null }))
      .toEqual({ name: 'Burger', calories: '300', protein: '', carbs: '20.5', fat: '' });
  });
});

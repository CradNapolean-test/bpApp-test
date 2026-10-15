import { describe, expect, it } from 'vitest';
import { interpretTyped, shouldCommit } from './trackerInput';

describe('shouldCommit (R12, LT3)', () => {
  it('does not save when the slider was only tabbed onto or tapped without moving', () => {
    // Tab onto the Sleep slider: a key-up with the value showing 0 (nothing logged) and nothing changed.
    expect(shouldCommit(null, 0, false)).toBe(false);
    expect(shouldCommit(7, 7, false)).toBe(false);
  });

  it('saves a value the member actually moved to', () => {
    expect(shouldCommit(null, 6.5, true)).toBe(true);
    expect(shouldCommit(7, 8, true)).toBe(true);
  });

  it('saves a deliberate 0, because 0 hours is a value when someone dragged there', () => {
    expect(shouldCommit(null, 0, true)).toBe(true);
    expect(shouldCommit(5, 0, true)).toBe(true);
  });

  it('does not save when the slider was moved and put back where it started', () => {
    expect(shouldCommit(7, 7, true)).toBe(false);
  });

  it('saves taking a value away', () => {
    expect(shouldCommit(7, null, true)).toBe(true);
  });
});

describe('interpretTyped (R12, LT4)', () => {
  const sleep = { current: 7 as number | null, max: 24, whole: false };

  it('a cleared box clears the logged value, which is saved as null', () => {
    expect(interpretTyped('', sleep)).toEqual({ action: 'clear' });
    expect(interpretTyped('   ', sleep)).toEqual({ action: 'clear' });
  });

  it('a cleared box when nothing was logged changes nothing', () => {
    expect(interpretTyped('', { ...sleep, current: null })).toEqual({ action: 'ignore' });
  });

  it('typing a number sets it', () => {
    expect(interpretTyped('7.5', sleep)).toEqual({ action: 'set', value: 7.5 });
    expect(interpretTyped('0', sleep)).toEqual({ action: 'set', value: 0 });
  });

  it('typing the same figure is not a change', () => {
    expect(interpretTyped('7', sleep)).toEqual({ action: 'ignore' });
  });

  it('keeps the figure inside the limit and rounds like the slider', () => {
    expect(interpretTyped('99', sleep)).toEqual({ action: 'set', value: 24 });
    expect(interpretTyped('7.456', sleep)).toEqual({ action: 'set', value: 7.46 });
    expect(interpretTyped('8,500.6', { current: null, max: 100000, whole: true })).toEqual({ action: 'set', value: 8501 });
  });

  it('reads millilitres as litres', () => {
    expect(interpretTyped('750', { current: null, max: 10, whole: false, millilitres: true })).toEqual({ action: 'set', value: 0.75 });
  });

  it('ignores text that is not a figure, and negatives', () => {
    expect(interpretTyped('abc', sleep)).toEqual({ action: 'ignore' });
    expect(interpretTyped('-3', sleep)).toEqual({ action: 'ignore' });
    expect(interpretTyped('1.2.3', sleep)).toEqual({ action: 'ignore' });
  });
});

import { describe, expect, it } from 'vitest';
import { closesOnTab, menuKeyAction, tabKeyIndex } from './menuKeys';

describe('tabKeyIndex (a row of tabs)', () => {
  it('Right and Left move to the neighbouring tab and wrap', () => {
    expect(tabKeyIndex('ArrowRight', 0, 4)).toBe(1);
    expect(tabKeyIndex('ArrowRight', 3, 4)).toBe(0);
    expect(tabKeyIndex('ArrowLeft', 2, 4)).toBe(1);
    expect(tabKeyIndex('ArrowLeft', 0, 4)).toBe(3);
  });

  it('Home and End jump to the ends', () => {
    expect(tabKeyIndex('Home', 2, 4)).toBe(0);
    expect(tabKeyIndex('End', 1, 4)).toBe(3);
  });

  it('ignores up and down (they scroll the page), other keys and an empty row', () => {
    expect(tabKeyIndex('ArrowDown', 0, 4)).toBeNull();
    expect(tabKeyIndex('a', 0, 4)).toBeNull();
    expect(tabKeyIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('menuKeyAction', () => {
  it('ArrowDown moves to the next item and wraps from the last to the first', () => {
    expect(menuKeyAction('ArrowDown', 0, 3)).toEqual({ type: 'move', index: 1 });
    expect(menuKeyAction('ArrowDown', 2, 3)).toEqual({ type: 'move', index: 0 });
  });

  it('ArrowUp moves to the previous item and wraps from the first to the last', () => {
    expect(menuKeyAction('ArrowUp', 2, 3)).toEqual({ type: 'move', index: 1 });
    expect(menuKeyAction('ArrowUp', 0, 3)).toEqual({ type: 'move', index: 2 });
  });

  it('from the trigger (no item focused) ArrowDown goes to the first item and ArrowUp to the last', () => {
    expect(menuKeyAction('ArrowDown', -1, 4)).toEqual({ type: 'move', index: 0 });
    expect(menuKeyAction('ArrowUp', -1, 4)).toEqual({ type: 'move', index: 3 });
  });

  it('Home and End jump to the ends', () => {
    expect(menuKeyAction('Home', 2, 5)).toEqual({ type: 'move', index: 0 });
    expect(menuKeyAction('End', 1, 5)).toEqual({ type: 'move', index: 4 });
  });

  it('Escape closes from anywhere, even with no items', () => {
    expect(menuKeyAction('Escape', 1, 3)).toEqual({ type: 'close' });
    expect(menuKeyAction('Escape', -1, 0)).toEqual({ type: 'close' });
  });

  it('ignores other keys and an empty menu', () => {
    expect(menuKeyAction('a', 0, 3)).toBeNull();
    expect(menuKeyAction('Enter', 0, 3)).toBeNull();
    expect(menuKeyAction('ArrowDown', -1, 0)).toBeNull();
  });

  it('Tab leaves the menu', () => {
    expect(closesOnTab('Tab')).toBe(true);
    expect(closesOnTab('ArrowDown')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR, createDialogStack, nextDialogId, nextTabIndex } from './dialogFocus';

describe('nextTabIndex (the focus trap order)', () => {
  it('lets the browser move focus inside the dialog', () => {
    expect(nextTabIndex(4, 1, false)).toBeNull();
    expect(nextTabIndex(4, 2, true)).toBeNull();
  });

  it('wraps from the last to the first on Tab, and from the first to the last on Shift+Tab', () => {
    expect(nextTabIndex(4, 3, false)).toBe(0);
    expect(nextTabIndex(4, 0, true)).toBe(3);
  });

  it('brings focus back in when it has escaped the dialog', () => {
    expect(nextTabIndex(4, -1, false)).toBe(0);
    expect(nextTabIndex(4, -1, true)).toBe(3);
  });

  it('with one focusable thing, Tab stays on it', () => {
    expect(nextTabIndex(1, 0, false)).toBe(0);
    expect(nextTabIndex(1, 0, true)).toBe(0);
  });

  it('with nothing to focus, the dialog itself holds focus', () => {
    expect(nextTabIndex(0, -1, false)).toBe(-2);
  });
});

describe('createDialogStack (only the newest dialog answers Escape)', () => {
  it('the newest is on top, and the one below takes over when it closes', () => {
    const stack = createDialogStack();
    const sheet = stack.push();
    const confirm = stack.push();
    expect(stack.isTop(confirm)).toBe(true);
    expect(stack.isTop(sheet)).toBe(false);
    stack.remove(confirm);
    expect(stack.isTop(sheet)).toBe(true);
    expect(stack.size()).toBe(1);
  });

  it('nothing is on top when it is empty, and removing twice is harmless', () => {
    const stack = createDialogStack();
    const id = stack.push();
    stack.remove(id);
    stack.remove(id);
    expect(stack.isTop(id)).toBe(false);
    expect(stack.size()).toBe(0);
  });

  it('closing one in the middle keeps the order of the others', () => {
    const stack = createDialogStack();
    const a = stack.push();
    const b = stack.push();
    const c = stack.push();
    stack.remove(b);
    expect(stack.isTop(c)).toBe(true);
    stack.remove(c);
    expect(stack.isTop(a)).toBe(true);
  });
});

describe('ids and the selector', () => {
  it('gives every dialog its own id', () => {
    expect(nextDialogId('confirm')).not.toBe(nextDialogId('confirm'));
  });

  it('skips disabled controls and hidden inputs', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled]):not([type="hidden"])');
  });
});

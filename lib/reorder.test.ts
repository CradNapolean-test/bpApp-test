import { describe, expect, it } from 'vitest';
import { moveBy, moveTo, sameOrder } from './reorder';

describe('moveTo (dragging a lesson to another place, LB18)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('moves an item down past several', () => {
    expect(moveTo(ids, 0, 3)).toEqual(['b', 'c', 'd', 'a', 'e']);
  });

  it('moves an item up past several', () => {
    expect(moveTo(ids, 4, 1)).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('leaves the order alone for a drop in place or an index outside the list', () => {
    expect(moveTo(ids, 2, 2)).toEqual(ids);
    expect(moveTo(ids, -1, 2)).toEqual(ids);
    expect(moveTo(ids, 1, 9)).toEqual(ids);
  });

  it('never changes the list it is given', () => {
    const copy = [...ids];
    moveTo(ids, 0, 4);
    expect(ids).toEqual(copy);
  });
});

describe('moveBy (the Move up / Move down buttons and the keyboard)', () => {
  const ids = ['a', 'b', 'c'];

  it('moves one step', () => {
    expect(moveBy(ids, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(ids, 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('stops at the ends', () => {
    expect(moveBy(ids, 0, -1)).toEqual(ids);
    expect(moveBy(ids, 2, 1)).toEqual(ids);
    expect(moveBy(ids, 0, 10)).toEqual(['b', 'c', 'a']);
  });
});

describe('sameOrder', () => {
  it('compares orders', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { mayChangeEvent } from './eventPermissions';

describe('mayChangeEvent', () => {
  const mine = { created_by: 'coach-a' };

  it('the coach who added an event may change it', () => {
    expect(mayChangeEvent(mine, 'coach-a', false)).toBe(true);
  });

  it('another coach may not, unless they are a gym admin or the owner', () => {
    expect(mayChangeEvent(mine, 'coach-b', false)).toBe(false);
    expect(mayChangeEvent(mine, 'coach-b', true)).toBe(true);
  });

  it('an event with no author is for admins and the owner only; nobody signed in may change anything', () => {
    expect(mayChangeEvent({ created_by: null }, 'coach-a', false)).toBe(false);
    expect(mayChangeEvent({ created_by: null }, 'coach-a', true)).toBe(true);
    expect(mayChangeEvent(mine, null, false)).toBe(false);
    expect(mayChangeEvent({ created_by: null }, undefined, false)).toBe(false);
  });
});

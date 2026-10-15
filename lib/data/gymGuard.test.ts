import { describe, expect, it, vi } from 'vitest';

// withGymGuard opens its own database client; the other helpers take one in. Neither is needed for these tests.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { GYM_CHANGED_MESSAGE, GymChangedError, assertActiveGym, checkActiveGym, gymMatches } from './gymGuard';
import { firstFailure } from './result';

// A database client that only knows who the coach's active gym is (my_scoping_gym_id, the lookup every gym-scoped write uses).
function clientWithActiveGym(activeGymId: string | null) {
  const rpc = vi.fn(async (name: string) => (name === 'my_scoping_gym_id' ? { data: activeGymId, error: null } : { data: null, error: { message: 'unknown' } }));
  return { supabase: { rpc } as never, rpc };
}

describe('gymMatches', () => {
  it('lets a write through when the page was drawn for the active gym', () => {
    expect(gymMatches('gym-a', 'gym-a')).toBe(true);
  });
  it('stops a write when the active gym has moved on', () => {
    expect(gymMatches('gym-a', 'gym-b')).toBe(false);
    expect(gymMatches('gym-a', null)).toBe(false);
    expect(gymMatches('gym-a', undefined)).toBe(false);
  });
  it('cannot judge a page that did not say which gym it was drawn for', () => {
    expect(gymMatches(undefined, 'gym-b')).toBe(true);
    expect(gymMatches(null, 'gym-b')).toBe(true);
    expect(gymMatches('', 'gym-b')).toBe(true);
  });
});

describe('assertActiveGym', () => {
  it('does nothing when the gym is still the one the page was drawn for', async () => {
    const { supabase } = clientWithActiveGym('gym-a');
    await expect(assertActiveGym(supabase, 'gym-a')).resolves.toBeUndefined();
  });

  it('throws the friendly message when another tab switched gym', async () => {
    const { supabase } = clientWithActiveGym('gym-b');
    await expect(assertActiveGym(supabase, 'gym-a')).rejects.toThrow(GYM_CHANGED_MESSAGE);
    await expect(assertActiveGym(supabase, 'gym-a')).rejects.toBeInstanceOf(GymChangedError);
    expect(GYM_CHANGED_MESSAGE).toBe('You changed gym in another tab. Reload this page.');
  });

  it('does not ask the database when the page sent no gym', async () => {
    const { supabase, rpc } = clientWithActiveGym('gym-b');
    await assertActiveGym(supabase, undefined);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes a database failure on instead of treating it as a changed gym', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'connection lost' } }));
    await expect(assertActiveGym({ rpc } as never, 'gym-a')).rejects.toThrow('connection lost');
  });
});

describe('checkActiveGym', () => {
  it('hands back a failure a Server Action can return (thrown messages are hidden in production)', async () => {
    const { supabase } = clientWithActiveGym('gym-b');
    expect(await checkActiveGym(supabase, 'gym-a')).toEqual({ ok: false, error: GYM_CHANGED_MESSAGE });
  });

  it('returns null when the write may go ahead', async () => {
    const { supabase } = clientWithActiveGym('gym-a');
    expect(await checkActiveGym(supabase, 'gym-a')).toBeNull();
  });
});

describe('firstFailure', () => {
  it('finds the first refused result among several creates', () => {
    const refused = { ok: false as const, error: GYM_CHANGED_MESSAGE };
    expect(firstFailure([undefined, { ok: true }, refused])).toBe(refused);
  });
  it('is null when nothing was refused', () => {
    expect(firstFailure([undefined, { ok: true }, null])).toBeNull();
  });
});

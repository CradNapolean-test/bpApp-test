import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeSignInLink, getGymSignInLinks, recordSignInLink } from './signInLinks';

describe('describeSignInLink', () => {
  it('names who made it and for whom', () => {
    expect(describeSignInLink({ kind: 'member', madeByName: 'Sam Coach', madeForName: 'Jo Member' })).toBe('Sam Coach made a link for Jo Member');
    expect(describeSignInLink({ kind: 'new_coach', madeByName: 'owner@example.com', madeForName: 'alex@example.com' })).toBe(
      'owner@example.com made a link for new coach alex@example.com'
    );
  });

  it('says so when an account has gone since', () => {
    expect(describeSignInLink({ kind: 'member', madeByName: null, madeForName: '  ' })).toBe('Someone no longer here made a link for a member no longer here');
    expect(describeSignInLink({ kind: 'new_coach', madeByName: 'Sam', madeForName: null })).toBe('Sam made a link for new coach (account removed)');
  });
});

describe('recordSignInLink', () => {
  it('writes who made it, for whom, the gym and the kind, and answers whether it was written', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    await expect(recordSignInLink(admin, { gymId: 'g1', madeBy: 'c1', madeFor: 'm1', kind: 'member' })).resolves.toBe(true);
    expect(admin.from).toHaveBeenCalledWith('sign_in_links');
    expect(insert).toHaveBeenCalledWith({ gym_id: 'g1', made_by: 'c1', made_for: 'm1', kind: 'member' });

    insert.mockResolvedValue({ error: { message: 'relation "sign_in_links" does not exist' } });
    await expect(recordSignInLink(admin, { gymId: null, madeBy: 'c1', madeFor: 'm1', kind: 'member' })).resolves.toBe(false);
  });
});

describe('getGymSignInLinks', () => {
  it('maps the rows, and gives null when they cannot be read', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'l1', kind: 'new_coach', created_at: '2026-11-18T10:00:00Z', made_by: 'o1', made_by_name: 'Owner', made_for: 'c2', made_for_name: 'Alex' }],
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    await expect(getGymSignInLinks(supabase, 'g1')).resolves.toEqual([
      { id: 'l1', kind: 'new_coach', createdAt: '2026-11-18T10:00:00Z', madeById: 'o1', madeByName: 'Owner', madeForId: 'c2', madeForName: 'Alex' },
    ]);
    expect(rpc).toHaveBeenCalledWith('gym_sign_in_links', { p_gym: 'g1', p_limit: 20 });

    rpc.mockResolvedValue({ data: null, error: { message: 'Not authorized' } });
    await expect(getGymSignInLinks(supabase, 'g1')).resolves.toBeNull();
  });
});

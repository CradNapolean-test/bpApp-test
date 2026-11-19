import { beforeEach, describe, expect, it, vi } from 'vitest';

// The database client and the push are replaced: nothing here touches a real project or sends anything.
const MEMBER = 'member-1';
const GYM = 'gym-1';
const notices: unknown[] = [];
const pushes: { clientId: string; body: string }[] = [];
let gymZone: string | null = 'Europe/London';
const tables: Record<string, Record<string, unknown>> = {
  // The member's own timezone is far ahead of the gym's: the end of a day in London is already the next morning in Auckland.
  client_profiles: { client_id: MEMBER, timezone: 'Pacific/Auckland' },
  profiles: { id: MEMBER, gym_id: GYM },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        if (table === 'notifications') notices.push(row);
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'gyms' ? { id: GYM, timezone: gymZone } : (tables[table] ?? null), error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/push', () => ({
  pushQuietly: async (_label: string, send: () => Promise<unknown>) => send(),
  sendPushToClient: async (clientId: string, payload: { body: string }) => {
    pushes.push({ clientId, body: payload.body });
    return { sent: 1, failed: 0 };
  },
}));

import { notifyCreditsAdded } from './memberNotify';
import { wallTimeToIso } from './broadcastSend';

beforeEach(() => {
  notices.length = 0;
  pushes.length = 0;
  gymZone = 'Europe/London';
  tables.client_profiles = { client_id: MEMBER, timezone: 'Pacific/Auckland' };
});

describe('the "to use by" date when credits are added', () => {
  it('is the day the coach picked at the gym (23:59 there), not the member\'s own date', async () => {
    // What the coach's Credits tab saves for "expires 31 Dec" at a London gym (lib/creditsForm.ts).
    const expiresAt = wallTimeToIso('2026-12-31T23:59', 'Europe/London') as string;
    await notifyCreditsAdded(MEMBER, 5, expiresAt);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].body).toMatch(/to use by 31 Dec\b/);
    expect(JSON.stringify(notices)).toMatch(/to use by 31 Dec\b/);
    expect(pushes[0].body).not.toMatch(/1 Jan/);
  });

  it('and the same for a gym behind the member', async () => {
    // 23:59 on 31 Dec in Los Angeles is already 1 Jan in London.
    gymZone = 'America/Los_Angeles';
    tables.client_profiles = { client_id: MEMBER, timezone: 'Europe/London' };
    const expiresAt = wallTimeToIso('2026-12-31T23:59', 'America/Los_Angeles') as string;
    await notifyCreditsAdded(MEMBER, 2, expiresAt);
    expect(pushes[0].body).toMatch(/to use by 31 Dec\b/);
  });
});

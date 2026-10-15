import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The database client is replaced: nothing here touches a real project.
const updates: { values: unknown; column: string; value: string }[] = [];
let updateError: { message: string } | null = null;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'client_profiles') throw new Error(`unexpected table ${table}`);
      return {
        update: (values: unknown) => ({
          eq: async (column: string, value: string) => {
            updates.push({ values, column, value });
            return { error: updateError };
          },
        }),
      };
    },
  }),
}));

import { signUnsubscribeToken } from '@/lib/unsubscribeToken';
import { GET, POST } from './route';

const SECRET = 'route-test-secret';
const MEMBER = '5a1c7a4e-2f1b-4c10-9d0f-aaaaaaaaaaaa';
const env = process.env as Record<string, string | undefined>;
let saved: string | undefined;

const url = (token: string | null) => `https://app.example.com/unsubscribe${token === null ? '' : `?t=${encodeURIComponent(token)}`}`;

beforeEach(() => {
  saved = env.UNSUBSCRIBE_SECRET;
  env.UNSUBSCRIBE_SECRET = SECRET;
  updates.length = 0;
  updateError = null;
});

afterEach(() => {
  if (saved === undefined) delete env.UNSUBSCRIBE_SECRET;
  else env.UNSUBSCRIBE_SECRET = saved;
});

describe('GET /unsubscribe', () => {
  it('shows a confirm page and changes nothing (scanners open every link)', async () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    const res = await GET(new Request(url(token)));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<form method="post"');
    expect(updates).toHaveLength(0);
  });

  it('refuses a link that was not signed by this server', async () => {
    const res = await GET(new Request(url(signUnsubscribeToken(MEMBER, 'other-secret') as string)));
    expect(res.status).toBe(400);
    expect(await GET(new Request(url(null))).then((r) => r.status)).toBe(400);
  });

  it('is off until the secret is set', async () => {
    delete env.UNSUBSCRIBE_SECRET;
    expect((await GET(new Request(url('a.b')))).status).toBe(503);
  });
});

describe('POST /unsubscribe', () => {
  it('turns email off for the member the token was signed for, and only that', async () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    const res = await POST(new Request(url(token), { method: 'POST', body: 'List-Unsubscribe=One-Click' }));
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ values: { email_notifications_enabled: false }, column: 'client_id', value: MEMBER }]);
  });

  it('does nothing for a forged or damaged token', async () => {
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    const res = await POST(new Request(url(token.slice(0, -2)), { method: 'POST' }));
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('says so when the change could not be saved', async () => {
    updateError = { message: 'db down' };
    const token = signUnsubscribeToken(MEMBER, SECRET) as string;
    const res = await POST(new Request(url(token), { method: 'POST' }));
    expect(res.status).toBe(500);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Everything outside this route is replaced: no account is created, no email is sent, no real counter is touched.
const captureMessage = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));

const hits = new Map<string, number>();
let counterBroken = false;
vi.mock('@/lib/rateLimit', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rateLimit')>();
  return {
    ...real,
    adminRateStore: () => ({
      async hit(key: string) {
        if (counterBroken) throw new Error('db down');
        hits.set(key, (hits.get(key) ?? 0) + 1);
        return hits.get(key) as number;
      },
    }),
  };
});

let link: Record<string, unknown> | null = { coach_id: 'coach-1', active: true, expires_at: null, max_uses_per_day: 50 };
const inserted: unknown[] = [];
const deleted: string[] = [];
let profileError: { message: string } | null = null;
let createUserResult: { data: { user: { id: string } | null }; error: { message: string } | null } = { data: { user: { id: 'new-1' } }, error: null };
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'onboarding_links') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: link, error: null }) }) }) };
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { gym_id: 'gym-1' }, error: null }) }) }),
          insert: async (row: unknown) => {
            inserted.push(row);
            return { error: profileError };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        createUser: async () => createUserResult,
        deleteUser: async (id: string) => {
          deleted.push(id);
          return { error: null };
        },
      },
    },
  }),
}));

let signUpResult: { data: { user: { id: string; identities?: unknown[] } | null; session: unknown }; error: { message?: string; code?: string; status?: number } | null };
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signUp: async () => signUpResult } }) }));

import { POST } from './route';

const env = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};
const KEYS = ['JOIN_EMAIL_CONFIRMATION', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const request = (body: unknown, ip = '203.0.113.9') =>
  new Request('https://app.example.com/api/join', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } });
const good = { token: 'link-token', email: 'new.member@example.com', password: 'a-good-password' };

beforeEach(() => {
  for (const k of KEYS) saved[k] = env[k];
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  delete env.JOIN_EMAIL_CONFIRMATION;
  hits.clear();
  counterBroken = false;
  link = { coach_id: 'coach-1', active: true, expires_at: null, max_uses_per_day: 50 };
  inserted.length = 0;
  deleted.length = 0;
  profileError = null;
  createUserResult = { data: { user: { id: 'new-1' } }, error: null };
  signUpResult = { data: { user: { id: 'new-1', identities: [{ id: 'i' }] }, session: null }, error: null };
  captureMessage.mockReset();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe('sign-up with email confirmation (the default)', () => {
  it('creates the member and says to check email', async () => {
    const res = await POST(request(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, confirm: true });
    expect(inserted).toEqual([{ id: 'new-1', role: 'client', coach_id: 'coach-1', gym_id: 'gym-1', email: 'new.member@example.com' }]);
  });

  it('gives an existing address the same answer as a new one, and creates nothing', async () => {
    signUpResult = { data: { user: { id: 'fake', identities: [] }, session: null }, error: null };
    const res = await POST(request(good));
    expect(await res.json()).toEqual({ ok: true, confirm: true });
    expect(inserted).toHaveLength(0);
  });

  it('deletes the login when the profile cannot be written, and says the neutral thing', async () => {
    profileError = { message: 'insert failed: duplicate key value violates unique constraint' };
    const res = await POST(request(good));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('We could not create your account. Check your details or ask your coach.');
    expect(deleted).toEqual(['new-1']);
  });

  it('never repeats the provider\'s own words to the visitor, but logs them without the address', async () => {
    signUpResult = { data: { user: null, session: null }, error: { message: 'Database error saving new user for new.member@example.com' } };
    const res = await POST(request(good));
    const body = await res.json();
    expect(body.error).not.toMatch(/Database|new\.member/);
    expect(JSON.stringify(captureMessage.mock.calls)).not.toContain('new.member@example.com');
  });

  it('says to try later when the confirmation mailer is out of sends', async () => {
    signUpResult = { data: { user: null, session: null }, error: { code: 'over_email_send_rate_limit', status: 429 } };
    const res = await POST(request(good));
    expect(res.status).toBe(429);
  });
});

describe('the one-step flow (JOIN_EMAIL_CONFIRMATION=false)', () => {
  beforeEach(() => {
    env.JOIN_EMAIL_CONFIRMATION = 'false';
  });

  it('creates a confirmed account and says no email is needed', async () => {
    const res = await POST(request(good));
    expect(await res.json()).toEqual({ ok: true, confirm: false });
  });

  it('answers an existing address with the neutral message, not "already an account"', async () => {
    createUserResult = { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
    const res = await POST(request(good));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('We could not create your account. Check your details or ask your coach.');
    expect(body.error).not.toMatch(/already/i);
  });
});

describe('limits', () => {
  it('refuses the 6th attempt from one address in an hour with 429 and a Retry-After', async () => {
    const statuses: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      last = await POST(request(good));
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
  });

  it('lets sign-up through when the counter cannot be reached', async () => {
    counterBroken = true;
    const res = await POST(request(good));
    expect(res.status).toBe(200);
  });
});

describe('links and typing mistakes', () => {
  it('refuses a switched-off, missing or expired link with the "ask your coach" message', async () => {
    link = { coach_id: 'c', active: false };
    expect((await POST(request(good))).status).toBe(400);
    link = null;
    expect((await POST(request(good))).status).toBe(400);
    link = { coach_id: 'c', active: true, expires_at: '2020-01-01T00:00:00Z' };
    const res = await POST(request(good));
    expect((await res.json()).error).toMatch(/ask your coach/i);
  });

  it('asks for a valid email and a long enough password', async () => {
    expect((await (await POST(request({ ...good, email: 'nope' }))).json()).error).toMatch(/valid email/);
    expect((await (await POST(request({ ...good, password: 'short' }))).json()).error).toMatch(/8 characters/);
  });
});

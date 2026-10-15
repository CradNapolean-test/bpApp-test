import { beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase is replaced: no token is ever really verified.
const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a) } }) }));

import { GET, POST } from './route';
import type { NextRequest } from 'next/server';

const ORIGIN = 'https://app.example.com';
const asRequest = (r: Request) => r as unknown as NextRequest;

function post(fields: Record<string, string>) {
  return asRequest(new Request(`${ORIGIN}/auth/confirm`, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe('GET /auth/confirm (what a mail scanner opens)', () => {
  it('shows a Continue button and does NOT use the token', async () => {
    const res = await GET(asRequest(new Request(`${ORIGIN}/auth/confirm?token_hash=abc123&type=recovery&next=/reset-password`)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<button type="submit">Continue</button>');
    expect(html).toContain('name="token_hash" value="abc123"');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('puts only a safe path in the page, whatever next says', async () => {
    const res = await GET(asRequest(new Request(`${ORIGIN}/auth/confirm?token_hash=abc&type=recovery&next=${encodeURIComponent('https://evil.example')}`)));
    const html = await res.text();
    expect(html).toContain('name="next" value="/"');
    expect(html).not.toContain('evil.example');
  });

  it('escapes the token so it cannot break out of the page', async () => {
    const res = await GET(asRequest(new Request(`${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent('"><script>x()</script>')}&type=recovery`)));
    const html = await res.text();
    expect(html).not.toContain('<script>x()');
    expect(html).toContain('&lt;script&gt;');
  });

  it('goes to the sign-in page when there is nothing to verify', async () => {
    const res = await GET(asRequest(new Request(`${ORIGIN}/auth/confirm`)));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
  });

  it('ignores an unknown link type', async () => {
    const res = await GET(asRequest(new Request(`${ORIGIN}/auth/confirm?token_hash=abc&type=evil`)));
    expect(res.status).toBe(307);
  });
});

describe('POST /auth/confirm', () => {
  it('verifies the token and goes to the page asked for on this site', async () => {
    const res = await POST(post({ token_hash: 'abc123', type: 'recovery', next: '/reset-password' }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc123' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/reset-password`);
  });

  it('never redirects to another site (the open redirect)', async () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '']) {
      const res = await POST(post({ token_hash: 'abc', type: 'recovery', next }));
      expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    }
  });

  it('says the link has expired, with a way to get another, when the token is no good', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const res = await POST(post({ token_hash: 'abc', type: 'recovery', next: '/reset-password' }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('This link has expired');
    expect(html).toContain('href="/login"');
  });

  it('refuses a missing token or unknown type without asking Supabase', async () => {
    expect((await POST(post({ type: 'recovery' }))).status).toBe(400);
    expect((await POST(post({ token_hash: 'abc', type: 'nonsense' }))).status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

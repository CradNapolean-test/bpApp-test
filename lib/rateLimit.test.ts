import { describe, expect, it } from 'vitest';
import { DAY, HOUR, clientIpKey, decide, takeToken, windowStartMs, type RateStore } from './rateLimit';

// An in-memory store with the same behaviour as the database function: one counter per (key, window start).
function memoryStore() {
  const counts = new Map<string, number>();
  const store: RateStore = {
    async hit(key, windowStartIso) {
      const k = `${key}|${windowStartIso}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k) as number;
    },
  };
  return { store, counts };
}

const at = (iso: string) => new Date(iso).getTime();

describe('windowStartMs', () => {
  it('snaps to the start of the hour and of the day', () => {
    expect(new Date(windowStartMs(at('2026-10-16T14:37:12Z'), HOUR)).toISOString()).toBe('2026-10-16T14:00:00.000Z');
    expect(new Date(windowStartMs(at('2026-10-16T14:37:12Z'), DAY)).toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });
});

describe('decide', () => {
  it('allows up to the limit, and says how many are left', () => {
    const now = at('2026-10-16T14:10:00Z');
    expect(decide(1, 5, now, HOUR)).toMatchObject({ allowed: true, remaining: 4 });
    expect(decide(5, 5, now, HOUR)).toMatchObject({ allowed: true, remaining: 0 });
    expect(decide(6, 5, now, HOUR)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('says when the window resets', () => {
    expect(decide(9, 5, at('2026-10-16T14:50:00Z'), HOUR).retryAfterSeconds).toBe(600);
    expect(decide(9, 5, at('2026-10-16T14:59:59.500Z'), HOUR).retryAfterSeconds).toBe(1);
  });
});

describe('takeToken (5 tries per address per hour)', () => {
  it('lets 5 through and refuses the 6th and 7th', async () => {
    const { store } = memoryStore();
    const now = at('2026-10-16T14:10:00Z');
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await takeToken(store, 'join:ip:abc', 5, HOUR, { nowMs: now + i * 1000 })).allowed);
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });

  it('starts again in the next hour', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < 6; i++) await takeToken(store, 'k', 5, HOUR, { nowMs: at('2026-10-16T14:10:00Z') });
    expect((await takeToken(store, 'k', 5, HOUR, { nowMs: at('2026-10-16T14:55:00Z') })).allowed).toBe(false);
    expect((await takeToken(store, 'k', 5, HOUR, { nowMs: at('2026-10-16T15:00:01Z') })).allowed).toBe(true);
  });

  it('counts each key on its own', async () => {
    const { store } = memoryStore();
    const now = at('2026-10-16T14:10:00Z');
    for (let i = 0; i < 5; i++) await takeToken(store, 'join:ip:a', 5, HOUR, { nowMs: now });
    expect((await takeToken(store, 'join:ip:a', 5, HOUR, { nowMs: now })).allowed).toBe(false);
    expect((await takeToken(store, 'join:ip:b', 5, HOUR, { nowMs: now })).allowed).toBe(true);
  });

  it('50 per link per day', async () => {
    const { store } = memoryStore();
    const now = at('2026-10-16T09:00:00Z');
    let refused = 0;
    for (let i = 0; i < 53; i++) if (!(await takeToken(store, 'join:link:x', 50, DAY, { nowMs: now })).allowed) refused += 1;
    expect(refused).toBe(3);
  });

  it('when the counter cannot be reached, sign-up fails open and a paid or export route fails closed', async () => {
    const broken: RateStore = {
      async hit() {
        throw new Error('database down');
      },
    };
    const failures: unknown[] = [];
    const open = await takeToken(broken, 'k', 5, HOUR, { onError: 'allow', onFailure: (e) => failures.push(e) });
    const closed = await takeToken(broken, 'k', 5, HOUR, { onError: 'deny' });
    const byDefault = await takeToken(broken, 'k', 5, HOUR);
    expect(open.allowed).toBe(true);
    expect(closed.allowed).toBe(false);
    expect(byDefault.allowed).toBe(false);
    expect(failures).toHaveLength(1);
  });
});

describe('clientIpKey', () => {
  const req = (headers: Record<string, string>) => new Request('https://app.example.com/api/join', { headers });

  it('is the first forwarded address, hashed, so no address is stored', () => {
    const key = clientIpKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain('203');
    expect(clientIpKey(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe(key);
    expect(clientIpKey(req({ 'x-forwarded-for': '203.0.113.8' }))).not.toBe(key);
  });

  it('falls back to x-real-ip, then to a single "unknown" bucket', () => {
    expect(clientIpKey(req({ 'x-real-ip': '198.51.100.2' }))).toBe(clientIpKey(req({ 'x-forwarded-for': '198.51.100.2' })));
    expect(clientIpKey(req({}))).toBe(clientIpKey(req({})));
  });
});

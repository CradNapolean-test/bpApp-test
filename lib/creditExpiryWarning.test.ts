import { describe, expect, it, vi } from 'vitest';
import { EXPIRY_WARNING_DAYS, expiryWarningDetail, expiryWarningPush, sendExpiryWarnings, type ExpiryWarning } from './creditExpiryWarning';

// The database's side (one record per grant, claimed before the notice, a grant already recorded skipped) is in migration 0177 and is
// checked as text in migration0177.test.ts. Here the database is stood in for by a fake that keeps the same rule, to show what the job
// does over several runs: each grant is warned about once, a re-run the same day or the next sends nothing more.

const grant = (id: string, member: string, credits: number, expiresAt: string, warnFrom: string) => ({ id, member, credits, expiresAt, warnFrom });

function fakeDatabase(grants: ReturnType<typeof grant>[]) {
  const warned = new Set<string>();
  const notices: { member: string; text: string }[] = [];
  let now = '2026-11-26T03:30:00Z';
  const client = {
    rpc: vi.fn(async (_fn: 'warn_expiring_bonus_credits', args: { p_days: number }) => {
      const out: ExpiryWarning[] = [];
      for (const g of grants) {
        // Inside the window (the fake uses a precomputed "warn from" moment for `p_days` = 3), not expired, not warned yet.
        if (args.p_days !== 3 || now < g.warnFrom || now >= g.expiresAt || warned.has(g.id) || g.credits <= 0) continue;
        warned.add(g.id);
        const text = `${g.credits} bonus credit${g.credits === 1 ? ' expires' : 's expire'} on Sat 28 Nov. Book a session before then to use ${g.credits === 1 ? 'it' : 'them'}.`;
        notices.push({ member: g.member, text });
        out.push({ member_id: g.member, grant_id: g.id, credits_left: g.credits, grant_expires_at: g.expiresAt, notice: text });
      }
      return { data: out, error: null };
    }),
  };
  return { client, notices, setNow: (t: string) => (now = t) };
}

describe('sendExpiryWarnings (RO16)', () => {
  it('warns 3 days ahead', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(3);
  });

  it('warns once per grant: a second run the same day and the runs after it send nothing more', async () => {
    const db = fakeDatabase([
      grant('g1', 'm1', 3, '2026-11-28T23:59:00Z', '2026-11-25T23:59:00Z'),
      grant('g2', 'm2', 1, '2026-11-28T23:59:00Z', '2026-11-25T23:59:00Z'),
      grant('g3', 'm1', 2, '2026-12-10T23:59:00Z', '2026-12-07T23:59:00Z'),
    ]);
    const push = vi.fn(async () => undefined);

    expect(await sendExpiryWarnings(db.client, push)).toEqual({ state: 'sent', warned: 2 });
    expect(push).toHaveBeenCalledTimes(2);
    expect(await sendExpiryWarnings(db.client, push)).toEqual({ state: 'sent', warned: 0 });
    db.setNow('2026-11-27T03:30:00Z');
    expect(await sendExpiryWarnings(db.client, push)).toEqual({ state: 'sent', warned: 0 });
    expect(push).toHaveBeenCalledTimes(2);
    expect(db.notices).toHaveLength(2);

    // The later grant is warned about when its own window opens, once.
    db.setNow('2026-12-08T03:30:00Z');
    expect(await sendExpiryWarnings(db.client, push)).toEqual({ state: 'sent', warned: 1 });
    expect(await sendExpiryWarnings(db.client, push)).toEqual({ state: 'sent', warned: 0 });
    expect(push).toHaveBeenCalledTimes(3);
    expect(db.client.rpc).toHaveBeenCalledWith('warn_expiring_bonus_credits', { p_days: 3 });
  });

  it('pushes the same words as the in-app notice, to the member the grant belongs to', async () => {
    const db = fakeDatabase([grant('g1', 'm1', 3, '2026-11-28T23:59:00Z', '2026-11-25T23:59:00Z')]);
    const push = vi.fn(async () => undefined);
    await sendExpiryWarnings(db.client, push);
    expect(push).toHaveBeenCalledWith('m1', {
      title: '3 bonus credits expire soon',
      body: db.notices[0].text,
      url: '/dashboard?open=book',
      tag: 'credits-expiring-g1',
    });
  });

  it('pushes a repeated row only once', async () => {
    const row: ExpiryWarning = { member_id: 'm1', grant_id: 'g1', credits_left: 1, grant_expires_at: 'x', notice: 'n' };
    const push = vi.fn(async () => undefined);
    const client = { rpc: async () => ({ data: [row, row], error: null }) };
    expect(await sendExpiryWarnings(client, push)).toEqual({ state: 'sent', warned: 1 });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('skips the warnings, without failing, when migration 0177 is not applied', async () => {
    const push = vi.fn(async () => undefined);
    const client = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) };
    const result = await sendExpiryWarnings(client, push);
    expect(result).toEqual({ state: 'not available' });
    expect(expiryWarningDetail(result)).toBe('warnings: not available (migration 0177)');
    expect(push).not.toHaveBeenCalled();
  });

  it('reports a database failure, and a push that fails does not stop the others', async () => {
    expect(await sendExpiryWarnings({ rpc: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) }, vi.fn())).toEqual({
      state: 'failed',
      error: 'boom',
    });
    const rows: ExpiryWarning[] = ['g1', 'g2'].map((g) => ({ member_id: `m-${g}`, grant_id: g, credits_left: 1, grant_expires_at: 'x', notice: 'n' }));
    const push = vi.fn(async (member: string) => {
      if (member === 'm-g1') throw new Error('push service down');
    });
    expect(await sendExpiryWarnings({ rpc: async () => ({ data: rows, error: null }) }, push)).toEqual({ state: 'sent', warned: 2 });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('words the push title by the number of credits', () => {
    const base = { member_id: 'm', grant_id: 'g', grant_expires_at: 'x', notice: 'n' };
    expect(expiryWarningPush({ ...base, credits_left: 1 }).title).toBe('A bonus credit expires soon');
    expect(expiryWarningPush({ ...base, credits_left: 4 }).title).toBe('4 bonus credits expire soon');
    expect(expiryWarningDetail({ state: 'sent', warned: 2 })).toBe('warnings: 2');
  });
});

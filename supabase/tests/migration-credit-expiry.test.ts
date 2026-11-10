import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// RO1 (migration 0157): an expired bonus grant takes back only its own unspent part. Two halves, no database:
//  1. Static checks on the LATEST definitions after every migration is replayed in order. They fail on 0055's rule
//     ("least(grant, bonus balance)"), so a later migration cannot quietly bring it back.
//  2. A reference replay with the same rules as bonus_credit_lots (soonest expiry spent first, refunds back to the lot they came from,
//     a processed grant closes), run on the cases from the review. The old rule is run next to it to show what it got wrong.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; body: string; file: string; acl: unknown[] }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};
const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');

describe('expire_bonus_credits takes back only what is left of the expiring grant (RO1, 0157)', () => {
  it('no longer takes least(grant size, bonus balance)', () => {
    expect(code('expire_bonus_credits')).not.toMatch(/least\(\s*v_grant\.delta/);
  });

  it('asks bonus_credit_lots how much of this grant is unspent, and never takes more than the member has', () => {
    const body = code('expire_bonus_credits');
    expect(body).toMatch(/from public\.bonus_credit_lots\(v_grant\.client_id\) b\s+where b\.ledger_id = v_grant\.id/);
    expect(body).toMatch(/least\(coalesce\(v_unspent, 0\), greatest\(v_bonus_balance, 0\)\)/);
  });

  it('locks the member like grants, removals and refunds do, and stamps each grant once', () => {
    const body = code('expire_bonus_credits');
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\('credits:'/);
    expect(body).toMatch(/set expired_at = now\(\) where id = v_grant\.id/);
    expect(body).toMatch(/expired_at is null/);
  });

  it('works through each member\'s grants in the same order the replay spends them', () => {
    expect(code('expire_bonus_credits')).toMatch(/order by client_id, expires_at, created_at, id/);
    expect(code('bonus_credit_lots')).toMatch(/order by x\.happened, x\.step, x\.id/);
  });

  it('the replay spends the soonest expiry first, returns refunds to the lots a booking used, and closes a processed grant', () => {
    const body = code('bonus_credit_lots');
    expect(body).toMatch(/v_expires\[i\] < v_expires\[v_best\]/);
    expect(body).toMatch(/v_draw_booking\[i\] = e\.booking_id/);
    expect(body).toMatch(/v_open\[v_best\] := false/);
  });

  it('neither function can be called from the app', () => {
    expect(access(latest('bonus_credit_lots'))).toEqual({ anon: false, authenticated: false });
    expect(access(latest('expire_bonus_credits'))).toEqual({ anon: false, authenticated: false });
  });
});

// ---- reference replay (same rules as public.bonus_credit_lots) ----
type Row = { id: string; t: number; delta: number; booking?: string; expiresAt?: number; expiredAt?: number };

function unspentByGrant(rows: Row[]): Map<string, number> {
  type Lot = { id: string; unspent: number; expires: number | null; open: boolean };
  const lots: Lot[] = [];
  const draws: { booking: string; lot: Lot; amount: number }[] = [];
  let debt = 0;
  const events = [
    ...rows.filter((r) => r.delta > 0).map((r) => ({ r, t: r.t, step: 1 })),
    ...rows.filter((r) => r.delta < 0).map((r) => ({ r, t: r.t, step: 2 })),
    ...rows.filter((r) => r.delta > 0 && !r.booking && r.expiredAt != null).map((r) => ({ r, t: r.expiredAt as number, step: 3 })),
  ].sort((a, b) => a.t - b.t || a.step - b.step || a.r.id.localeCompare(b.r.id));
  for (const { r, step } of events) {
    if (step === 1) {
      let need = r.delta;
      const pay = Math.min(need, debt);
      debt -= pay;
      need -= pay;
      if (r.booking) {
        for (const d of [...draws].reverse()) {
          if (need === 0) break;
          if (d.booking !== r.booking || d.amount === 0 || !d.lot.open) continue;
          const back = Math.min(need, d.amount);
          d.lot.unspent += back;
          d.amount -= back;
          need -= back;
        }
        if (need > 0) lots.push({ id: r.id, unspent: need, expires: null, open: true });
      } else {
        lots.push({ id: r.id, unspent: need, expires: r.expiresAt ?? null, open: true });
      }
    } else if (step === 2) {
      let need = -r.delta;
      while (need > 0) {
        let best: Lot | null = null;
        for (const l of lots) {
          if (l.open && l.unspent > 0 && (best == null || (l.expires != null && (best.expires == null || l.expires < best.expires)))) best = l;
        }
        if (!best) break;
        const take = Math.min(need, best.unspent);
        best.unspent -= take;
        need -= take;
        if (r.booking) draws.push({ booking: r.booking, lot: best, amount: take });
      }
      debt += need;
    } else {
      const lot = lots.find((l) => l.id === r.id);
      if (lot) {
        if (lot.unspent === 0) lot.open = false;
        else lot.expires = null;
      }
    }
  }
  return new Map(lots.map((l) => [l.id, l.unspent]));
}

const balance = (rows: Row[]) => rows.reduce((s, r) => s + r.delta, 0);
const newClawback = (rows: Row[], grant: string) => Math.min(unspentByGrant(rows).get(grant) ?? 0, Math.max(balance(rows), 0));
const oldClawback = (rows: Row[], grant: string) => Math.min((rows.find((r) => r.id === grant) as Row).delta, Math.max(balance(rows), 0));
const spend = (id: string, t: number, n: number): Row => ({ id, t, delta: -n, booking: `b-${id}` });

describe('reference replay: what an expiry takes back', () => {
  it('8 of a 10-pack used, a second 10-pack bought, the first expires: 2 go, not 10 (the review\'s example)', () => {
    const rows: Row[] = [
      { id: 'a', t: 1, delta: 10, expiresAt: 30 },
      ...Array.from({ length: 8 }, (_, i) => spend(`s${i}`, 2 + i, 1)),
      { id: 'b', t: 20, delta: 10, expiresAt: 60 },
    ];
    expect(newClawback(rows, 'a')).toBe(2);
    expect(oldClawback(rows, 'a')).toBe(10);
  });

  it('a used "Extra session" takes nothing when it expires, even with other bonus credits', () => {
    const rows: Row[] = [{ id: 'goodwill', t: 1, delta: 5 }, { id: 'extra', t: 2, delta: 1, expiresAt: 9 }, spend('s', 3, 1)];
    expect(newClawback(rows, 'extra')).toBe(0);
    expect(oldClawback(rows, 'extra')).toBe(1);
  });

  it('a cancelled booking gives its credit back to the pack, so the whole unused pack expires', () => {
    const rows: Row[] = [{ id: 'goodwill', t: 1, delta: 3 }, { id: 'pack', t: 2, delta: 10, expiresAt: 30 }, spend('s', 3, 1), { id: 'r', t: 4, delta: 1, booking: 'b-s' }];
    expect(newClawback(rows, 'pack')).toBe(10);
  });

  it('a pack bought after other credits were spent is still all unspent', () => {
    const rows: Row[] = [{ id: 'goodwill', t: 1, delta: 10 }, ...Array.from({ length: 8 }, (_, i) => spend(`s${i}`, 2 + i, 1)), { id: 'pack', t: 20, delta: 10, expiresAt: 30 }];
    expect(newClawback(rows, 'pack')).toBe(10);
  });

  it('two packs expiring together: each takes only its own unspent part, and the total matches the balance', () => {
    const base: Row[] = [{ id: 'p1', t: 1, delta: 5, expiresAt: 30 }, { id: 'p2', t: 2, delta: 5, expiresAt: 30 }, { id: 'keep', t: 3, delta: 4 }, spend('s', 4, 6)];
    expect(newClawback(base, 'p1')).toBe(0);
    expect(newClawback(base, 'p2')).toBe(4);
    // After the job: p1 processed (nothing taken), p2 processed (4 taken). What is left is the never-expiring grant, untouched.
    const after: Row[] = [
      { ...base[0], expiredAt: 31 },
      { ...base[1], expiredAt: 31 },
      base[2],
      base[3],
      { id: 'x2', t: 31, delta: -4 },
    ];
    const left = unspentByGrant(after);
    expect(left.get('keep')).toBe(4);
    expect([...left.values()].reduce((s, n) => s + n, 0)).toBe(balance(after));
  });

  it('a refund after the pack was processed stays as a credit that does not expire', () => {
    const rows: Row[] = [
      { id: 'pack', t: 1, delta: 2, expiresAt: 30, expiredAt: 31 },
      spend('s', 2, 1),
      { id: 'x', t: 31, delta: -1 },
      { id: 'r', t: 32, delta: 1, booking: 'b-s' },
    ];
    const left = unspentByGrant(rows);
    expect(left.get('pack')).toBe(0);
    expect(left.get('r')).toBe(1);
  });
});

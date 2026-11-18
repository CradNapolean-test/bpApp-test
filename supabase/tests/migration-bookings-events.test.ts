import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0171 (no database): D13a, D13b, events and sign-in links. They read the LATEST definition of each function
// after every migration is replayed in order. The behaviour needs write tests with test accounts (listed in the migration's header).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; body: string; file: string; acl: unknown[]; securityDefiner: boolean; searchPath: string | null }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};
const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
// Comments in a body must not satisfy or break a check.
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');
const file = '0171_bookings_events_signin_links.sql';
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations', file), 'utf8').replace(/\r\n/g, '\n');
// The md5 the guard compares: the body with every run of white space squeezed to one space, trimmed (as the SQL does with prosrc).
const bodyMd5 = (body: string) => crypto.createHash('md5').update(body.replace(/\s+/g, ' ').trim()).digest('hex');

// Every definition of a function, in apply order (parseFunctions keeps only the last one).
const migrationsDir = path.resolve(__dirname, '../migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
function definitionsOf(name: string): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?(\\$[a-z_]*\\$)`, 'gi');
  for (const f of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8').replace(/\r\n/g, '\n');
    for (const m of sql.matchAll(re)) {
      const start = (m.index ?? 0) + m[0].length;
      out.push({ file: f, body: sql.slice(start, sql.indexOf(m[1], start)) });
    }
  }
  return out;
}

// The functions this file replaces, the migration each must come from, and that body's md5.
const guardRows = [...migration.matchAll(/\('(\w+)', '(\d{4})', array\[([^\]]*)\]\)/g)].map((m) => ({
  name: m[1],
  from: m[2],
  accepted: [...m[3].matchAll(/'([0-9a-f]{32})'/g)].map((a) => a[1]),
}));

describe('migration 0171 is safe to paste into the SQL editor', () => {
  it('stops before changing anything when a replaced function is not the expected one', () => {
    const guardAt = migration.indexOf('do $guard$');
    expect(guardAt).toBeGreaterThan(0);
    // Nothing is created, altered or dropped above the guard.
    expect(migration.slice(0, guardAt).replace(/--.*$/gm, '')).not.toMatch(/\b(create|alter|drop|insert|update|delete)\b/i);
    expect(migration).toMatch(/raise exception '% is not the one from migration %/);
  });

  it('the guard accepts exactly the old body and this file\'s body of every function it replaces', () => {
    expect(guardRows.length).toBeGreaterThan(0);
    for (const row of guardRows) {
      const all = definitionsOf(row.name);
      const before = all.filter((f) => f.file < file);
      const mine = all.filter((f) => f.file === file);
      // The last definition before this file is the one named, so the live body should be it; this file defines it once.
      expect(before[before.length - 1]?.file.slice(0, 4), `${row.name}: latest before 0171`).toBe(row.from);
      expect(mine.length, row.name).toBe(1);
      expect(row.accepted, row.name).toEqual([bodyMd5(before[before.length - 1].body), bodyMd5(mine[0].body)]);
      expect(bodyMd5(latest(row.name).body), row.name).toBe(row.accepted[1]);
    }
  });

  it('every function this file replaces is in the guard', () => {
    const mine = fns.filter((f) => f.file === file).map((f) => f.name);
    const replaced = mine.filter((n) => definitionsOf(n).some((d) => d.file < file));
    expect([...new Set(replaced)].sort()).toEqual(guardRows.map((r) => r.name).sort());
  });

  it('can be run twice and shares no temporary table between statements', () => {
    const sql = migration.replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/temporary table|temp table/i);
    expect(sql).not.toMatch(/create function /i);
    expect(sql).not.toMatch(/create table (?!if not exists)/i);
    expect(sql).not.toMatch(/add column (?!if not exists)/i);
    for (const m of sql.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) {
      expect(sql, m[1]).toContain(`drop policy if exists "${m[1]}" on ${m[2]}`);
    }
  });

  it('has read-only PRE-FLIGHT and AFTER queries and says when to apply it', () => {
    expect(migration).toMatch(/PRE-FLIGHT \(read-only\)/);
    expect(migration).toMatch(/AFTER \(read-only\)/);
    expect(migration).toMatch(/BEFORE the web app/);
  });

  it('every function it adds or replaces runs with a pinned search path', () => {
    for (const f of fns.filter((g) => g.file === file && g.securityDefiner)) expect(f.searchPath, f.name).toBe('public');
  });
});

describe('D13a: a plan\'s end cancels and refunds its member\'s upcoming bookings', () => {
  it('cancels only sessions that have not started, in the gym\'s timezone', () => {
    const body = code('cancel_bookings_for_ended_plan');
    expect(body).toMatch(/b\.status in \('booked', 'waitlist'\)/);
    expect(body).toMatch(/\(b\.booking_date \+ coalesce\(c\.start_time, time '00:00'\)\) at time zone coalesce\(nullif\(g\.timezone, ''\), 'UTC'\)\) > now\(\)/);
  });

  it('refunds through the one shared refund function and gives the place to the waitlist', () => {
    const body = code('cancel_bookings_for_ended_plan');
    expect(body).toMatch(/refund_booking_credits\(v_booking\.id, 'Refunded ' \|\| v_booking\.name \|\| ' \(plan ended\)'\)/);
    expect(body).toMatch(/promote_from_waitlist\(v_booking\.class_id, v_booking\.booking_date\)/);
    // The ledger only gains rows: nothing here updates or deletes it.
    expect(body).not.toMatch(/(update|delete from) credits_ledger/);
  });

  it('a refund is only made once, even if the booking was cancelled meanwhile', () => {
    expect(code('cancel_bookings_for_ended_plan')).toMatch(/where id = v_booking\.id and status in \('booked', 'waitlist'\);\s+if not found then\s+continue;/);
  });

  it('clear_membership_credits cancels the bookings before clearing, so refunded weekly credits are cleared too', () => {
    const body = code('clear_membership_credits');
    const cancelAt = body.indexOf('cancel_bookings_for_ended_plan(p_client_id)');
    expect(cancelAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(body.indexOf("'membership ended'"));
  });

  it('both ways a plan ends go through clear_membership_credits, and changing a plan does not', () => {
    expect(code('end_membership')).toMatch(/perform clear_membership_credits\(v_m\.client_id\)/);
    expect(code('replenish_due_memberships')).toMatch(/clear_membership_credits\(v_membership\.client_id\)/);
    expect(code('start_membership')).not.toMatch(/clear_membership_credits|cancel_bookings_for_ended_plan/);
  });

  it('only other database functions can call either', () => {
    for (const name of ['cancel_bookings_for_ended_plan', 'clear_membership_credits']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: false });
    }
  });
});

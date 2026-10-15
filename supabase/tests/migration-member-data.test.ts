import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0136 (fix brief 06): the latest definition of each function after every migration is replayed. The live
// behaviour needs a sandbox project.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; body: string; securityDefiner: boolean }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');
const migration = readFileSync(new URL('../migrations/0136_member_data_correctness.sql', import.meta.url), 'utf8');

describe('daily_logs.calories (R11)', () => {
  it('adds a nullable column, so existing rows are untouched', () => {
    expect(migration).toMatch(/alter table public\.daily_logs add column if not exists calories numeric;/);
    expect(migration).not.toMatch(/calories numeric not null/i);
  });

  it('bounds it like a typed entry and can be run again', () => {
    expect(migration).toMatch(/drop constraint if exists daily_logs_calories_range/);
    expect(migration).toMatch(/calories is null or \(calories >= 0 and calories <= 100000\)/);
  });
});

describe('member_reward_progress (RW1)', () => {
  const body = code('member_reward_progress');

  it('counts attended bookings that were not cancelled, as Home does', () => {
    expect(body).toMatch(/b\.attended and b\.status is distinct from 'cancelled'/);
  });

  it('is still only for the caller and their gym, and signed-in only', () => {
    expect(body).toMatch(/p\.id = auth\.uid\(\)/);
    expect(body).toMatch(/public\.client_gym_id\(p\.id\) = public\.my_gym_id\(\)/);
    expect(latest('member_reward_progress').securityDefiner).toBe(true);
    expect(access(latest('member_reward_progress'))).toEqual({ anon: false, authenticated: true });
  });
});

describe('mark_all_notifications_read (NO1)', () => {
  const body = code('mark_all_notifications_read');

  it('marks only the callers own unread notifications', () => {
    expect(body).toMatch(/update notifications set read_at = now\(\) where client_id = auth\.uid\(\) and read_at is null/);
  });

  it('refuses a caller who is not signed in and is not open to anon', () => {
    expect(body).toMatch(/auth\.uid\(\) is null/);
    expect(access(latest('mark_all_notifications_read'))).toEqual({ anon: false, authenticated: true });
    expect(latest('mark_all_notifications_read').securityDefiner).toBe(true);
  });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0141 (fix brief 05, CP1/SP1): coach_unread_total() must count exactly what get_coach_chat_overview() sums.
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

describe('coach_unread_total (CP1)', () => {
  const body = code('coach_unread_total');

  it('is signed-in only and not callable by anon', () => {
    expect(access(latest('coach_unread_total'))).toEqual({ anon: false, authenticated: true });
    expect(latest('coach_unread_total').securityDefiner).toBe(true);
  });

  it('counts only the caller\'s own members\' threads', () => {
    expect(body).toMatch(/p\.coach_id = auth\.uid\(\)/);
  });

  it('counts messages the caller did not send, newer than the coach\'s last read', () => {
    expect(body).toMatch(/cm\.sender_id is distinct from auth\.uid\(\)/);
    expect(body).toMatch(/cm\.created_at > coalesce\(ct\.coach_last_read_at, '-infinity'::timestamptz\)/);
  });

  it('uses the same unread rule as the inbox overview it replaces for the badge', () => {
    const overview = code('get_coach_chat_overview');
    expect(overview).toMatch(/cm\.sender_id <> auth\.uid\(\)/);
    expect(overview).toMatch(/cm\.created_at > coalesce\(ct\.coach_last_read_at, '-infinity'::timestamptz\)/);
  });
});

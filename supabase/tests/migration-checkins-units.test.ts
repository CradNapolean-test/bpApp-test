import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on migration 0170 (check-ins and units, live review decisions of 11 Nov 2026, batch 8).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; file: string; body: string; securityDefiner: boolean; searchPath: string | null }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const dir = path.resolve(__dirname, '../migrations');
const file = fs.readdirSync(dir).find((f) => f.startsWith('0170_'));
const raw = file ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
const sql = raw.replace(/--.*$/gm, '');

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
// What the guard compares: md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))).
const bodyMd5 = (body: string) => createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, '')).digest('hex');
const guard = /do \$guard\$([\s\S]*?)\$guard\$/.exec(sql)?.[1] ?? '';

describe('migration 0170', () => {
  it('exists, uses no temporary tables, and has read-only checks in its header', () => {
    expect(file).toBeTruthy();
    expect(sql).not.toMatch(/create\s+(?:temp|temporary)\s+table/i);
    expect(raw).toMatch(/PRE-FLIGHT \(read-only\)/);
    expect(raw).toMatch(/AFTER \(read-only\)/);
    expect(raw).toMatch(/APPLY THIS BEFORE THE CODE DEPLOYS/);
  });

  it('refuses to run over a read rule or function that is not the expected one', () => {
    expect(guard).toMatch(/raise exception/);
    // The 0087 rule, and this file's, as the guard squeezes them.
    expect(guard).toContain("'owns_clientclient_idoris_same_gym_as_clientclient_id'");
    expect(guard).toContain("'is_coach_ofclient_idoris_same_gym_as_clientclient_id'");
    const md5 = bodyMd5(latest('my_checkin_reviews').body);
    expect(guard).toContain(md5);
    expect(raw.split(md5).length - 1).toBeGreaterThanOrEqual(2); // in the guard and in the header's AFTER
  });
});

describe('D7: the member sees which of their weeks and forms were reviewed, and nothing else of coach_reviews', () => {
  it('my_checkin_reviews reads only the signed-in member\'s week and form marks, with the coach\'s first name', () => {
    const fn = latest('my_checkin_reviews');
    expect(fn.file).toMatch(/^0170_/);
    expect(fn.securityDefiner).toBe(true);
    expect(fn.searchPath).toBe('public');
    expect(access(fn)).toEqual({ anon: false, authenticated: true });
    expect(fn.body).toMatch(/where r\.client_id = auth\.uid\(\)\s+and r\.kind in \('week', 'form'\)/);
    expect(fn.body).toMatch(/split_part\(btrim\(coalesce\(p\.display_name, ''\)\), ' ', 1\)/);
    // No email, and no coach id handed back.
    expect(fn.body).not.toMatch(/email|reviewed_by\s*,|r\.\*/);
  });

  it('the table\'s read rule no longer lets the member in; the coach-side rules stay as they were', () => {
    const policies = replayPolicies().get('coach_reviews');
    expect(policies && [...policies.entries()].sort()).toEqual([
      ['coach adds coach_reviews', 'insert'],
      ['coach removes coach_reviews', 'delete'],
      ['read coach_reviews', 'select'],
    ]);
    const created = [...sql.matchAll(/create\s+policy[^;]*on\s+public\.coach_reviews[^;]*;/gi)].map((m) => m[0]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/for select\s+using \(public\.is_coach_of\(client_id\) or public\.is_same_gym_as_client\(client_id\)\);/);
    expect(created[0]).not.toMatch(/owns_client|is_self/);
  });

  it('writes nothing to coach_reviews', () => {
    expect(sql).not.toMatch(/(?:insert into|update|delete from)\s+(?:public\.)?coach_reviews/i);
  });
});

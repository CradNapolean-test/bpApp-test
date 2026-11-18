import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Static checks on migration 0160 (messages and push, live review decisions of 11 Nov 2026).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; file: string; body: string; securityDefiner: boolean; searchPath: string | null }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const dir = path.resolve(__dirname, '../migrations');
const file = fs.readdirSync(dir).find((f) => f.startsWith('0160_'));
const raw = file ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
const sql = raw.replace(/--.*$/gm, '');

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');
// What the guard compares: md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))).
const bodyMd5 = (body: string) => createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, '')).digest('hex');
const bodyIn = (name: string, migration: string) => {
  const match = fns.find((f) => f.name === name && f.file.startsWith(migration));
  if (match) return match.body;
  // parseFunctions keeps only the latest definition of each function, so earlier ones are read from their file.
  const text = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith(migration)) as string), 'utf8').replace(/\r\n/g, '\n');
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\)\\s*(?:returns[\\s\\S]*?)?(\\$[a-z_]*\\$)`, 'i');
  const m = re.exec(text);
  if (!m) throw new Error(`${name} not found in ${migration}`);
  const start = m.index + m[0].length;
  return text.slice(start, text.indexOf(m[1], start));
};

describe('migration 0160', () => {
  it('exists, uses no temporary tables, and has read-only checks in its header', () => {
    expect(file).toBeTruthy();
    expect(sql).not.toMatch(/create\s+(?:temp|temporary)\s+table/i);
    expect(raw).toMatch(/PRE-FLIGHT \(read-only\)/);
    expect(raw).toMatch(/AFTER \(read-only\)/);
  });

  it('refuses to run over functions that are not the expected ones (guard on every function it replaces)', () => {
    const guard = /do \$guard\$([\s\S]*?)\$guard\$/.exec(sql)?.[1] ?? '';
    expect(guard).toBeTruthy();
    for (const [name, from] of [
      ['create_communication', '0097'],
      ['send_due_communications', '0133'],
    ] as const) {
      const before = bodyMd5(bodyIn(name, from));
      const after = bodyMd5(latest(name).body);
      expect(guard, `${name} before`).toContain(before);
      expect(guard, `${name} after`).toContain(after);
      expect(raw, `${name} header`).toContain(before);
      expect(raw, `${name} header`).toContain(after);
    }
    expect(guard).toMatch(/raise exception/);
  });
});

describe('D21: a whole-gym broadcast goes into the sender\'s own members\' chats only', () => {
  it('create_communication posts a whole-gym message only to the caller\'s own members, and still returns everyone for the email', () => {
    expect(latest('create_communication').file).toMatch(/^0160_/);
    const body = code('create_communication');
    expect(body).toMatch(/p_target <> 'gym' or exists \(select 1 from profiles c where c\.id = v_client and c\.coach_id = auth\.uid\(\)\)/);
    // The recipients list is filled before the message condition, so the email still reaches the whole gym.
    expect(body.indexOf('v_recipients := v_recipients || v_client')).toBeLessThan(body.indexOf("p_target <> 'gym'"));
    expect(access(latest('create_communication'))).toEqual({ anon: false, authenticated: true });
  });

  it('send_due_communications does the same for scheduled and repeating broadcasts (old "all_clients" rows too)', () => {
    expect(latest('send_due_communications').file).toMatch(/^0160_/);
    const body = code('send_due_communications');
    expect(body).toMatch(/v_comm\.target_type not in \('gym', 'all_clients'\)\s+or exists \(select 1 from profiles c where c\.id = r\.id and c\.coach_id = v_comm\.coach_id\)/);
    expect(access(latest('send_due_communications'))).toEqual({ anon: false, authenticated: false });
  });

  it('leaves messages already sent alone', () => {
    expect(sql).not.toMatch(/delete\s+from\s+(?:public\.)?chat_messages/i);
    expect(sql).not.toMatch(/update\s+(?:public\.)?chat_messages/i);
  });
});

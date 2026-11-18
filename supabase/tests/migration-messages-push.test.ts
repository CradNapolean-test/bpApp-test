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
      ['get_coach_chat_overview', '0086'],
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

describe('MS10: "No reply needed"', () => {
  it('adds the stamp to chat_threads, and can be run twice', () => {
    expect(sql).toMatch(/alter table public\.chat_threads add column if not exists coach_no_reply_at timestamptz/);
    expect(sql).toMatch(/drop function if exists public\.get_coach_chat_overview\(\);/);
  });

  it('opens no new rule on the chat tables: chat stays the member\'s and their own coach\'s (0153)', () => {
    expect(sql).not.toMatch(/create\s+policy[^;]*chat_(?:messages|threads)/i);
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*chat_threads/i);
  });

  it('set_chat_no_reply is for the member\'s own coach only, and marks the thread read', () => {
    const fn = latest('set_chat_no_reply');
    expect(fn.securityDefiner).toBe(true);
    expect(fn.searchPath).toBe('public');
    expect(access(fn)).toEqual({ anon: false, authenticated: true });
    const body = code('set_chat_no_reply');
    expect(body).toMatch(/if p_client_id is null or not coalesce\(public\.is_coach_of\(p_client_id\), false\) then\s+raise exception/);
    expect(body).toMatch(/coach_no_reply_at = now\(\)/);
    expect(body).toMatch(/coach_last_read_at = greatest\(chat_threads\.coach_last_read_at, now\(\)\)/);
    expect(body).toMatch(/set coach_no_reply_at = null/);
  });

  it('the inbox overview returns the stamp, still for the caller\'s own members only, with the same unread rule', () => {
    const fn = latest('get_coach_chat_overview');
    expect(fn.file).toMatch(/^0160_/);
    expect(fn.securityDefiner).toBe(true);
    expect(access(fn)).toEqual({ anon: false, authenticated: true });
    const body = code('get_coach_chat_overview');
    expect(body).toMatch(/ct\.coach_no_reply_at/);
    expect(body).toMatch(/where p\.coach_id = auth\.uid\(\)/);
    expect(body).toMatch(/cm\.sender_id <> auth\.uid\(\)/);
    expect(sql).toMatch(/no_reply_at timestamptz\s*\)/);
  });
});

describe('D20: session reminders are recorded once per booking', () => {
  it('session_reminders is keyed by the booking, goes with it, and is service-role only', () => {
    expect(sql).toMatch(/create table if not exists public\.session_reminders \(\s*booking_id uuid primary key references public\.bookings\(id\) on delete cascade/);
    expect(sql).toMatch(/alter table public\.session_reminders enable row level security;/);
    expect(sql).toMatch(/revoke all on table public\.session_reminders from anon, authenticated;/);
    expect(sql).not.toMatch(/create\s+policy[^;]*session_reminders/i);
  });

  it('leaves the booking and credit functions and tables alone', () => {
    expect(sql).not.toMatch(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?\w*(?:book|credit|cancel|waitlist|refund)\w*\s*\(/i);
    expect(sql).not.toMatch(/alter\s+table\s+(?:public\.)?(?:bookings|credits_ledger|classes)\b/i);
  });
});
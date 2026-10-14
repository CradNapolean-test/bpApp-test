// RLS isolation check. SANDBOX ONLY (it creates a few test rows).
//   node supabase/tests/security-audit/rls-isolation-check.cjs --ref=<your sandbox project ref>
// Member A (publishable key + real login) must not read or write member B's rows in any table with a client_id
// column, and a logged-out caller must read nothing. Controls: B reads own rows, the coach reads B's rows.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) { console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.'); process.exit(2); }
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mk = (key) => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);

const creds = Object.fromEntries(
  fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / '))
);

// Tables that carry a client_id column, discovered from the schema + migrations.
const sqlDir = root + '/supabase';
const files = [sqlDir + '/schema.sql', ...fs.readdirSync(sqlDir + '/migrations').map((f) => sqlDir + '/migrations/' + f)];
const tables = new Set();
for (const f of files) {
  const sql = fs.readFileSync(f, 'utf8');
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    if (/\bclient_id\b/.test(m[2])) tables.add(m[1]);
  }
}

const results = [];
const note = (name, ok, detail = '') => results.push({ name, ok, detail });

async function login(email) {
  const c = mk(anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password: creds[email] });
  if (error) throw new Error('login failed for ' + email + ': ' + error.message);
  return { c, id: data.user.id };
}

(async () => {
  const A = await login('member.a.sandbox@example.com');
  const B = await login('member.b.sandbox@example.com');
  const coach = creds['coach.sandbox@example.com'] ? await login('coach.sandbox@example.com') : null;

  // Seed some of B's rows with the admin client (control data).
  const today = new Date().toISOString().slice(0, 10);
  const seeds = {
    daily_logs: { client_id: B.id, log_date: today },
    notifications: { client_id: B.id, message: 'rls-check seed' },
    chat_messages: { client_id: B.id, sender_id: B.id, text: 'rls-check seed' },
    credits_ledger: { client_id: B.id, delta: 5, reason: 'rls-check seed' },
    client_profiles: { client_id: B.id, name: 'Member B (rls check)', start_weight: 80, goal_weight: 75 },
  };
  const seeded = [];
  for (const [t, row] of Object.entries(seeds)) {
    const conflict = { daily_logs: 'client_id,log_date', client_profiles: 'client_id' }[t];
    const { error } = conflict ? await admin.from(t).upsert(row, { onConflict: conflict }) : await admin.from(t).insert(row);
    if (error) console.warn('seed warning (' + t + '): ' + error.message); else seeded.push(t);
  }
  console.log('seeded B rows in:', seeded.join(', ') || 'none');

  // 1. A can read nothing of B's in any client_id table.
  for (const t of [...tables].sort()) {
    const { data, error } = await A.c.from(t).select('*').eq('client_id', B.id).limit(5);
    if (error) { note('A reads ' + t, true, 'blocked: ' + error.message.slice(0, 60)); continue; }
    note('A reads B in ' + t, data.length === 0, data.length ? data.length + ' rows LEAKED' : '0 rows');
  }

  // 2. Positive control: B can read its own seeded rows.
  for (const t of seeded) {
    const { data } = await B.c.from(t).select('*').eq('client_id', B.id).limit(1);
    note('B reads own ' + t, (data?.length ?? 0) > 0, `${data?.length ?? 0} rows`);
  }

  // 3. A cannot write as/for B.
  const ins = await A.c.from('daily_logs').insert({ client_id: B.id, log_date: '2000-01-01' });
  note('A inserts daily_log for B', !!ins.error, ins.error ? 'rejected' : 'ALLOWED');
  const upd = await A.c.from('daily_logs').update({ notes: 'tampered' }).eq('client_id', B.id).select();
  note('A updates B daily_log', !upd.error && (upd.data?.length ?? 0) === 0 || !!upd.error, `rows changed: ${upd.data?.length ?? 0}`);
  const del = await A.c.from('daily_logs').delete().eq('client_id', B.id).select();
  note('A deletes B daily_log', (del.data?.length ?? 0) === 0, `rows deleted: ${del.data?.length ?? 0}`);
  const led = await A.c.from('credits_ledger').insert({ client_id: A.id, delta: 100, reason: 'self-grant attempt' });
  note('A self-grants credits', !!led.error, led.error ? 'rejected' : 'ALLOWED');
  const led2 = await A.c.from('credits_ledger').insert({ client_id: B.id, delta: 100, reason: 'grant attempt' });
  note('A grants credits to B', !!led2.error, led2.error ? 'rejected' : 'ALLOWED');

  // 4. Views / profiles.
  const bal = await A.c.from('credits_balance').select('*').eq('client_id', B.id);
  note('A reads B credits_balance', (bal.data?.length ?? 0) === 0, `${bal.data?.length ?? 0} rows`);
  const prof = await A.c.from('profiles').select('id,email').eq('id', B.id);
  note('A reads B profiles row', (prof.data?.length ?? 0) === 0, `${prof.data?.length ?? 0} rows`);

  // 5. Anonymous (not logged in) reads nothing.
  const anon = mk(anonKey);
  for (const t of ['daily_logs', 'client_profiles', 'profiles', 'chat_messages', 'credits_ledger']) {
    const { data } = await anon.from(t).select('*').limit(1);
    note('anon reads ' + t, (data?.length ?? 0) === 0, `${data?.length ?? 0} rows`);
  }

  // 6. Coach can read their own member's rows (positive control).
  if (coach) {
    const { data } = await coach.c.from('daily_logs').select('id').eq('client_id', B.id);
    note('coach reads B daily_logs', (data?.length ?? 0) > 0, `${data?.length ?? 0} rows`);
  }

  // Clean up control data.
  for (const t of seeded) await admin.from(t).delete().eq('client_id', B.id).like(t === 'daily_logs' ? 'log_date' : 'id', t === 'daily_logs' ? today : '%').then(() => {}, () => {});

  const failed = results.filter((r) => !r.ok);
  console.log(`\nchecks: ${results.length}, passed: ${results.length - failed.length}, FAILED: ${failed.length}`);
  console.log('client_id tables tested:', tables.size);
  for (const r of failed) console.log('FAIL:', r.name, '-', r.detail);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

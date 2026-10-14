// Live security check for the SECURITY DEFINER RPCs. SANDBOX ONLY: it creates and deletes test rows.
//
//   node supabase/tests/security-audit/rpc-state-change-check.cjs --ref=<your sandbox project ref>
//
// Needs apps/web/.env.local (URL, publishable key, service-role key) and sandbox-credentials.local.txt at the repo
// root (member.a / member.b / coach.sandbox accounts). Refuses to run unless --ref matches the project URL.
//
// 1. DENIAL: for every SECURITY DEFINER function, call it as an anonymous user and as member A against member B's
//    real class, booking and membership. Any call that changes B's or the gym's data is a failure.
// 2. CONTROLS: the legitimate callers must still work (coach, the booking's owner, service role), so a hardening
//    migration cannot silently break the app.
// Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');
const { parseFunctions } = require('./parse-functions.cjs');

const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const urlRef = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!refArg || refArg !== urlRef) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> and it must match NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mk = (k) => createClient(url, k, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(
  fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')),
);
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const rand = () => require('crypto').randomUUID();
const date = '2031-05-06';
const fns = parseFunctions().filter((f) => f.securityDefiner);

function splitArgs(s) {
  const out = []; let d = 0, cur = '';
  for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

(async () => {
  const login = async (email) => {
    const c = mk(key);
    const { data, error } = await c.auth.signInWithPassword({ email, password: creds[email] });
    if (error) throw new Error('login ' + email + ': ' + error.message);
    return { c, id: data.user.id };
  };
  const A = await login('member.a.sandbox@example.com');
  const Bm = await login('member.b.sandbox@example.com');
  const Co = await login('coach.sandbox@example.com');
  const anon = mk(key);
  const B = Bm.id;
  const coach = must(await admin.from('profiles').select('id, gym_id').eq('id', Co.id).single(), 'coach');

  const seed = async () => {
    const cls = must(await admin.from('classes').insert({ coach_id: coach.id, gym_id: coach.gym_id, name: 'audit-class', day_of_week: 2, start_time: '06:00', capacity: 10, specific_date: date }).select('id').single(), 'class').id;
    const bk = must(await admin.from('bookings').insert({ client_id: B, class_id: cls, booking_date: date, status: 'booked' }).select('id').single(), 'booking').id;
    const pkg = must(await admin.from('membership_packages').insert({ coach_id: coach.id, gym_id: coach.gym_id, name: 'audit-pkg', credits_per_week: 3 }).select('id').single(), 'pkg').id;
    const mem = must(await admin.from('client_memberships').insert({ client_id: B, package_id: pkg }).select('id').single(), 'mem').id;
    return { cls, bk, pkg, mem };
  };
  const teardown = async (s) => {
    await admin.from('class_exceptions').delete().eq('class_id', s.cls);
    await admin.from('bookings').delete().eq('class_id', s.cls);
    await admin.from('classes').delete().eq('id', s.cls);
    await admin.from('client_memberships').delete().eq('id', s.mem);
    await admin.from('membership_packages').delete().eq('id', s.pkg);
  };
  const snapshot = async (s) => JSON.stringify({
    bk: (await admin.from('bookings').select('status, attended').eq('id', s.bk).maybeSingle()).data,
    mem: (await admin.from('client_memberships').select('ended_at').eq('id', s.mem).maybeSingle()).data,
    ledger: (await admin.from('credits_ledger').select('id', { count: 'exact', head: true }).eq('client_id', B)).count,
    prof: (await admin.from('profiles').select('*').eq('id', B).single()).data,
    cp: (await admin.from('client_profiles').select('*').eq('client_id', B).maybeSingle()).data,
    exc: (await admin.from('class_exceptions').select('class_id', { count: 'exact', head: true }).eq('class_id', s.cls)).count,
    gym: (await admin.from('gyms').select('*').eq('id', coach.gym_id).single()).data,
  });
  const dummy = (type, name, s) => {
    const t = type.toLowerCase();
    if (name === 'p_class_id') return s.cls;
    if (name === 'p_booking_id') return s.bk;
    if (name === 'p_membership_id') return s.mem;
    if (name === 'p_package_id') return s.pkg;
    if (name === 'p_gym_id' || name === 'p_target_gym_id') return coach.gym_id;
    if (name === 'p_coach_id') return coach.id;
    if (/client|member|user/.test(name) && t.startsWith('uuid')) return B;
    if (t.includes('[]')) return [];
    if (t.startsWith('uuid')) return rand();
    if (t.startsWith('date')) return date;
    if (t.startsWith('timestamp')) return '2031-01-01T00:00:00Z';
    if (/^(int|bigint|smallint)/.test(t)) return 1;
    if (/^(numeric|real|double)/.test(t)) return 1;
    if (t.startsWith('bool')) return false;
    if (t.startsWith('json')) return {};
    if (t.startsWith('time')) return '06:00';
    return 'x';
  };
  const buildArgs = (f, s) => {
    const o = {};
    for (const a of splitArgs(f.args)) {
      const m = a.replace(/\s+default\s+[\s\S]*$/i, '').trim().split(/\s+/);
      if (m.length >= 2) o[m[0]] = dummy(m.slice(1).join(' '), m[0].toLowerCase(), s);
    }
    return o;
  };

  const failures = [];
  let calls = 0;

  // 1. DENIAL
  for (const f of fns) {
    for (const who of ['anon', 'member A']) {
      const s = await seed();
      const before = await snapshot(s);
      await (who === 'anon' ? anon : A.c).rpc(f.name, buildArgs(f, s));
      if (before !== (await snapshot(s))) failures.push(`DENIAL: ${who} changed member B / gym data via ${f.name}`);
      await teardown(s);
      calls++;
    }
  }

  // 2. CONTROLS: legitimate callers must still work.
  const control = async (label, fn) => {
    const s = await seed();
    try { const ok = await fn(s); if (!ok) failures.push('CONTROL FAILED: ' + label); else console.log('  control ok:', label); }
    catch (e) { failures.push('CONTROL ERRORED: ' + label + ' - ' + e.message); }
    await teardown(s);
  };
  await control('coach cancels a class session, then restores it', async (s) => {
    const r1 = await Co.c.rpc('cancel_class_occurrence', { p_class_id: s.cls, p_date: date, p_reason: 'control' });
    const cancelled = !r1.error && (await admin.from('bookings').select('status').eq('id', s.bk).single()).data.status === 'cancelled';
    const r2 = await Co.c.rpc('restore_class_occurrence', { p_class_id: s.cls, p_date: date });
    return cancelled && !r2.error;
  });
  await control("coach removes a member's booking", async (s) => {
    const r = await Co.c.rpc('coach_cancel_booking', { p_booking_id: s.bk, p_refund: true });
    return !r.error && (await admin.from('bookings').select('status').eq('id', s.bk).single()).data.status === 'cancelled';
  });
  await control('member cancels their own booking', async (s) => {
    const r = await Bm.c.rpc('cancel_booking', { p_booking_id: s.bk });
    return !r.error && (await admin.from('bookings').select('status').eq('id', s.bk).single()).data.status === 'cancelled';
  });
  await control("coach cancels a member's booking with cancel_booking", async (s) => {
    const r = await Co.c.rpc('cancel_booking', { p_booking_id: s.bk });
    return !r.error;
  });
  await control('member can still set their own theme preference', async () => !(await A.c.rpc('set_theme_preference', { p_preference: 'dark' })).error);
  await control('service role can still run expire_bonus_credits (cron)', async () => !(await admin.rpc('expire_bonus_credits')).error);
  await control('service role can run top_up / clear on a membership (cron / internal)', async (s) => {
    const a = await admin.rpc('top_up_membership_credits', { p_membership_id: s.mem });
    const b = await admin.rpc('clear_membership_credits', { p_client_id: B });
    return !a.error && !b.error;
  });
  await control('member B can still mark their own chat read', async () => !(await Bm.c.rpc('mark_chat_read', { p_client_id: B })).error);

  console.log(`\n${calls} denial calls, ${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });

// Push notification registrations (migration 0113), as members. SANDBOX ONLY: creates and deletes test rows (tokens starting
// ExponentPushToken[zz-rls-push-) and leaves nothing behind.
//   node supabase/tests/security-audit/push-devices-check.cjs --ref=<your sandbox project ref> [--expect-0113]
//
// A phone's push token says "send a notification to this phone", so a member must only ever see, remove and register their own,
// and the table must not be writable except through register_push_device(). Checked as real members (and a coach, and nobody):
//  - a member registers a phone and reads it; another member sees nothing; a coach sees nothing;
//  - nobody inserts or updates a row directly; a member deletes only their own ("turn push off");
//  - a phone that changed hands moves to its new member and leaves the old one;
//  - a bad token or platform is refused; a member never holds more than 5 phones, the newest kept;
//  - signed out (anon) cannot register or read; a coach cannot register a phone;
//  - control: the server's own key (what the web app's sender uses) can read the table.
// Until 0113 is applied the checks are listed as pending; with --expect-0113 they count as failures. Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const expect = process.argv.includes('--expect-0113');
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const PREFIX = 'ExponentPushToken[zz-rls-push-';
const tok = (n) => `${PREFIX}${String(n).padStart(8, '0')}]`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // member under test
  const O = await login('member.a.sandbox@example.com'); // someone else
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const failures = [];
  const pending = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };

  const probe = await admin.from('push_devices').select('id').limit(1);
  if (probe.error) {
    console.log('push_devices does not exist yet (migration 0113 not applied).');
    if (expect) { console.log('\n1 failure(s)\n  FAIL: migration 0113 is not applied'); process.exit(1); }
    console.log('\n0 failure(s), all checks pending until 0113 is applied');
    process.exit(0);
  }

  const clean = async () => { await admin.from('push_devices').delete().like('expo_token', PREFIX + '%'); };
  await clean();
  const reg = (c, token, platform = 'ios', name = 'Test phone') => c.rpc('register_push_device', { p_token: token, p_platform: platform, p_device_name: name });
  const mine = async (c) => (must(await c.from('push_devices').select('expo_token, client_id, platform').like('expo_token', PREFIX + '%'), 'read mine') ?? []);

  try {
    check('a member registers a phone', !(await reg(S.c, tok(1))).error);
    check('registering the same phone again leaves one row', !(await reg(S.c, tok(1))).error && (await mine(S.c)).filter((r) => r.expo_token === tok(1)).length === 1);
    const rows = await mine(S.c);
    check('they can read their own phone, owned by them', rows.length === 1 && rows[0].client_id === S.id);
    check('another member sees nothing of it', (await mine(O.c)).length === 0);
    check('a coach sees nothing of it', (await mine(coach.c)).length === 0);
    check('signed out sees nothing of it', ((await anon.from('push_devices').select('id').like('expo_token', PREFIX + '%')).data ?? []).length === 0);

    const ins = await S.c.from('push_devices').insert({ client_id: S.id, expo_token: tok(2), platform: 'ios' });
    check('a member cannot insert a row directly', !!ins.error);
    const insOther = await S.c.from('push_devices').insert({ client_id: O.id, expo_token: tok(3), platform: 'ios' });
    check("a member cannot insert a row for someone else", !!insOther.error);
    const upd = await S.c.from('push_devices').update({ platform: 'android' }).eq('expo_token', tok(1)).select('id');
    check('a member cannot update a row directly', !!upd.error || (upd.data ?? []).length === 0);
    const updOwner = await S.c.from('push_devices').update({ client_id: O.id }).eq('expo_token', tok(1)).select('id');
    check('a member cannot hand their row to someone else', !!updOwner.error || (updOwner.data ?? []).length === 0);
    const stillMine = must(await admin.from('push_devices').select('client_id, platform').eq('expo_token', tok(1)).single(), 'row after');
    check('the row is unchanged by those attempts', stillMine.client_id === S.id && stillMine.platform === 'ios');

    const delOther = await O.c.from('push_devices').delete().eq('expo_token', tok(1)).select('id');
    check("another member's delete removes nothing", (delOther.data ?? []).length === 0);
    check('the row is still there', (must(await admin.from('push_devices').select('id').eq('expo_token', tok(1)), 'still there')).length === 1);

    // the phone changes hands
    check('a phone that changed hands is registered by its new member', !(await reg(O.c, tok(1), 'android')).error);
    const moved = must(await admin.from('push_devices').select('client_id, platform').eq('expo_token', tok(1)).single(), 'moved');
    check('it now belongs to the new member only', moved.client_id === O.id && moved.platform === 'android');
    check('the previous member no longer has it', (await mine(S.c)).length === 0);

    // refused input
    check('a token that is not an Expo token is refused', !!(await reg(S.c, 'not-a-token')).error);
    check('a token with odd characters is refused', !!(await reg(S.c, "ExponentPushToken[abc'; drop table x;--]")).error);
    check('a too-short token is refused', !!(await reg(S.c, 'ExponentPushToken[abc]')).error);
    check('an unknown platform is refused', !!(await reg(S.c, tok(4), 'windows')).error);
    check('a coach cannot register a phone', !!(await reg(coach.c, tok(5))).error);
    check('signed out cannot register a phone', !!(await reg(anon, tok(6))).error);

    // at most 5 phones, newest kept
    for (let i = 10; i < 17; i++) { await reg(S.c, tok(i)); await sleep(60); }
    const held = await mine(S.c);
    check('a member never holds more than 5 phones', held.length === 5, String(held.length));
    check('the newest ones are the ones kept', held.some((r) => r.expo_token === tok(16)) && !held.some((r) => r.expo_token === tok(10)));

    const delMine = await S.c.from('push_devices').delete().eq('expo_token', tok(16)).select('id');
    check('a member deletes their own phone ("turn push off")', !delMine.error && (delMine.data ?? []).length === 1);

    // control: the sender's key
    check("control: the server's own key can read the table (the web sender's path)", (must(await admin.from('push_devices').select('id').like('expo_token', PREFIX + '%'), 'admin read')).length >= 1);
  } finally {
    await clean();
  }

  console.log('\n' + failures.length + ' failure(s)');
  for (const f of failures) console.log('  FAIL:', f);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(2); });

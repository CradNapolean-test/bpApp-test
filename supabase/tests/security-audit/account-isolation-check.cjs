// Account isolation (notifications, theme, screen settings, and what a member may write to their own profile) as a member.
// SANDBOX ONLY: creates and deletes test rows (tagged rls-acct) and puts back anything it touches.
//   node supabase/tests/security-audit/account-isolation-check.cjs --ref=<your sandbox project ref>
//
// A member must reach only their own notifications and change only the settings that are theirs. They must NOT be able to:
// read, add, move, edit or delete another member's notifications; add notifications at all (only the system writes them);
// turn a screen on or off for themselves (that is the coach's switch) or change what a membership package includes;
// change their own role, coach or gym; or change the profile fields that belong to their coach (reminder days, join date,
// referral source, admin notes). Controls prove the legitimate paths still work (a member's own notifications and profile
// settings and theme, and the coach's own routes: the reminder and admin-details functions, and the screen switches).
// The last group needs migration 0110 (members cannot write the coach-owned profile fields). Exit code 1 on any failure.
// One known gap is printed but not counted: a member can still READ the coach-only admin fields of their own profile row.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // the member under test (has a profile row)
  const O = await login('member.a.sandbox@example.com'); // someone else
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const coachOfS = must(await admin.from('profiles').select('coach_id').eq('id', S.id).single(), 'S coach').coach_id;
  const coachIsAssigned = coachOfS === coach.id;

  const failures = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const denied = (r) => !!r.error || (r.data ?? []).length === 0;
  const tag = 'rls-acct-' + Date.now();

  // What to put back at the end.
  const sBefore = must(await admin.from('client_profiles').select('checkin_reminder_days, join_date, referral_source, admin_notes, notifications_enabled, email_notifications_enabled, deletion_requested_at').eq('client_id', S.id).single(), 'S profile');
  const sTheme = must(await admin.from('profiles').select('theme_preference').eq('id', S.id).single(), 'S theme').theme_preference;
  const oHadProfile = !!(await admin.from('client_profiles').select('client_id').eq('client_id', O.id).maybeSingle()).data;
  if (!oHadProfile) {
    must(await admin.from('client_profiles').insert({ client_id: O.id, name: tag, start_weight: 80, goal_weight: 70, activity_level: 1.4, diet_approach: 'High Carb Low Fat', tier: 1, cycling: false }), 'temporary profile for the other member');
  }

  // ---- notifications ----
  console.log('  -- notifications');
  const sNotes = must(await admin.from('notifications').insert([{ client_id: S.id, message: tag + ' one' }, { client_id: S.id, message: tag + ' two' }]).select('id'), 'seed S notes');
  const oNote = must(await admin.from('notifications').insert({ client_id: O.id, message: tag + ' other' }).select('id').single(), 'seed O note');
  const own = await S.c.from('notifications').select('id').eq('client_id', S.id).like('message', tag + '%');
  check('control: a member reads their own notifications', !own.error && (own.data ?? []).length === 2, own.error?.message);
  const seen = await S.c.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', sNotes[0].id).select('id');
  check('control: a member marks their own notification seen', !seen.error && seen.data?.length === 1, seen.error?.message);
  const clr = await S.c.from('notifications').update({ cleared_at: new Date().toISOString() }).eq('id', sNotes[1].id).select('id');
  check('control: a member clears their own notification', !clr.error && clr.data?.length === 1, clr.error?.message);
  check("cannot read another member's notifications", denied(await S.c.from('notifications').select('id').eq('client_id', O.id)));
  check('cannot add a notification for themselves (only the system writes them)', denied(await S.c.from('notifications').insert({ client_id: S.id, message: tag + ' self' }).select('id')));
  check("cannot add a notification to another member's inbox", denied(await S.c.from('notifications').insert({ client_id: O.id, message: tag + ' spam' }).select('id')));
  check("cannot move their own notification into another member's inbox", denied(await S.c.from('notifications').update({ client_id: O.id }).eq('id', sNotes[0].id).select('id')));
  check("cannot edit another member's notification", denied(await S.c.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', oNote.id).select('id')));
  check('cannot delete a notification (own or anyone\'s)', denied(await S.c.from('notifications').delete().eq('id', oNote.id).select('id')) && denied(await S.c.from('notifications').delete().eq('id', sNotes[0].id).select('id')));
  check('signed-out callers read no notifications', denied(await anon.from('notifications').select('id').limit(1)));

  // ---- theme ----
  console.log('  -- theme');
  const light = await S.c.rpc('set_theme_preference', { p_preference: 'light' });
  const now = (await admin.from('profiles').select('theme_preference').eq('id', S.id).single()).data?.theme_preference;
  check('control: a member sets their own theme', !light.error && now === 'light', light.error?.message);
  check('an unknown theme is refused', !!(await S.c.rpc('set_theme_preference', { p_preference: 'purple' })).error);
  check('signed-out callers cannot set a theme', !!(await anon.rpc('set_theme_preference', { p_preference: 'dark' })).error);
  check('cannot write the profiles row directly (role, coach, gym, theme are not the member\'s to set)',
    denied(await S.c.from('profiles').update({ role: 'owner' }).eq('id', S.id).select('id')) &&
    denied(await S.c.from('profiles').update({ coach_id: S.id }).eq('id', S.id).select('id')) &&
    denied(await S.c.from('profiles').update({ gym_id: null }).eq('id', S.id).select('id')) &&
    denied(await S.c.from('profiles').update({ theme_preference: 'dark' }).eq('id', O.id).select('id')));
  check('their role is still client', (await admin.from('profiles').select('role').eq('id', S.id).single()).data?.role === 'client');

  // ---- which screens a member sees (the coach's switch, and the membership tier) ----
  console.log('  -- screen settings');
  check('control: a member reads their own screen settings', !(await S.c.from('client_disabled_screens').select('screen').eq('client_id', S.id)).error);
  must(await admin.from('client_disabled_screens').upsert({ client_id: O.id, screen: 'Forms' }, { onConflict: 'client_id,screen' }), 'seed O screen');
  check("cannot read another member's screen settings", denied(await S.c.from('client_disabled_screens').select('screen').eq('client_id', O.id)));
  check('cannot switch a screen on or off for themselves (the coach does that)', denied(await S.c.from('client_disabled_screens').insert({ client_id: S.id, screen: 'Workout' }).select('screen')));
  check("cannot switch a screen for another member", denied(await S.c.from('client_disabled_screens').delete().eq('client_id', O.id).select('screen')));
  must(await admin.from('client_disabled_screens').upsert({ client_id: S.id, screen: 'Recipes' }, { onConflict: 'client_id,screen' }), 'seed S screen');
  check("cannot turn back on a screen their coach switched off", denied(await S.c.from('client_disabled_screens').delete().eq('client_id', S.id).eq('screen', 'Recipes').select('screen')));
  check('the switched-off screen is still off', ((await admin.from('client_disabled_screens').select('screen').eq('client_id', S.id).eq('screen', 'Recipes')).data ?? []).length === 1);
  const pkg = (await admin.from('membership_packages').select('id').limit(1)).data?.[0];
  if (pkg) check('cannot change what a membership package includes', denied(await S.c.from('membership_packages').update({ included_screens: ['Workout'] }).eq('id', pkg.id).select('id')));
  if (coachIsAssigned) {
    const cs = await coach.c.from('client_disabled_screens').upsert({ client_id: S.id, screen: 'Forms' }, { onConflict: 'client_id,screen' }).select('screen');
    check("control: the member's coach switches a screen for them", !cs.error && cs.data?.length === 1, cs.error?.message);
    check("control: the member's coach turns it back on", !(await coach.c.from('client_disabled_screens').delete().eq('client_id', S.id).eq('screen', 'Forms')).error);
  }

  // ---- the member's own profile ----
  console.log('  -- client_profiles');
  const mine = await S.c.from('client_profiles').update({ notifications_enabled: !sBefore.notifications_enabled, email_notifications_enabled: !sBefore.email_notifications_enabled, deletion_requested_at: new Date().toISOString() }).eq('client_id', S.id).select('client_id');
  check('control: a member changes their own reminder, email and deletion settings', !mine.error && mine.data?.length === 1, mine.error?.message);
  check("cannot change another member's profile", denied(await S.c.from('client_profiles').update({ notifications_enabled: false }).eq('client_id', O.id).select('client_id')));
  check("cannot move their profile onto another member", denied(await S.c.from('client_profiles').update({ client_id: O.id }).eq('client_id', S.id).select('client_id')));
  check("cannot read another member's profile", denied(await S.c.from('client_profiles').select('client_id').eq('client_id', O.id)));

  console.log('  -- coach-owned profile fields (need migration 0110)');
  const tryField = async (label, patch, column, expected) => {
    const r = await S.c.from('client_profiles').update(patch).eq('client_id', S.id).select('client_id');
    const stored = (await admin.from('client_profiles').select(column).eq('client_id', S.id).single()).data?.[column];
    check(label, denied(r) && stored === sBefore[column], 'it was changed to ' + JSON.stringify(stored));
  };
  await tryField('a member cannot change their own check-in reminder days (the coach sets it)', { checkin_reminder_days: 1 }, 'checkin_reminder_days');
  await tryField('a member cannot set their own join date', { join_date: '1999-01-01' }, 'join_date');
  await tryField('a member cannot set their own referral source', { referral_source: tag }, 'referral_source');
  await tryField('a member cannot write the coach\'s private admin notes', { admin_notes: tag }, 'admin_notes');
  if (coachIsAssigned) {
    const r1 = await coach.c.rpc('set_checkin_reminder_days', { p_client_id: S.id, p_days: sBefore.checkin_reminder_days === 5 ? 4 : 5 });
    check("control: the member's coach can still set the reminder days", !r1.error, r1.error?.message);
    const r2 = await coach.c.rpc('set_client_admin_details', { p_client_id: S.id, p_join_date: '2000-02-02', p_referral_source: tag, p_admin_notes: tag });
    const after = (await admin.from('client_profiles').select('join_date, referral_source, admin_notes').eq('client_id', S.id).single()).data;
    check("control: the member's coach can still set the admin details", !r2.error && after?.join_date === '2000-02-02' && after?.referral_source === tag && after?.admin_notes === tag, r2.error?.message);
    // Known gap, reported but not counted: the member's own SELECT returns the coach-only columns.
    const read = await S.c.from('client_profiles').select('admin_notes, referral_source, join_date').eq('client_id', S.id).single();
    if (!read.error && read.data?.admin_notes === tag) console.log('  KNOWN GAP (not fixed here): a member can read the coach-only admin notes, referral source and join date of their own profile row');
  }

  // ---- put everything back ----
  await admin.from('notifications').delete().like('message', tag + '%');
  await admin.from('client_disabled_screens').delete().eq('client_id', O.id).eq('screen', 'Forms');
  await admin.from('client_disabled_screens').delete().eq('client_id', S.id).in('screen', ['Recipes', 'Forms', 'Workout']);
  await admin.from('profiles').update({ theme_preference: sTheme }).eq('id', S.id);
  await admin.from('client_profiles').update(sBefore).eq('client_id', S.id);
  if (!oHadProfile) await admin.from('client_profiles').delete().eq('client_id', O.id).eq('name', tag);

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });

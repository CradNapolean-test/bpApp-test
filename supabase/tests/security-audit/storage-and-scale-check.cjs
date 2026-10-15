// Rules added by migration 0128 (fix brief 01): logged-out requests (R9), web push registration (M3), scanned-food
// corrections (M12), library link format (R23) and the coach-branding bucket (CM5). It also confirms event capacity (R31),
// which was already enforced by 0112 / 0126. SANDBOX ONLY: creates and deletes test rows and test files.
//   node supabase/tests/security-audit/storage-and-scale-check.cjs --ref=<your sandbox project ref>
// Also run rls-isolation-check.cjs after applying 0128 (the R9 change touches almost every table).
//
// Checked as real sandbox accounts (member A, member B, the sandbox coach) and as a logged-out caller:
//  - R9: logged out, reading tables returns nothing, quickly; the row-level helper functions are not callable logged out but
//    still work signed in; a member still reads their own data.
//  - M3: a browser address moves to the member who registers it last; bad input is refused; at most 5 browsers each; a member
//    cannot slip an address that is someone else's in through the table.
//  - M12: a coach can correct, hide and delete a scanned food, and cannot touch other foods; a member can touch none; the
//    search skips a hidden food.
//  - R23: http://, javascript: and similar links are refused for library images and videos, https:// is accepted, even for the service role.
//  - CM5: a member cannot upload to coach-branding; a coach can upload a small PNG to their own folder only; a 2 MB file, an
//    HTML file and an SVG are refused.
//  - R31: the third sign-up for a two-seat event, and a sign-up for an event that ended long ago, are refused.
// Exit code 1 on any failure, 2 on a script error.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZERO = '00000000-0000-0000-0000-000000000000';
const TAG = 'zz-storage-check';
const ENDPOINT = 'https://push.example.com/' + TAG + '-';
// A real 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const A = await login('member.a.sandbox@example.com');
  const B = await login('member.b.sandbox@example.com');
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const coachGym = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;

  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const noEffect = (r) => !!r.error || (r.data ?? []).length === 0;
  const refused = (r) => !!r.error;
  const worked = (r) => !r.error && (r.data ?? []).length === 1;
  const denied = (r) => !!r.error && (r.error.code === '42501' || /permission denied/i.test(r.error.message));

  const barcode = '9999999' + String(Date.now()).slice(-6);
  const uploaded = [];
  const eventIds = [];
  // The 5-browser cap can remove a member's real sandbox subscriptions, so remember them and put them back at the end.
  const pushBefore = (await admin.from('push_subscriptions').select('*').in('client_id', [A.id, B.id])).data ?? [];

  try {
    // ---------------------------------------------------------------- R9: logged-out requests
    console.log('R9: logged-out requests');
    for (const table of ['daily_logs', 'client_profiles', 'profiles', 'bookings', 'chat_messages', 'credits_ledger', 'notifications', 'exercise_library']) {
      const t0 = Date.now();
      const r = await anon.from(table).select('*').limit(1);
      const ms = Date.now() - t0;
      check(`logged out reads nothing from ${table}`, (!r.error && (r.data ?? []).length === 0) || denied(r), r.error?.message);
      check(`...and gets that answer quickly (${ms} ms, limit 1500)`, ms < 1500);
    }
    check('logged out cannot call is_self', denied(await anon.rpc('is_self', { target_id: ZERO })));
    check('logged out cannot call client_gym_id', denied(await anon.rpc('client_gym_id', { target_client_id: ZERO })));
    const me = await A.c.rpc('is_self', { target_id: A.id });
    check('control: a signed-in member still gets true from is_self for themselves', !me.error && me.data === true, me.error?.message);
    check('control: a member still reads their own profile row', ((await A.c.from('profiles').select('id').eq('id', A.id)).data ?? []).length === 1);
    check('control: the coach still reads their own gym profile row', ((await coach.c.from('profiles').select('id').eq('id', coach.id)).data ?? []).length === 1);

    // ---------------------------------------------------------------- M3: web push registration
    console.log('M3: web push registration');
    await admin.from('push_subscriptions').delete().like('endpoint', ENDPOINT + '%');
    const reg = (c, endpoint, p256dh = 'BPzz-p256dh-key-for-check-only', auth = 'zz-auth-key') => c.rpc('register_web_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
    const holders = async (endpoint) => (await admin.from('push_subscriptions').select('client_id').eq('endpoint', endpoint)).data ?? [];

    const shared = ENDPOINT + 'shared';
    check('member A registers a browser', !(await reg(A.c, shared)).error);
    check('registering it again leaves one row', !(await reg(A.c, shared)).error && (await holders(shared)).length === 1);
    check('member B registers the same browser (a shared phone)', !(await reg(B.c, shared)).error);
    const h = await holders(shared);
    check('the browser now belongs to B only', h.length === 1 && h[0].client_id === B.id);
    check('A can no longer see it', ((await A.c.from('push_subscriptions').select('id').eq('endpoint', shared)).data ?? []).length === 0);
    check("a member cannot put a browser that is someone else's into the table directly", refused(await A.c.from('push_subscriptions').insert({ client_id: A.id, endpoint: shared, p256dh: 'x', auth: 'y' })));
    check('an address that is not https is refused', refused(await reg(A.c, 'http://push.example.com/' + TAG + '-plain')));
    check('an empty key is refused', refused(await reg(A.c, ENDPOINT + 'nokey', '', 'zz-auth-key')));
    check('logged out cannot register', refused(await reg(anon, ENDPOINT + 'anon')));
    for (let i = 0; i < 7; i++) { await reg(A.c, ENDPOINT + 'cap-' + i); await sleep(80); }
    const held = (await admin.from('push_subscriptions').select('endpoint').eq('client_id', A.id).like('endpoint', ENDPOINT + 'cap-%')).data ?? [];
    check('a member never holds more than 5 browsers', held.length <= 5, held.length + ' held');
    check('the newest ones are kept', held.some((r) => r.endpoint === ENDPOINT + 'cap-6') && !held.some((r) => r.endpoint === ENDPOINT + 'cap-0'));
    check('control: a member can still turn their own browser off (delete)', ((await A.c.from('push_subscriptions').delete().eq('endpoint', ENDPOINT + 'cap-6').select('id')).data ?? []).length === 1);

    // ---------------------------------------------------------------- M12: scanned foods
    console.log('M12: scanned foods');
    const food = must(await admin.from('foods').insert({ barcode, name: 'zz Storage check scanned', portion: '1 gram', protein: 0.1, carbs: 0.5, fat: 0.2, source: 'scan' }).select('id').single(), 'seed scanned food').id;
    const findable = async (c) => ((await c.rpc('search_foods', { p_query: 'zz storage check scanned', p_limit: 5 })).data ?? []).some((f) => f.id === food);
    check('control: the scanned food is found by search', await findable(A.c));
    check('a member cannot edit a scanned food', noEffect(await A.c.from('foods').update({ fat: 0 }).eq('id', food).select('id')));
    check('a member cannot hide a scanned food', noEffect(await A.c.from('foods').update({ hidden: true }).eq('id', food).select('id')));
    check('a member cannot delete a scanned food', noEffect(await A.c.from('foods').delete().eq('id', food).select('id')));
    const untouched = must(await admin.from('foods').select('fat, hidden').eq('id', food).single(), 'food after member attempts');
    check('the food is unchanged by those attempts', Number(untouched.fat) === 0.2 && untouched.hidden === false);

    check('a coach can correct a scanned food', worked(await coach.c.from('foods').update({ fat: 0.05 }).eq('id', food).select('id')));
    check('a coach cannot save impossible numbers on a visible food', refused(await coach.c.from('foods').update({ protein: 5 }).eq('id', food).select('id')));
    check('a coach cannot turn a scanned food into a seed food', noEffect(await coach.c.from('foods').update({ source: 'seed' }).eq('id', food).select('id')));
    check('a coach can hide a scanned food', worked(await coach.c.from('foods').update({ hidden: true }).eq('id', food).select('id')));
    check('a hidden food no longer appears in search', !(await findable(A.c)));
    check('a coach can hide a bad legacy row without repairing it first', worked(await coach.c.from('foods').update({ protein: 5, hidden: true }).eq('id', food).select('id')));
    check('a coach can delete a scanned food', worked(await coach.c.from('foods').delete().eq('id', food).select('id')));
    const seedFood = (await admin.from('foods').select('id, fat').eq('name', 'Chicken Breast').limit(1)).data?.[0];
    if (seedFood) {
      check('a coach cannot edit a non-scanned food', noEffect(await coach.c.from('foods').update({ fat: 0 }).eq('id', seedFood.id).select('id')));
      check('a coach cannot delete a non-scanned food', noEffect(await coach.c.from('foods').delete().eq('id', seedFood.id).select('id')));
    } else {
      console.log('  (no seed food named Chicken Breast: non-scanned food checks skipped)');
    }

    // ---------------------------------------------------------------- R23: library links
    console.log('R23: library links');
    const libTry = async (fields) => admin.from('exercise_library').insert({ name: TAG + ' ' + Math.random().toString(36).slice(2), created_by: coach.id, ...fields }).select('id');
    check('an http:// image link is refused (even for the service role)', refused(await libTry({ image_url: 'http://images.example.com/a.png' })));
    check('a javascript: image link is refused', refused(await libTry({ image_url: 'javascript:alert(1)' })));
    check('an ftp:// video link is refused', refused(await libTry({ video_url: 'ftp://videos.example.com/a.mp4' })));
    check('a bare address with no scheme is refused', refused(await libTry({ image_url: 'images.example.com/a.png' })));
    check('an https:// image and video link is accepted', worked(await libTry({ image_url: 'https://images.example.com/a.png', video_url: 'https://videos.example.com/a' })));
    check('empty links (null) are accepted', worked(await libTry({ image_url: null, video_url: null })));
    const row = must(await libTry({}), 'library row');
    check('editing a link to http:// is refused', refused(await coach.c.from('exercise_library').update({ image_url: 'http://images.example.com/a.png' }).eq('id', row[0].id)));

    // ---------------------------------------------------------------- CM5: coach-branding bucket
    console.log('CM5: coach-branding bucket');
    const up = async (c, name, body, contentType) => {
      const r = await c.storage.from('coach-branding').upload(name, body, { contentType, upsert: true });
      if (!r.error) uploaded.push(name);
      return r;
    };
    check('a member cannot upload to coach-branding (their own folder)', refused(await up(A.c, `${A.id}/${TAG}.png`, PNG, 'image/png')));
    check("a member cannot upload into a coach's folder", refused(await up(A.c, `${coach.id}/${TAG}-member.png`, PNG, 'image/png')));
    check('logged out cannot upload', refused(await up(anon, `${coach.id}/${TAG}-anon.png`, PNG, 'image/png')));
    check('control: a coach can upload a small PNG to their own folder', !(await up(coach.c, `${coach.id}/${TAG}.png`, PNG, 'image/png')).error);
    check("a coach cannot upload into someone else's folder", refused(await up(coach.c, `${A.id}/${TAG}-coach.png`, PNG, 'image/png')));
    check('a 2 MB file is refused', refused(await up(coach.c, `${coach.id}/${TAG}-big.png`, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'image/png')));
    check('an HTML file is refused', refused(await up(coach.c, `${coach.id}/${TAG}.html`, Buffer.from('<script>1</script>'), 'text/html')));
    check('an SVG file is refused', refused(await up(coach.c, `${coach.id}/${TAG}.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')));
    check('a member cannot delete the coach logo', ((await A.c.storage.from('coach-branding').remove([`${coach.id}/${TAG}.png`])).data ?? []).length === 0);

    // ---------------------------------------------------------------- R31: event capacity (already enforced by 0112 / 0126)
    console.log('R31: event capacity');
    const ev = async (fields) => {
      const id = must(await admin.from('gym_events').insert({ gym_id: coachGym, title: TAG + ' event', starts_at: new Date(Date.now() + 48 * 3600e3).toISOString(), ...fields }).select('id').single(), 'event').id;
      eventIds.push(id);
      return id;
    };
    const full = await ev({ capacity: 1 });
    check('first sign-up for a one-seat event works', !(await A.c.from('event_signups').insert({ event_id: full, client_id: A.id })).error);
    check('second sign-up for the same event is refused', refused(await B.c.from('event_signups').insert({ event_id: full, client_id: B.id })));
    const raced = await ev({ capacity: 1 });
    const race = await Promise.all([A.c.from('event_signups').insert({ event_id: raced, client_id: A.id }), B.c.from('event_signups').insert({ event_id: raced, client_id: B.id })]);
    check('two simultaneous sign-ups for a one-seat event: exactly one succeeds', race.filter((r) => !r.error).length === 1, race.map((r) => (r.error ? 'refused' : 'ok')).join(' / '));
    const past = await ev({ starts_at: new Date(Date.now() - 8 * 3600e3).toISOString() });
    check('a sign-up for an event that started 8 hours ago is refused', refused(await A.c.from('event_signups').insert({ event_id: past, client_id: A.id })));
  } finally {
    await admin.from('push_subscriptions').delete().like('endpoint', ENDPOINT + '%');
    await admin.from('foods').delete().eq('barcode', barcode);
    await admin.from('exercise_library').delete().like('name', TAG + '%');
    if (uploaded.length) await admin.storage.from('coach-branding').remove(uploaded);
    if (eventIds.length) {
      await admin.from('event_signups').delete().in('event_id', eventIds);
      await admin.from('gym_events').delete().in('id', eventIds);
    }
    if (pushBefore.length) await admin.from('push_subscriptions').upsert(pushBefore, { onConflict: 'id' });
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });

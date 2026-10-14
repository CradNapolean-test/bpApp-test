// The facts the phone app's offline write queue relies on, checked as real members. SANDBOX ONLY: creates and deletes test rows
// (tagged by a distant test date) and puts back anything it touches.
//   node supabase/tests/security-audit/queued-writes-check.cjs --ref=<your sandbox project ref>
//
// A queued write is repeated until it gets through, so it has to be safe to run twice (apps/mobile/src/lib/writeQueue.ts):
//  - a member can insert a set or a food row with an id made on the phone and the time it really happened (the server must not
//    replace them), and a repeat of the same insert is recognised (primary key) and found again by id;
//  - that recognition must never mistake ANOTHER member's row for the member's own: inserting with someone else's row id fails
//    and the member still cannot read that row, so the app treats it as a real failure;
//  - a batch insert is all or nothing (so "found all the ids" really means "an earlier try saved them all");
//  - updates, deletes and upserts by id / natural key give the same result when run twice.
// Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const TEST_DATE = '2020-01-02'; // a day no real log uses: everything this script makes hangs off it
const uuid = () => crypto.randomUUID();

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // member under test
  const O = await login('member.a.sandbox@example.com'); // someone else

  const failures = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };

  const lib = must(await admin.from('exercise_library').select('id').limit(1), 'exercise library')[0] ?? null; // the column may be empty
  const createdLogs = [];
  const createdDailyLogs = [];

  // Same rule as insertOnce in the app: an insert that hits the primary key counts as done only if every id is there for this member.
  async function insertOnce(c, table, rows) {
    const { error } = await c.from(table).insert(rows);
    if (!error) return 'inserted';
    if (error.code === '23505') {
      const { data } = await c.from(table).select('id').in('id', rows.map((r) => r.id));
      if ((data ?? []).length === rows.length) return 'already there';
    }
    return 'failed:' + error.code;
  }

  try {
    // ---- a set logged in a workout ----
    const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
    const setId = uuid();
    const setRow = { id: setId, client_id: S.id, exercise_id: null, exercise_library_id: lib ? lib.id : null, set_number: 1, actual_reps: 5, actual_load: 60, actual_rpe: 8, set_type: 'working', logged_at: threeHoursAgo };
    createdLogs.push(setId);
    check('a member inserts a set with their own id and the time it was done', (await insertOnce(S.c, 'workout_logs', [setRow])) === 'inserted');
    const back = must(await admin.from('workout_logs').select('id, client_id, logged_at').eq('id', setId).single(), 'read set');
    check('the server keeps that id and time (it does not stamp its own)', back.id === setId && Math.abs(new Date(back.logged_at) - new Date(threeHoursAgo)) < 1000, back.logged_at);
    check('a repeat of the same insert is recognised as already saved', (await insertOnce(S.c, 'workout_logs', [setRow])) === 'already there');
    check('only one such row exists after the repeat', (must(await admin.from('workout_logs').select('id').eq('id', setId), 'count')).length === 1);

    const stolen = await insertOnce(O.c, 'workout_logs', [{ ...setRow, client_id: O.id }]);
    check("another member inserting with this member's row id is a failure, not a success", stolen === 'failed:23505', stolen);
    const peek = await O.c.from('workout_logs').select('id').eq('id', setId);
    check("and that member still cannot read the row (so it is never mistaken for their own)", (peek.data ?? []).length === 0);
    const after = must(await admin.from('workout_logs').select('client_id, actual_reps').eq('id', setId).single(), 'row after');
    check('the original row is untouched by that attempt', after.client_id === S.id && after.actual_reps === 5);

    const upd1 = await S.c.from('workout_logs').update({ actual_reps: 6, actual_load: 62.5, actual_rpe: 9 }).eq('id', setId);
    const upd2 = await S.c.from('workout_logs').update({ actual_reps: 6, actual_load: 62.5, actual_rpe: 9 }).eq('id', setId);
    const reread = must(await admin.from('workout_logs').select('actual_reps, actual_load, actual_rpe').eq('id', setId).single(), 'reread');
    check('updating a set twice gives the same result', !upd1.error && !upd2.error && reread.actual_reps === 6 && Number(reread.actual_load) === 62.5 && reread.actual_rpe === 9);

    const del1 = await S.c.from('workout_logs').delete().eq('id', setId);
    const del2 = await S.c.from('workout_logs').delete().eq('id', setId);
    check('deleting a set twice is not an error', !del1.error && !del2.error);

    // ---- food in the diary ----
    const logRow = must(await S.c.from('daily_logs').upsert({ client_id: S.id, log_date: TEST_DATE }, { onConflict: 'client_id,log_date' }).select('id').single(), 'S daily log');
    createdDailyLogs.push(logRow.id);
    const logAgain = must(await S.c.from('daily_logs').upsert({ client_id: S.id, log_date: TEST_DATE }, { onConflict: 'client_id,log_date' }).select('id').single(), 'S daily log again');
    check('getting or creating the day twice gives the same day', logAgain.id === logRow.id);
    const oLog = must(await O.c.from('daily_logs').upsert({ client_id: O.id, log_date: TEST_DATE }, { onConflict: 'client_id,log_date' }).select('id').single(), 'O daily log');
    createdDailyLogs.push(oLog.id);

    const mkEntry = (extra) => ({ id: uuid(), daily_log_id: logRow.id, food_id: null, portions: 1, meal_section_id: null, created_at: threeHoursAgo, quick_add_name: TEST_DATE + ' test', quick_add_calories: 200, quick_add_protein: 10, quick_add_carbs: 20, quick_add_fat: 5, ...extra });
    const e1 = mkEntry();
    check('a member inserts a diary row with their own id and time', (await insertOnce(S.c, 'food_diary_entries', [e1])) === 'inserted');
    const eBack = must(await admin.from('food_diary_entries').select('id, created_at').eq('id', e1.id).single(), 'read entry');
    check('the server keeps that id and time', eBack.id === e1.id && Math.abs(new Date(eBack.created_at) - new Date(threeHoursAgo)) < 1000, eBack.created_at);
    check('a repeat of the same diary insert is recognised as already saved', (await insertOnce(S.c, 'food_diary_entries', [e1])) === 'already there');

    const stolenEntry = await insertOnce(O.c, 'food_diary_entries', [{ ...e1, daily_log_id: oLog.id }]);
    check("another member inserting with this member's diary row id is a failure", stolenEntry === 'failed:23505', stolenEntry);
    const peekEntry = await O.c.from('food_diary_entries').select('id').eq('id', e1.id);
    check("and cannot read that diary row", (peekEntry.data ?? []).length === 0);

    const batch = [mkEntry(), mkEntry(), mkEntry()];
    check('a batch of three rows inserts', (await insertOnce(S.c, 'food_diary_entries', batch)) === 'inserted');
    check('repeating the whole batch is recognised as already saved', (await insertOnce(S.c, 'food_diary_entries', batch)) === 'already there');
    const fresh = mkEntry();
    const mixed = await insertOnce(S.c, 'food_diary_entries', [batch[0], fresh]);
    const freshThere = (must(await admin.from('food_diary_entries').select('id').eq('id', fresh.id), 'fresh')).length;
    check('a batch with one old and one new row fails as a whole (all or nothing), and the new row is not saved', mixed === 'failed:23505' && freshThere === 0, mixed + ' / ' + freshThere);

    const p1 = await S.c.from('food_diary_entries').update({ portions: 150 }).eq('id', e1.id);
    const p2 = await S.c.from('food_diary_entries').update({ portions: 150 }).eq('id', e1.id);
    const pBack = must(await admin.from('food_diary_entries').select('portions').eq('id', e1.id).single(), 'portions');
    check('changing the amount twice gives the same result', !p1.error && !p2.error && Number(pBack.portions) === 150);
    const r1 = await S.c.from('food_diary_entries').delete().eq('id', e1.id);
    const r2 = await S.c.from('food_diary_entries').delete().eq('id', e1.id);
    check('removing a diary row twice is not an error', !r1.error && !r2.error);

    // ---- the daily check-in ----
    const patch = { client_id: S.id, log_date: TEST_DATE, sleep: 7.5, steps: 8000 };
    const u1 = await S.c.from('daily_logs').upsert(patch, { onConflict: 'client_id,log_date' });
    const u2 = await S.c.from('daily_logs').upsert(patch, { onConflict: 'client_id,log_date' });
    const rows = must(await admin.from('daily_logs').select('id, sleep, steps').eq('client_id', S.id).eq('log_date', TEST_DATE), 'daily rows');
    check('saving the same check-in figures twice leaves one day with those figures', !u1.error && !u2.error && rows.length === 1 && Number(rows[0].sleep) === 7.5 && rows[0].steps === 8000);
    const u3 = await S.c.from('daily_logs').upsert({ client_id: S.id, log_date: TEST_DATE, water: 2 }, { onConflict: 'client_id,log_date' });
    const rows2 = must(await admin.from('daily_logs').select('sleep, steps, water').eq('client_id', S.id).eq('log_date', TEST_DATE), 'daily rows 2');
    check('a later change to one figure leaves the others alone', !u3.error && Number(rows2[0].sleep) === 7.5 && rows2[0].steps === 8000 && Number(rows2[0].water) === 2);
  } finally {
    for (const id of createdLogs) await admin.from('workout_logs').delete().eq('id', id);
    for (const id of createdDailyLogs) await admin.from('daily_logs').delete().eq('id', id); // takes the diary rows with it
    await admin.from('daily_logs').delete().eq('log_date', TEST_DATE).in('client_id', [S.id, O.id]);
  }

  console.log('\n' + failures.length + ' failure(s)');
  for (const f of failures) console.log('  FAIL:', f);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(2); });
